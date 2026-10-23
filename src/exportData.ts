import { db } from './db'

/**
 * Downloads every item and synced setting as readable JSON (the PRD's recovery
 * option if every device and the vault key are lost).
 */
export async function exportJson() {
  const items = (await db.items.toArray())
    .filter((i) => !i.deletedAt)
    .map(({ id, name, type, section, deadlineAt, remindAt, doneAt, createdAt, updatedAt }) => ({
      id,
      name,
      type,
      section: section ?? null,
      deadline: deadlineAt && new Date(deadlineAt).toISOString(),
      reminder: remindAt && new Date(remindAt).toISOString(),
      done: doneAt && new Date(doneAt).toISOString(),
      created: new Date(createdAt).toISOString(),
      updated: new Date(updatedAt).toISOString(),
    }))
  const settings = Object.fromEntries((await db.settings.toArray()).map((s) => [s.key, s.value]))
  const data = { app: 'Get It Done', exportedAt: new Date().toISOString(), items, settings }

  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `get-it-done-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
