import {
  DEFAULT_TTL_DAYS,
  MAX_ITEMS_PER_PUSH,
  PULL_PAGE_SIZE,
  TOMBSTONE_DAYS,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type WireItem,
  type WireSetting,
} from '../src/sync/protocol'
import { requireCron, requireDevice } from './auth'
import { getDb, type Db } from './db'
import { HttpError, json, readJson, readText } from './http'
import { pushToDevices } from './push'
import { getScheduler, verifyJob } from './scheduler'

const DAY = 86_400_000
/** Changes within this window are announced in one push (FR5). */
export const NOTIFY_BATCH_MS = 60_000
/** A device clock this far ahead of the server is rejected, so one bad clock can't lock items forever. */
const MAX_FUTURE_MS = DAY
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ttlDays(): number {
  const n = Number(process.env.DONE_TTL_DAYS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_DAYS
}

type Row = Record<string, unknown>
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function toWireItem(r: Row): WireItem {
  return {
    id: String(r.id),
    ciphertext: String(r.ciphertext),
    deadlineAt: num(r.deadline_at),
    remindAt: num(r.remind_at),
    doneAt: num(r.done_at),
    deletedAt: num(r.deleted_at),
    updatedAt: Number(r.updated_at),
  }
}

// ---------- Validation ----------

function optTime(v: unknown, field: string): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new HttpError(400, `Bad ${field}`)
  return Math.round(v)
}

function validItem(raw: unknown, now: number): WireItem {
  const r = raw as Partial<WireItem>
  if (typeof r?.id !== 'string' || !UUID.test(r.id)) throw new HttpError(400, 'Bad item id')
  if (typeof r.ciphertext !== 'string' || r.ciphertext.length > 8192) throw new HttpError(400, 'Bad ciphertext')
  const updatedAt = optTime(r.updatedAt, 'updatedAt')
  if (updatedAt === null || updatedAt > now + MAX_FUTURE_MS) throw new HttpError(400, 'Bad updatedAt')
  const deletedAt = optTime(r.deletedAt, 'deletedAt')
  return {
    id: r.id.toLowerCase(),
    // Tombstones keep only id and timestamps.
    ciphertext: deletedAt ? '' : r.ciphertext,
    deadlineAt: optTime(r.deadlineAt, 'deadlineAt'),
    remindAt: optTime(r.remindAt, 'remindAt'),
    doneAt: optTime(r.doneAt, 'doneAt'),
    deletedAt,
    updatedAt,
  }
}

function validSetting(raw: unknown, now: number): WireSetting {
  const r = raw as Partial<WireSetting>
  if (typeof r?.key !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(r.key)) throw new HttpError(400, 'Bad setting key')
  if (typeof r.ciphertext !== 'string' || r.ciphertext.length > 262_144) throw new HttpError(400, 'Bad setting')
  const updatedAt = optTime(r.updatedAt, 'updatedAt')
  if (updatedAt === null || updatedAt > now + MAX_FUTURE_MS) throw new HttpError(400, 'Bad updatedAt')
  return { key: r.key, ciphertext: r.ciphertext, updatedAt }
}

// ---------- GET /api/sync ----------

export async function pull(request: Request): Promise<Response> {
  const db = await getDb()
  await requireDevice(db, request)
  const since = Number(new URL(request.url).searchParams.get('since') ?? 0)
  if (!Number.isFinite(since) || since < 0) throw new HttpError(400, 'Bad since')

  const rows = await db.query(
    `SELECT id, ciphertext, deadline_at, remind_at, done_at, deleted_at, updated_at, rev
     FROM items WHERE rev > $1 ORDER BY rev LIMIT $2`,
    [since, PULL_PAGE_SIZE],
  )
  const settings = await db.query('SELECT key, ciphertext, updated_at, rev FROM settings WHERE rev > $1', [since])
  const revs = [...rows, ...settings].map((r) => Number(r.rev))
  const body: PullResponse = {
    items: rows.map(toWireItem),
    settings: settings.map((r) => ({ key: String(r.key), ciphertext: String(r.ciphertext), updatedAt: Number(r.updated_at) })),
    // With a full page of items, settings beyond the last item rev are fetched next page.
    cursor: rows.length === PULL_PAGE_SIZE ? Number(rows[rows.length - 1].rev) : Math.max(since, ...revs),
    hasMore: rows.length === PULL_PAGE_SIZE,
    serverTime: Date.now(),
    ttlDays: ttlDays(),
  }
  return json(body)
}

// ---------- POST /api/sync ----------

