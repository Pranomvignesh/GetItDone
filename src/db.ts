import Dexie, { type EntityTable } from 'dexie'
import type { ItemType, Section } from './categories'

export interface Item {
  id: string
  name: string
  type: ItemType
  section?: Section
  deadlineAt: number | null
  remindAt: number | null
  doneAt: number | null
  /** Soft delete, so the delete can sync to other devices (M2). */
  deletedAt: number | null
  createdAt: number
  updatedAt: number
  /** 1 while the change hasn't been pushed to the server. */
  dirty: 0 | 1
}

export interface Setting {
  key: string
  value: unknown
  updatedAt: number
  dirty: 0 | 1
}

export const db = new Dexie('get-it-done') as Dexie & {
  items: EntityTable<Item, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  items: 'id, updatedAt, dirty',
  settings: 'key, dirty',
})
