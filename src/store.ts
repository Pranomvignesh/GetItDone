import { categoryKey, type Category } from './categories'
import { normalize, parseInput, type Overrides } from './categorize'
import { db, type Item } from './db'
import { requestSync, syncedNow } from './sync/engine'

const OVERRIDES_KEY = 'categoryOverrides'

export async function getOverrides(): Promise<Overrides> {
  return ((await db.settings.get(OVERRIDES_KEY))?.value as Overrides) ?? {}
}

export async function addFromInput(raw: string): Promise<Item[]> {
  const now = syncedNow()
  const parsed = parseInput(raw, await getOverrides(), now)
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
  await db.items.bulkAdd(items)
  requestSync()
  return items
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
