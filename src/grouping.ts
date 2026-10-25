import { SECTIONS, type Section } from './categories'
import type { Item } from './db'

export interface Grouped {
  groceries: { section: Section; items: Item[] }[]
  groceriesDone: Item[]
  todos: Item[]
  todosDone: Item[]
}

const newestFirst = (a: Item, b: Item) => b.createdAt - a.createdAt
const RANK = { high: 0, normal: 1, low: 2 } as const
const byPriority = (a: Item, b: Item) => RANK[a.priority ?? 'normal'] - RANK[b.priority ?? 'normal']
const recentlyDoneFirst = (a: Item, b: Item) => (b.doneAt ?? 0) - (a.doneAt ?? 0)

/**
 * To-dos: high priority first and low last; within that, deadline soonest first
 * (so overdue floats up), undated after, newest first.
 */
function todoOrder(a: Item, b: Item) {
  const p = byPriority(a, b)
  if (p !== 0) return p
  if (a.deadlineAt !== b.deadlineAt) {
    if (a.deadlineAt === null) return 1
    if (b.deadlineAt === null) return -1
    return a.deadlineAt - b.deadlineAt
  }
  return newestFirst(a, b)
}

export function groupItems(all: Item[]): Grouped {
  const live = all.filter((i) => !i.deletedAt)
  const groceries = live.filter((i) => i.type === 'grocery')
  const todos = live.filter((i) => i.type === 'todo')

  const openGroceries = groceries.filter((i) => !i.doneAt)
  return {
    groceries: SECTIONS.map((section) => ({
      section,
      items: openGroceries.filter((i) => (i.section ?? 'Other') === section).sort((a, b) => byPriority(a, b) || newestFirst(a, b)),
    })).filter((s) => s.items.length > 0),
    groceriesDone: groceries.filter((i) => i.doneAt).sort(recentlyDoneFirst),
    todos: todos.filter((i) => !i.doneAt).sort(todoOrder),
    todosDone: todos.filter((i) => i.doneAt).sort(recentlyDoneFirst),
  }
}
