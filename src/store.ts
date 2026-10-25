import { categoryKey, type Category } from './categories'
import { normalize, parseInput, type Overrides, type ParsedEntry } from './categorize'
import { db, type Item, type Routine } from './db'
import type { Schedule } from './routine'
import { requestSync, syncedNow } from './sync/engine'

const OVERRIDES_KEY = 'categoryOverrides'

export async function getOverrides(): Promise<Overrides> {
  return ((await db.settings.get(OVERRIDES_KEY))?.value as Overrides) ?? {}
}

export interface Added {
  items: Item[]
  routines: Routine[]
}

/** Adds everything typed in the add bar: one-off items, and routines for parts with a schedule. */
export async function addFromInput(raw: string): Promise<Added> {
  const now = syncedNow()
  const all = parseInput(raw, await getOverrides(), now)
  const parsed = all.filter((p) => !p.routine)
  const routines: Routine[] = all
    .filter((p) => p.routine)
    .map((p, i) => ({
      id: crypto.randomUUID(),
      name: p.name,
      type: p.category.type,
      section: p.category.section,
      priority: p.priority,
      schedule: p.routine!.schedule,
      paused: false,
      lastGeneratedFor: null,
      nextAt: null, // Worked out on the next sync pass (routineGen).
      createdAt: now + i,
      updatedAt: now + i,
      deletedAt: null,
      dirty: 1,
    }))
  if (routines.length) await db.routines.bulkAdd(routines)
  // Offset by index so items added together keep their typed order when sorted by newest.
  const items: Item[] = parsed.map((p, i) => ({
    id: crypto.randomUUID(),
    name: p.name,
    type: p.category.type,
    section: p.category.section,
    deadlineAt: p.deadlineAt,
    remindAt: p.remindAt,
    priority: p.priority,
    doneAt: null,
    deletedAt: null,
    createdAt: now + i,
    updatedAt: now + i,
    dirty: 1,
  }))
  if (items.length) await db.items.bulkAdd(items)
  requestSync()
  return { items, routines }
}

export async function updateRoutine(id: string, patch: Partial<Pick<Routine, 'name' | 'type' | 'section' | 'priority' | 'schedule' | 'paused'>>) {
  const now = syncedNow()
  const extra: Partial<Routine> = {}
  // Resuming doesn't backfill what was missed while paused.
  if (patch.paused === false) {
    const r = await db.routines.get(id)
    if (r?.paused) extra.lastGeneratedFor = Math.max(r.lastGeneratedFor ?? 0, now)
  }
  await db.routines.update(id, { ...patch, ...extra, nextAt: null, updatedAt: now, dirty: 1 })
  requestSync()
}

export function setRoutineSchedule(id: string, schedule: Schedule) {
  return updateRoutine(id, { schedule })
}

export async function deleteRoutine(id: string) {
  await db.routines.update(id, { deletedAt: syncedNow(), updatedAt: syncedNow(), dirty: 1 })
  requestSync()
}

export async function restoreRoutine(id: string) {
  await db.routines.update(id, { deletedAt: null, updatedAt: syncedNow(), dirty: 1 })
  requestSync()
}

export async function updateItem(id: string, patch: Partial<Omit<Item, 'id' | 'createdAt'>>) {
  await db.items.update(id, { ...patch, updatedAt: syncedNow(), dirty: 1 })
  requestSync()
}

export function toggleDone(item: Item) {
  // Checking off also clears a pending reminder; unchecking leaves it cleared.
  return updateItem(item.id, item.doneAt ? { doneAt: null } : { doneAt: syncedNow(), remindAt: null })
}

export function deleteItem(id: string) {
  return updateItem(id, { deletedAt: syncedNow(), remindAt: null })
}

export function restoreItem(id: string) {
  return updateItem(id, { deletedAt: null })
}

/** Change an item's category and remember the correction for next time (synced to all devices). */
export async function setCategory(item: Item, category: Category) {
  await db.transaction('rw', db.items, db.settings, async () => {
    const now = syncedNow()
    await db.items.update(item.id, { type: category.type, section: category.section, updatedAt: now, dirty: 1 })
    const overrides = await getOverrides()
    overrides[normalize(item.name)] = categoryKey(category)
    await db.settings.put({ key: OVERRIDES_KEY, value: overrides, updatedAt: now, dirty: 1 })
  })
  requestSync()
}

/**
 * Applies an edit made in the add bar (/edit): name, deadline, reminder and
 * priority from the re-parsed text. The category follows the name only if the
 * name changed, so a category chosen by hand survives other edits.
 */
export async function updateFromText(item: Item, parsed: ParsedEntry) {
  const renamed = normalize(parsed.name) !== normalize(item.name)
  await updateItem(item.id, {
    name: parsed.name,
    deadlineAt: parsed.deadlineAt,
    remindAt: parsed.remindAt,
    priority: parsed.priority,
    ...(renamed ? { type: parsed.category.type, section: parsed.category.section } : {}),
  })
}
