import type { ItemType, Section } from '../categories'
import { db, getLocal, setLocal, type Item, type Setting } from '../db'
import {
  DEFAULT_TTL_DAYS,
  MAX_ITEMS_PER_PUSH,
  TOMBSTONE_DAYS,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type WireItem,
} from './protocol'
import { decryptJson, deriveKeys, encryptJson, type VaultKeys } from './vault'

/**
 * Local-first sync (FR4). Every change is written to IndexedDB first and marked
 * dirty; a sync pushes dirty rows (encrypted) and pulls rows changed since the
 * last cursor. Conflicts resolve per item by last write wins on updatedAt.
 *
 * Runs in pages and in the service worker (push-triggered background pull), so
 * it only uses APIs both have: fetch, IndexedDB and Web Crypto.
 */

export type SyncStatus = 'locked' | 'offline' | 'syncing' | 'synced' | 'unauthorized' | 'error'

const DAY = 86_400_000
const API = '/api/sync'

/** The encrypted part of an item. */
interface ItemSecret {
  name: string
  type: ItemType
  section?: Section
  createdAt: number
}

// ---------- Status ----------

export interface SyncState {
  status: SyncStatus
  lastSyncedAt: number | null
}

// Replaced (never mutated) on change, so React's useSyncExternalStore sees a stable snapshot.
let state: SyncState = { status: 'synced', lastSyncedAt: null }
const listeners = new Set<() => void>()

function setStatus(status: SyncStatus) {
  if (status === state.status && status !== 'synced') return
  state = { status, lastSyncedAt: status === 'synced' ? Date.now() : state.lastSyncedAt }
  listeners.forEach((l) => l())
}

export function getSyncStatus(): SyncState {
  return state
}

export function onSyncStatus(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

// ---------- Vault and device ----------

let cachedKeys: { vaultKey: string; keys: VaultKeys } | null = null

export async function getVaultKey(): Promise<string | undefined> {
  return getLocal<string>('vaultKey')
}

export async function vaultKeys(): Promise<VaultKeys | null> {
  const vaultKey = await getVaultKey()
  if (!vaultKey) return null
  if (cachedKeys?.vaultKey !== vaultKey) cachedKeys = { vaultKey, keys: await deriveKeys(vaultKey) }
  return cachedKeys.keys
}

/**
 * Stores the vault key on this device and resets the sync cursor so everything is pulled.
 *
 * Everything local is queued for upload under this key. For a brand-new vault
 * (`newVault`, e.g. rotating to revoke other devices) timestamps are bumped too,
 * so the copies encrypted with the new key replace the server's old ones. When
 * pairing with an existing vault they're kept, so newer edits elsewhere still win.
 */
export async function setVaultKey(vaultKey: string, { newVault = false } = {}) {
  await loadClock()
  const now = syncedNow()
  await db.transaction('rw', db.items, db.settings, db.local, async () => {
    await setLocal('vaultKey', vaultKey)
    await setLocal('cursor', 0)
    await db.items.toCollection().modify((i) => {
      i.dirty = 1
      if (newVault) i.updatedAt = Math.max(i.updatedAt + 1, now)
    })
    await db.settings.toCollection().modify((s) => {
      s.dirty = 1
      if (newVault) s.updatedAt = Math.max(s.updatedAt + 1, now)
    })
  })
  cachedKeys = null
}

/** Forgets the vault on this device (local data stays; nothing syncs until re-paired). */
export async function clearVaultKey() {
  await db.local.bulkDelete(['vaultKey', 'cursor'])
  cachedKeys = null
  setStatus('locked')
}

export async function getDeviceId(): Promise<string> {
  let id = await getLocal<string>('deviceId')
  if (!id) {
    id = crypto.randomUUID()
    await setLocal('deviceId', id)
  }
  return id
}

// ---------- Clock ----------

let clockOffset = 0
let clockLoaded = false

async function loadClock() {
  if (clockLoaded) return
  clockOffset = (await getLocal<number>('clockOffset')) ?? 0
  clockLoaded = true
}

/**
 * Device time corrected by the server's clock, so timestamps from devices whose
 * clocks disagree still order correctly for last-write-wins.
 */
export function syncedNow(): number {
  return Date.now() + clockOffset
}

async function learnServerTime(serverTime: number, sentAt: number) {
  // Assume the server answered halfway through the round trip.
  const offset = Math.round(serverTime - (sentAt + Date.now()) / 2)
  if (Math.abs(offset - clockOffset) > 1000) {
    clockOffset = offset
    await setLocal('clockOffset', offset)
  }
}

// ---------- Sync ----------

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new HttpStatusError(res.status)
  return (await res.json()) as T
}

async function toWire(keys: VaultKeys, item: Item): Promise<WireItem> {
  const secret: ItemSecret = { name: item.name, type: item.type, section: item.section, createdAt: item.createdAt }
  return {
    id: item.id,
    ciphertext: item.deletedAt ? '' : await encryptJson(keys.dataKey, secret, item.id),
    deadlineAt: item.deadlineAt,
    remindAt: item.remindAt,
    doneAt: item.doneAt,
    deletedAt: item.deletedAt,
    updatedAt: item.updatedAt,
  }
}

