// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pgliteDb, setDbForTests } from '../../server/db'
import { handle } from '../../server/http'
import { setSchedulerForTests } from '../../server/scheduler'
import { pull, push } from '../../server/sync'
import { deriveKeys, generateVaultKey, tokenHash } from './vault'

const GET = handle(pull)
const POST = handle(push)
const DAY = 86_400_000

/** Shifts the server's clock as seen by one device, to simulate a device clock that's off. */
let serverSkew = 0

function installFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), 'http://test'), { ...init, headers: { ...init?.headers, 'x-forwarded-for': '1.1.1.1' } })
    const res = await (request.method === 'POST' ? POST : GET)(request)
    if (!serverSkew) return res
    const body = (await res.json()) as { serverTime?: number }
    if (body.serverTime) body.serverTime += serverSkew
    return new Response(JSON.stringify(body), { status: res.status, headers: res.headers })
  }) as typeof fetch
}

type Device = Awaited<ReturnType<typeof makeDevice>>

/** A fresh copy of the app's modules with its own IndexedDB: one simulated device. */
async function makeDevice(vaultKey: string) {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  const dbMod = await import('../db')
  const engine = await import('./engine')
  const store = await import('../store')
  await engine.setVaultKey(vaultKey)
  const live = async () => (await dbMod.db.items.toArray()).filter((i) => !i.deletedAt)
  return { db: dbMod.db, engine, store, live, names: async () => (await live()).map((i) => i.name).sort() }
}

let vaultKey: string
let phone: Device
let mac: Device

beforeEach(async () => {
  await setDbForTests(await pgliteDb())
  setSchedulerForTests({ schedule: async () => 'job', cancel: async () => {} })
  vaultKey = generateVaultKey()
  process.env.VAULT_TOKEN_HASH = await tokenHash((await deriveKeys(vaultKey)).token)
  serverSkew = 0
  installFetch()
  phone = await makeDevice(vaultKey)
  mac = await makeDevice(vaultKey)
})

afterEach(async () => {
  await setDbForTests(null)
  setSchedulerForTests(null)
})

describe('sync between devices', () => {
  it('sends items, decrypted, to another device', async () => {
    await phone.store.addFromInput('milk, call plumber')
    await phone.engine.syncNow()
    await mac.engine.syncNow()
    expect(await mac.names()).toEqual(['call plumber', 'milk'])
    expect((await mac.db.items.toArray()).find((i) => i.name === 'milk')).toMatchObject({ type: 'grocery', section: 'Dairy & eggs', dirty: 0 })
    expect(phone.engine.getSyncStatus().status).toBe('synced')
  })

  it('syncs parsed deadlines, reminders and priority (priority encrypted)', async () => {
    await phone.store.addFromInput('wash shoe tomorrow urgent, remind at 6pm')
    await phone.engine.syncNow()
    await mac.engine.syncNow()
    const [wash] = await mac.db.items.toArray()
    expect(wash).toMatchObject({ name: 'wash shoe', priority: 'high' })
    expect(wash.deadlineAt).not.toBeNull()
    expect(wash.remindAt).not.toBeNull()
  })

  it('syncs category corrections as a setting', async () => {
    await phone.store.addFromInput('tofu')
    const [tofu] = await phone.db.items.toArray()
    await phone.store.setCategory(tofu, { type: 'grocery', section: 'Produce' })
    await phone.engine.syncNow()
    await mac.engine.syncNow()
    expect(await mac.store.getOverrides()).toEqual({ tofu: 'Produce' })
  })

  it('resolves offline edits on two devices by last write wins', async () => {
    await phone.store.addFromInput('eggs')
    await phone.engine.syncNow()
    await mac.engine.syncNow()
    const [onPhone] = await phone.db.items.toArray()
    const [onMac] = await mac.db.items.toArray()

    await phone.store.updateItem(onPhone.id, { name: 'eggs (phone)' })
    await new Promise((r) => setTimeout(r, 5))
    await mac.store.updateItem(onMac.id, { name: 'eggs (mac, later)' })

    await mac.engine.syncNow()
    await phone.engine.syncNow() // phone's older edit is rejected; it pulls the mac's
    await mac.engine.syncNow()
    expect(await phone.names()).toEqual(['eggs (mac, later)'])
    expect(await mac.names()).toEqual(['eggs (mac, later)'])
  })

  it('propagates deletes, and Undo restores everywhere', async () => {
    await phone.store.addFromInput('bread')
    await phone.engine.syncNow()
    await mac.engine.syncNow()
    const [bread] = await phone.db.items.toArray()

    await phone.store.deleteItem(bread.id)
    await phone.engine.syncNow()
    await mac.engine.syncNow()
    expect(await mac.names()).toEqual([])

    await phone.store.restoreItem(bread.id)
    await phone.engine.syncNow()
    await mac.engine.syncNow()
    expect(await mac.names()).toEqual(['bread'])
  })

  it('corrects for a device clock that is off', async () => {
    serverSkew = 3_600_000 // This device's clock is an hour behind the server.
    await phone.engine.syncNow()
    expect(phone.engine.syncedNow() - Date.now()).toBeGreaterThan(3_590_000)
  })

  it('reports unauthorized with the wrong vault key', async () => {
    const stranger = await makeDevice(generateVaultKey())
    await stranger.store.addFromInput('secret')
    await stranger.engine.syncNow()
    expect(stranger.engine.getSyncStatus().status).toBe('unauthorized')
    expect((await stranger.db.items.toArray())[0].dirty).toBe(1)
  })

  it('drops synced done items past the TTL', async () => {
    await phone.store.addFromInput('old thing')
    const [old] = await phone.db.items.toArray()
    await phone.db.items.update(old.id, { doneAt: Date.now() - 8 * DAY, dirty: 1 })
    await phone.engine.syncNow()
    expect(await phone.db.items.count()).toBe(0)
  })
})

describe('rotating the vault', () => {
  it('re-uploads everything under a new vault key so new devices can read it', async () => {
    await phone.store.addFromInput('milk, call plumber')
    await phone.engine.syncNow()

    // Revoke: the phone creates a new vault and the server switches to its token.
    const newKey = generateVaultKey()
    process.env.VAULT_TOKEN_HASH = await tokenHash((await deriveKeys(newKey)).token)
    await phone.engine.setVaultKey(newKey, { newVault: true })
    await phone.engine.syncNow()

    const fresh = await makeDevice(newKey)
    await fresh.engine.syncNow()
    expect(await fresh.names()).toEqual(['call plumber', 'milk'])

    // The old key no longer works.
    await mac.engine.syncNow()
    expect(mac.engine.getSyncStatus().status).toBe('unauthorized')
  })
})