export async function push(request: Request): Promise<Response> {
  const db = await getDb()
  await requireDevice(db, request)
  const body = await readJson<PushRequest>(request)
  const now = Date.now()
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.slice(0, 64) : ''
  if (!deviceId) throw new HttpError(400, 'Missing deviceId')
  const items = Array.isArray(body.items) ? body.items : []
  const settings = Array.isArray(body.settings) ? body.settings : []
  if (items.length > MAX_ITEMS_PER_PUSH || settings.length > 50) throw new HttpError(413, 'Too many changes in one request')
  const validItems = items.map((i) => validItem(i, now))
  const validSettings = settings.map((s) => validSetting(s, now))

  const accepted: string[] = []
  for (const item of validItems) {
    const [prev] = await db.query('SELECT remind_at, reminder_msg_id FROM items WHERE id = $1', [item.id])
    const won = await db.query(
      `INSERT INTO items (id, ciphertext, deadline_at, remind_at, done_at, deleted_at, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         ciphertext = EXCLUDED.ciphertext, deadline_at = EXCLUDED.deadline_at, remind_at = EXCLUDED.remind_at,
         done_at = EXCLUDED.done_at, deleted_at = EXCLUDED.deleted_at, updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by, rev = nextval('rev_seq')
       WHERE items.updated_at < EXCLUDED.updated_at
       RETURNING id`,
      [item.id, item.ciphertext, item.deadlineAt, item.remindAt, item.doneAt, item.deletedAt, item.updatedAt, deviceId],
    )
    if (won.length === 0) continue // Older than what the server has: last write wins.
    accepted.push(item.id)
    await syncReminder(db, item, prev, now)
  }

  for (const s of validSettings) {
    await db.query(
      `INSERT INTO settings (key, ciphertext, updated_at, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by, rev = nextval('rev_seq')
       WHERE settings.updated_at < EXCLUDED.updated_at`,
      [s.key, s.ciphertext, s.updatedAt, deviceId],
    )
  }

  if (accepted.length > 0) await queueNotify(db, accepted, deviceId, now)
  await db.query('UPDATE push_subscriptions SET last_seen_at = $1 WHERE device_id = $2', [now, deviceId])

  const res: PushResponse = { accepted, serverTime: now }
  return json(res)
}

/** Keeps the scheduled reminder (FR3) in step with the item: edits reschedule, done/delete cancels. */
async function syncReminder(db: Db, item: WireItem, prev: Row | undefined, now: number) {
  const wanted = item.remindAt && item.remindAt > now && !item.doneAt && !item.deletedAt ? item.remindAt : null
  const prevAt = num(prev?.remind_at)
  const prevMsg = (prev?.reminder_msg_id as string | null) ?? null
  if (prevMsg && wanted === prevAt) return // Unchanged and still scheduled.
  const scheduler = getScheduler()
  if (prevMsg) await scheduler.cancel(prevMsg)
  const msgId = wanted ? await scheduler.schedule('/api/jobs/remind', { id: item.id, at: wanted }, wanted) : null
  await db.query('UPDATE items SET reminder_msg_id = $1 WHERE id = $2', [msgId, item.id])
}

/** Records changes and makes sure one batched "list updated" push is scheduled (FR5). */
async function queueNotify(db: Db, ids: string[], deviceId: string, now: number) {
  for (const id of ids) {
    await db.query('INSERT INTO notify_queue (item_id, device_id, created_at) VALUES ($1, $2, $3)', [id, deviceId, now])
  }
  const [due] = await db.query<{ value: string }>("SELECT value FROM app_state WHERE key = 'notify_due'")
  if (due && Number(due.value) > now) return // A batch is already scheduled.
  const at = now + NOTIFY_BATCH_MS
  await getScheduler().schedule('/api/jobs/notify', {}, at)
  await db.query(
    "INSERT INTO app_state (key, value) VALUES ('notify_due', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [String(at)],
  )
}

// ---------- Jobs ----------

/** QStash calls this at an item's reminder time. */
export async function remindJob(request: Request): Promise<Response> {
  const text = await readText(request)
  await verifyJob(request, text)
  const { id, at } = JSON.parse(text) as { id: string; at: number }
  const db = await getDb()
  const [item] = await db.query('SELECT remind_at, done_at, deleted_at FROM items WHERE id = $1', [id])
  // Stale if the item changed since this job was scheduled.
  if (!item || item.done_at || item.deleted_at || num(item.remind_at) !== at) return json({ skipped: true })
  await db.query('UPDATE items SET reminder_msg_id = NULL WHERE id = $1', [id])
  const sent = await pushToDevices(db, () => ({ t: 'reminder', id }))
  return json({ sent })
}

/** QStash calls this 60 seconds after the first change in a batch. */
export async function notifyJob(request: Request): Promise<Response> {
  const text = await readText(request)
  await verifyJob(request, text)
  const db = await getDb()
  const rows = await db.query<{ item_id: string; device_id: string }>('DELETE FROM notify_queue RETURNING item_id, device_id')
  await db.query("DELETE FROM app_state WHERE key = 'notify_due'")
  if (rows.length === 0) return json({ sent: 0 })

  const sent = await pushToDevices(db, (deviceId) => {
    // Each device hears only about changes made elsewhere.
    const ids = [...new Set(rows.filter((r) => r.device_id !== deviceId).map((r) => String(r.item_id)))]
    if (ids.length === 0) return null
    return { t: 'changes', ids: ids.slice(0, 20), more: Math.max(0, ids.length - 20) }
  })
  return json({ sent })
}

/** Daily Vercel Cron (FR7): done items older than the TTL become tombstones; old tombstones go. */
export async function cleanupCron(request: Request): Promise<Response> {
  requireCron(request)
  const db = await getDb()
  const now = Date.now()
  const expired = await db.query(
    `UPDATE items SET ciphertext = '', deleted_at = $1, updated_at = $1, updated_by = 'cleanup',
       remind_at = NULL, rev = nextval('rev_seq')
     WHERE done_at IS NOT NULL AND done_at < $2 AND deleted_at IS NULL
     RETURNING id`,
    [now, now - ttlDays() * DAY],
  )
  const purged = await db.query('DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < $1 RETURNING id', [
    now - TOMBSTONE_DAYS * DAY,
  ])
  await db.query('DELETE FROM auth_failures WHERE window_start < $1', [now - DAY])
  await db.query('DELETE FROM notify_queue WHERE created_at < $1', [now - DAY])
  return json({ expired: expired.length, purged: purged.length })
}