async function pushChanges(keys: VaultKeys) {
  const deviceId = await getDeviceId()
  for (;;) {
    const items = await db.items.where('dirty').equals(1).limit(MAX_ITEMS_PER_PUSH).toArray()
    const settings = await db.settings.where('dirty').equals(1).toArray()
    if (items.length === 0 && settings.length === 0) return

    const body: PushRequest = {
      deviceId,
      items: await Promise.all(items.map((i) => toWire(keys, i))),
      settings: await Promise.all(
        settings.map(async (s) => ({ key: s.key, ciphertext: await encryptJson(keys.dataKey, s.value, s.key), updatedAt: s.updatedAt })),
      ),
    }
    const sentAt = Date.now()
    const res = await api<PushResponse>(keys.token, API, { method: 'POST', body: JSON.stringify(body) })
    await learnServerTime(res.serverTime, sentAt)

    // Clear dirty only where nothing changed while the request was in flight.
    await db.transaction('rw', db.items, db.settings, async () => {
      for (const sent of items) {
        const now = await db.items.get(sent.id)
        // Deleted rows stay (hidden) as local tombstones so Undo still works; cleanupLocal drops them later.
        if (now?.updatedAt === sent.updatedAt) await db.items.update(now.id, { dirty: 0 })
      }
      for (const sent of settings) {
        const now = await db.settings.get(sent.key)
        if (now?.updatedAt === sent.updatedAt) await db.settings.update(sent.key, { dirty: 0 })
      }
    })
    if (items.length < MAX_ITEMS_PER_PUSH) return
  }
}

/** Applies one remote item if it's newer than ours. Returns what happened, for push notifications. */
async function applyRemote(keys: VaultKeys, w: WireItem): Promise<'added' | 'updated' | 'deleted' | null> {
  const local = await db.items.get(w.id)
  if (local && local.updatedAt >= w.updatedAt) return null // Ours is newer (or the same): keep it.

  if (w.deletedAt) {
    if (!local) return null
    await db.items.delete(w.id)
    return 'deleted'
  }
  let secret: ItemSecret
  try {
    secret = await decryptJson<ItemSecret>(keys.dataKey, w.ciphertext, w.id)
  } catch {
    console.warn('Could not decrypt item', w.id)
    return null
  }
  await db.items.put({
    id: w.id,
    name: secret.name,
    type: secret.type,
    section: secret.section,
    createdAt: secret.createdAt ?? w.updatedAt,
    deadlineAt: w.deadlineAt,
    remindAt: w.remindAt,
    doneAt: w.doneAt,
    deletedAt: null,
    updatedAt: w.updatedAt,
    dirty: 0,
  })
  return local ? 'updated' : 'added'
}

export interface PullResult {
  changes: { id: string; kind: 'added' | 'updated' | 'deleted' }[]
}

async function pullChanges(keys: VaultKeys): Promise<PullResult> {
  const changes: PullResult['changes'] = []
  for (;;) {
    const since = (await getLocal<number>('cursor')) ?? 0
    const sentAt = Date.now()
    const res = await api<PullResponse>(keys.token, `${API}?since=${since}`)
    await learnServerTime(res.serverTime, sentAt)

    for (const w of res.items) {
      const kind = await applyRemote(keys, w)
      if (kind) changes.push({ id: w.id, kind })
    }
    for (const s of res.settings) {
      const local = await db.settings.get(s.key)
      if (local && local.updatedAt >= s.updatedAt) continue
      try {
        const value = await decryptJson(keys.dataKey, s.ciphertext, s.key)
        await db.settings.put({ key: s.key, value, updatedAt: s.updatedAt, dirty: 0 } satisfies Setting)
      } catch {
        console.warn('Could not decrypt setting', s.key)
      }
    }
    await setLocal('cursor', res.cursor)
    await setLocal('ttlDays', res.ttlDays)
    if (!res.hasMore) return { changes }
  }
}

/** FR7 on the device: drop done items past the TTL and old local tombstones, once synced. */
async function cleanupLocal() {
  const ttl = (await getLocal<number>('ttlDays')) ?? DEFAULT_TTL_DAYS
  const now = syncedNow()
  await db.items
    .filter((i) => i.dirty === 0 && ((i.doneAt !== null && i.doneAt < now - ttl * DAY) || (i.deletedAt !== null && i.deletedAt < now - TOMBSTONE_DAYS * DAY)))
    .delete()
}

let running: Promise<PullResult | null> | null = null
let again = false

/**
 * Pushes local changes, then pulls remote ones. Concurrent calls share one run
 * (plus one follow-up run if changes arrived meanwhile).
 */
export function syncNow(): Promise<PullResult | null> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      let result: PullResult | null
      do {
        again = false
        result = await syncOnce()
      } while (again)
      return result
    } finally {
      running = null
    }
  })()
  return running
}

async function syncOnce(): Promise<PullResult | null> {
  await loadClock()
  const keys = await vaultKeys()
  if (!keys) {
    setStatus('locked')
    return null
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus('offline')
    return null
  }
  setStatus('syncing')
  try {
    await pushChanges(keys)
    const result = await pullChanges(keys)
    await cleanupLocal()
    setStatus('synced')
    return result
  } catch (e) {
    if (e instanceof HttpStatusError) setStatus(e.status === 401 ? 'unauthorized' : 'error')
    else setStatus('offline') // fetch itself failed: no network or server unreachable.
    return null
  }
}

let debounce: ReturnType<typeof setTimeout> | null = null

/** Sync soon after a local change; rapid changes share one sync. */
export function requestSync() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    debounce = null
    void syncNow()
  }, 400)
}

/** Page only: sync on open, on focus, when back online and every 30 s while visible. */
export function startAutoSync(): () => void {
  const onVisible = () => document.visibilityState === 'visible' && void syncNow()
  const timer = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 30_000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', onVisible)
  window.addEventListener('offline', () => setStatus('offline'))
  void syncNow()
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('online', onVisible)
  }
}
