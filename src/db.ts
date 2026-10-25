import Dexie, { type EntityTable } from 'dexie'
import type { ItemType, Section } from './categories'
import type { Schedule } from './routine'
import type { Priority } from './when'

export interface Item {
  id: string
  name: string
  type: ItemType
  section?: Section
  deadlineAt: number | null
  remindAt: number | null
  /** High items sort first, low last; normal when unset. Synced inside the encrypted text. */
  priority?: Priority
  /** Set on to-dos a routine created. */
  routineId?: string
  doneAt: number | null
  /** Soft delete, so the delete can sync to other devices. */
  deletedAt: number | null
  createdAt: number
  updatedAt: number
  /** 1 while the change hasn't been pushed to the server. */
  dirty: 0 | 1
}

/** A recurring item. Each occurrence becomes an ordinary to-do on its day. */
export interface Routine {
  id: string
  name: string
  type: ItemType
  section?: Section
  priority?: Priority
  schedule: Schedule
  paused: boolean
  /** The latest occurrence already turned into a to-do. */
  lastGeneratedFor: number | null
  /** Next occurrence time; the only part the server can read (it pushes then). */
  nextAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  dirty: 0 | 1
}

/** Synced settings (stored encrypted on the server), e.g. category corrections. */
export interface Setting {
  key: string
  value: unknown
  updatedAt: number
  dirty: 0 | 1
}

/** Device-only state, never synced: vault key, device id, sync cursor, clock offset. */
export interface LocalValue {
  key: string
  value: unknown
}

// Binding IndexedDB explicitly (same as the default in browsers) lets tests give each simulated device its own store.
export const db = new Dexie('get-it-done', { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange }) as Dexie & {
  items: EntityTable<Item, 'id'>
  settings: EntityTable<Setting, 'key'>
  local: EntityTable<LocalValue, 'key'>
  routines: EntityTable<Routine, 'id'>
}

db.version(1).stores({
  items: 'id, updatedAt, dirty',
  settings: 'key, dirty',
})

// v2 (M2 sync): device-only key/value table. Existing rows are untouched.
db.version(2).stores({
  items: 'id, updatedAt, dirty',
  settings: 'key, dirty',
  local: 'key',
})

// v3: routines.
db.version(3).stores({
  items: 'id, updatedAt, dirty',
  settings: 'key, dirty',
  local: 'key',
  routines: 'id, updatedAt, dirty',
})

export async function getLocal<T>(key: string): Promise<T | undefined> {
  return (await db.local.get(key))?.value as T | undefined
}

export async function setLocal(key: string, value: unknown): Promise<void> {
  await db.local.put({ key, value })
}
