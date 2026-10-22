import { categoryKey, type Category } from './categories'
import { normalize, parseInput, type Overrides } from './categorize'
import { db, type Item } from './db'

const OVERRIDES_KEY = 'categoryOverrides'

export async function getOverrides(): Promise<Overrides> {
  return ((await db.settings.get(OVERRIDES_KEY))?.value as Overrides) ?? {}
}

export async function addFromInput(raw: string): Promise<Item[]> {
  const parsed = parseInput(raw, await getOverrides())
  const now = Date.now()
  // Offset by index so items added together keep their typed order when sorted by newest.
  const items: Item[] = parsed.map((p, i) => ({
    id: crypto.randomUUID(),
    name: p.name,
    type: p.category.type,
    section: p.category.section,
    deadlineAt: null,
    remindAt: null,
    doneAt: null,
    deletedAt: null,
    createdAt: now + i,
    updatedAt: now + i,
    dirty: 1,
  }))
  await db.items.bulkAdd(items)
  return items
}

export function updateItem(id: string, patch: Partial<Omit<Item, 'id' | 'createdAt'>>) {
  return db.items.update(id, { ...patch, updatedAt: Date.now(), dirty: 1 })
}

export function toggleDone(item: Item) {
  return updateItem(item.id, { doneAt: item.doneAt ? null : Date.now() })
}

export function deleteItem(id: string) {
  return updateItem(id, { deletedAt: Date.now() })
}

export function restoreItem(id: string) {
  return updateItem(id, { deletedAt: null })
}

/** Change an item's category and remember the correction for next time. */
export async function setCategory(item: Item, category: Category) {
  await db.transaction('rw', db.items, db.settings, async () => {
    await updateItem(item.id, { type: category.type, section: category.section })
    const overrides = await getOverrides()
    overrides[normalize(item.name)] = categoryKey(category)
    await db.settings.put({ key: OVERRIDES_KEY, value: overrides, updatedAt: Date.now(), dirty: 1 })
  })
}
