// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveKeys, generateVaultKey, tokenHash } from '../src/sync/vault'
import type { PullResponse, PushResponse, WireItem } from '../src/sync/protocol'
import { MAX_FAILURES } from './auth'
import { pgliteDb, setDbForTests, type Db } from './db'
import { setPushSenderForTests, type PushPayload } from './push'
import { setSchedulerForTests } from './scheduler'
import { cleanupCron, notifyJob, pull, push, remindJob } from './sync'
import { handle } from './http'

const DAY = 86_400_000
let db: Db
let token: string
let jobs: { id: string; path: string; body: unknown; at: number }[]
let cancelled: string[]
let pushes: { endpoint: string; payload: PushPayload }[]

const GET = handle(pull)
const POST = handle(push)

function req(method: string, path: string, body?: unknown, auth: string | null = token, ip = '1.1.1.1') {
  const headers: Record<string, string> = { 'x-forwarded-for': ip, 'content-type': 'application/json' }
  if (auth) headers.authorization = `Bearer ${auth}`
  if (path.startsWith('/api/jobs')) headers['x-local-job-secret'] = 'cron-secret'
  return new Request(`http://test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

function item(partial: Partial<WireItem> = {}): WireItem {
  return {
    id: crypto.randomUUID(),
    ciphertext: 'ct',
    deadlineAt: null,
    remindAt: null,
    doneAt: null,
    deletedAt: null,
    updatedAt: Date.now(),
    ...partial,
  }
}

async function sendItems(items: WireItem[], deviceId = 'phone') {
  const res = await POST(req('POST', '/api/sync', { deviceId, items, settings: [] }))
  return { status: res.status, body: (await res.json()) as PushResponse }
}

async function pullAll(since = 0) {
  const res = await GET(req('GET', `/api/sync?since=${since}`))
  return (await res.json()) as PullResponse
}

beforeEach(async () => {
  db = await pgliteDb()
  await setDbForTests(db)
  const keys = await deriveKeys(generateVaultKey())
  token = keys.token
  process.env.VAULT_TOKEN_HASH = await tokenHash(token)
  process.env.CRON_SECRET = 'cron-secret'
  delete process.env.DONE_TTL_DAYS
  jobs = []
  cancelled = []
  pushes = []
  setSchedulerForTests({
    schedule: async (path, body, at) => {
      const id = `job-${jobs.length}`
      jobs.push({ id, path, body, at })
      return id
    },
    cancel: async (id) => void cancelled.push(id),
  })
  setPushSenderForTests({
    send: async (sub, payload) => {
      pushes.push({ endpoint: sub.endpoint, payload })
      return 201
    },
  })
})

afterEach(() => {
  setDbForTests(null)
  setSchedulerForTests(null)
  setPushSenderForTests(null)
})

describe('auth', () => {
  it('rejects a missing or wrong token', async () => {
    expect((await GET(req('GET', '/api/sync', undefined, null))).status).toBe(401)
    expect((await GET(req('GET', '/api/sync', undefined, 'wrong'))).status).toBe(401)
    expect((await GET(req('GET', '/api/sync'))).status).toBe(200)
  })

  it('rate-limits a client after repeated failures, even with the right token', async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await GET(req('GET', '/api/sync', undefined, 'wrong', '9.9.9.9'))
    expect((await GET(req('GET', '/api/sync', undefined, token, '9.9.9.9'))).status).toBe(429)
    // Other clients are unaffected.
    expect((await GET(req('GET', '/api/sync', undefined, token, '8.8.8.8'))).status).toBe(200)
  })

  it('rejects everything when the server has no vault configured', async () => {
    delete process.env.VAULT_TOKEN_HASH
    expect((await GET(req('GET', '/api/sync'))).status).toBe(401)
  })
})

describe('sync', () => {
  it('stores pushed items and returns them on pull with a cursor', async () => {
    const a = item()
    const { body } = await sendItems([a])
    expect(body.accepted).toEqual([a.id])
    const first = await pullAll()
    expect(first.items).toEqual([a])
    expect(await pullAll(first.cursor)).toMatchObject({ items: [] })
  })

  it('keeps the newest write per item (last write wins)', async () => {
    const a = item({ updatedAt: 1000, ciphertext: 'new' })
    await sendItems([a])
    const { body } = await sendItems([{ ...a, updatedAt: 500, ciphertext: 'old' }], 'mac')
    expect(body.accepted).toEqual([])
    expect((await pullAll()).items[0].ciphertext).toBe('new')
    await sendItems([{ ...a, updatedAt: 2000, ciphertext: 'newer' }], 'mac')
    expect((await pullAll()).items[0].ciphertext).toBe('newer')
  })

  it('strips text from deleted items, leaving a tombstone', async () => {
    const a = item()
    await sendItems([a])
    await sendItems([{ ...a, deletedAt: Date.now(), updatedAt: a.updatedAt + 1 }])
    const [stored] = (await pullAll()).items
    expect(stored.ciphertext).toBe('')
    expect(stored.deletedAt).not.toBeNull()
  })

  it('rejects malformed input, oversized batches and far-future clocks', async () => {
    expect((await sendItems([{ ...item(), id: 'not-a-uuid' }])).status).toBe(400)
    expect((await sendItems([item({ updatedAt: Date.now() + 2 * DAY })])).status).toBe(400)
    expect((await sendItems(Array.from({ length: 501 }, () => item()))).status).toBe(413)
    const huge = new Request('http://test/api/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '1.1.1.1' },
      body: 'x'.repeat(1_100_000),
    })
    expect((await POST(huge)).status).toBe(413)
  })
})

describe('reminders', () => {
  it('schedules, reschedules and cancels with the item', async () => {
    const at = Date.now() + 3_600_000
    const a = item({ remindAt: at })
    await sendItems([a])
    expect(jobs).toMatchObject([{ path: '/api/jobs/remind', body: { id: a.id, at }, at }, { path: '/api/jobs/notify' }])

    const later = at + 60_000
    await sendItems([{ ...a, remindAt: later, updatedAt: a.updatedAt + 1 }])
    expect(cancelled).toEqual(['job-0'])
    expect(jobs.filter((j) => j.path === '/api/jobs/remind').at(-1)).toMatchObject({ at: later })

    await sendItems([{ ...a, remindAt: later, doneAt: Date.now(), updatedAt: a.updatedAt + 2 }])
    expect(cancelled).toHaveLength(2)
  })

  it('pushes a reminder only if the item still wants it', async () => {
    await db.query("INSERT INTO push_subscriptions (device_id, endpoint, keys, created_at, last_seen_at) VALUES ('phone', 'https://push/1', '{\"p256dh\":\"a\",\"auth\":\"b\"}', 0, 0)")
    const at = Date.now() + 1000
    const a = item({ remindAt: at })
    await sendItems([a])
    const run = (body: unknown) => handle(remindJob)(req('POST', '/api/jobs/remind', body))
    expect(await (await run({ id: a.id, at: at - 5 })).json()).toEqual({ skipped: true })
    expect(await (await run({ id: a.id, at })).json()).toEqual({ sent: 1 })
    expect(pushes[0].payload).toEqual({ t: 'reminder', id: a.id })
  })

  it('refuses job calls without the job secret', async () => {
    const r = new Request('http://test/api/jobs/remind', { method: 'POST', body: '{}' })
    expect((await handle(remindJob)(r)).status).toBe(401)
  })
})

describe('batched notifications', () => {
  it('queues one batch and tells each device only about changes made elsewhere', async () => {
    for (const [device, endpoint] of [['phone', 'https://push/phone'], ['mac', 'https://push/mac']]) {
      await db.query(
        "INSERT INTO push_subscriptions (device_id, endpoint, keys, created_at, last_seen_at) VALUES ($1, $2, '{\"p256dh\":\"a\",\"auth\":\"b\"}', 0, 0)",
        [device, endpoint],
      )
    }
    const a = item()
    const b = item()
    await sendItems([a], 'phone')
    await sendItems([b], 'phone')
    expect(jobs.filter((j) => j.path === '/api/jobs/notify')).toHaveLength(1)

    await handle(notifyJob)(req('POST', '/api/jobs/notify', {}))
    expect(pushes).toEqual([{ endpoint: 'https://push/mac', payload: { t: 'changes', ids: [a.id, b.id], more: 0 } }])
  })

  it('removes subscriptions the push service says are gone', async () => {
    await db.query("INSERT INTO push_subscriptions (device_id, endpoint, keys, created_at, last_seen_at) VALUES ('mac', 'https://push/gone', '{\"p256dh\":\"a\",\"auth\":\"b\"}', 0, 0)")
    setPushSenderForTests({ send: async () => 410 })
    await sendItems([item()], 'phone')
    await handle(notifyJob)(req('POST', '/api/jobs/notify', {}))
    expect(await db.query('SELECT * FROM push_subscriptions')).toEqual([])
  })
})

describe('cleanup cron', () => {
  it('turns old done items into tombstones and purges old tombstones', async () => {
    const now = Date.now()
    const oldDone = item({ doneAt: now - 8 * DAY, updatedAt: now - 8 * DAY })
    const recentDone = item({ doneAt: now - DAY, updatedAt: now - DAY })
    const oldTombstone = item({ deletedAt: now - 31 * DAY, updatedAt: now - 31 * DAY })
    await sendItems([oldDone, recentDone, oldTombstone])

    const unauth = await handle(cleanupCron)(new Request('http://test/api/cron/cleanup'))
    expect(unauth.status).toBe(401)
    const res = await handle(cleanupCron)(new Request('http://test/api/cron/cleanup', { headers: { authorization: 'Bearer cron-secret' } }))
    expect(await res.json()).toEqual({ expired: 1, purged: 1 })

    const items = (await pullAll()).items
    expect(items.find((i) => i.id === oldDone.id)).toMatchObject({ ciphertext: '', deletedAt: expect.any(Number) })
    expect(items.find((i) => i.id === recentDone.id)?.deletedAt).toBeNull()
    expect(items.find((i) => i.id === oldTombstone.id)).toBeUndefined()
  })

  it('uses DONE_TTL_DAYS when set', async () => {
    process.env.DONE_TTL_DAYS = '1'
    const now = Date.now()
    await sendItems([item({ doneAt: now - 2 * DAY, updatedAt: now - 2 * DAY })])
    const res = await handle(cleanupCron)(new Request('http://test/api/cron/cleanup', { headers: { authorization: 'Bearer cron-secret' } }))
    expect(await res.json()).toMatchObject({ expired: 1 })
  })
})
