import { db, type Item, type Routine } from './db'
import { nextOccurrence, occurrenceDay, type Schedule } from './routine'

/** How many occurrences one pass may step through (a daily routine idle for over a year). */
const MAX_STEPS = 500

/**
 * A to-do's id for a routine occurrence: the same on every device (so two
 * devices creating it at once make one item), derived from the routine and
 * the local date it falls on.
 */
export async function occurrenceId(routineId: string, occurrence: number): Promise<string> {
  const day = new Date(occurrence)
  const key = `${routineId}:${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))).slice(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x50 // version 5 (name-based)
  hash[8] = (hash[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export interface DueState {
  /** The latest occurrence whose day has begun and that hasn't been created yet. */
  due: number | null
  /** When the server should push next: a due occurrence later today, else the next upcoming one. */
  nextAt: number | null
}

/**
 * Works out what a routine needs now. An occurrence's to-do appears at the start
 * of its day (so today's routines are on the list in the morning) and is due at
 * the occurrence time. Missed occurrences aren't backfilled: only the latest.
 */
export function dueState(schedule: Schedule, lastGeneratedFor: number | null, createdAt: number, now: number): DueState {
  let after = lastGeneratedFor ?? createdAt - 1
  let due: number | null = null
  let next = nextOccurrence(schedule, after)
  for (let i = 0; i < MAX_STEPS && next !== null && occurrenceDay(next) <= now; i++) {
    due = next
    after = next
    next = nextOccurrence(schedule, after)
  }
  return { due, nextAt: due !== null && due > now ? due : next }
}

/**
 * Creates the due to-do for every active routine and keeps each routine's
 * `nextAt` current. Returns how many to-dos were created.
 */
export async function generateDue(now: number): Promise<number> {
  const routines = (await db.routines.toArray()).filter((r) => !r.deletedAt)
  let created = 0
  for (const r of routines) {
    const state: DueState = r.paused ? { due: null, nextAt: null } : dueState(r.schedule, r.lastGeneratedFor, r.createdAt, now)

    if (state.due !== null) {
      const id = await occurrenceId(r.id, state.due)
      // Fixed timestamp (start of that day): a later delete or tick-off always wins over a re-creation.
      const stamp = occurrenceDay(state.due)
      const item: Item = {
        id,
        name: r.name,
        type: r.type,
        section: r.section,
        priority: r.priority,
        routineId: r.id,
        deadlineAt: state.due,
        remindAt: null,
        doneAt: null,
        deletedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
        dirty: 1,
      }
      const added = await db.transaction('rw', db.items, async () => {
        if (await db.items.get(id)) return false // Already here, from this or another device (or deleted).
        await db.items.add(item)
        return true
      })
      if (added) created++
    }

    const lastGeneratedFor = state.due ?? r.lastGeneratedFor
    if (lastGeneratedFor !== r.lastGeneratedFor || state.nextAt !== r.nextAt) {
      await db.routines.update(r.id, { lastGeneratedFor, nextAt: state.nextAt, updatedAt: Math.max(now, r.updatedAt + 1), dirty: 1 } satisfies Partial<Routine>)
    }
  }
  return created
}
