import { describe, expect, it } from 'vitest'
import type { Item } from './db'
import { groupItems } from './grouping'

let n = 0
function item(partial: Partial<Item>): Item {
  n++
  return {
    id: String(n),
    name: `item ${n}`,
    type: 'todo',
    deadlineAt: null,
    remindAt: null,
    doneAt: null,
    deletedAt: null,
    createdAt: n,
    updatedAt: n,
    dirty: 0,
    ...partial,
  }
}

describe('groupItems', () => {
  it('orders grocery sections in store-walk order and skips empty ones', () => {
    const g = groupItems([
      item({ type: 'grocery', section: 'Household', name: 'foil' }),
      item({ type: 'grocery', section: 'Produce', name: 'apples' }),
      item({ type: 'grocery', section: 'Dairy & eggs', name: 'milk' }),
    ])
    expect(g.groceries.map((s) => s.section)).toEqual(['Produce', 'Dairy & eggs', 'Household'])
  })

  it('moves checked items to the done lists and hides deleted ones', () => {
    const g = groupItems([
      item({ type: 'grocery', section: 'Produce', doneAt: 5, name: 'done grocery' }),
      item({ name: 'done todo', doneAt: 5 }),
      item({ name: 'deleted', deletedAt: 5 }),
      item({ name: 'open' }),
    ])
    expect(g.groceries).toEqual([])
    expect(g.groceriesDone.map((i) => i.name)).toEqual(['done grocery'])
    expect(g.todosDone.map((i) => i.name)).toEqual(['done todo'])
    expect(g.todos.map((i) => i.name)).toEqual(['open'])
  })

  it('sorts to-dos by deadline, then newest, undated last', () => {
    const g = groupItems([
      item({ name: 'old undated' }),
      item({ name: 'later', deadlineAt: 2000 }),
      item({ name: 'overdue', deadlineAt: 1000 }),
      item({ name: 'new undated' }),
    ])
    expect(g.todos.map((i) => i.name)).toEqual(['overdue', 'later', 'new undated', 'old undated'])
  })
})

describe('priority', () => {
  it('puts high priority first and low last, then deadlines', () => {
    const g = groupItems([
      item({ name: 'low', priority: 'low', deadlineAt: 100 }),
      item({ name: 'soon', deadlineAt: 500 }),
      item({ name: 'urgent, later', priority: 'high', deadlineAt: 9000 }),
      item({ name: 'undated' }),
    ])
    expect(g.todos.map((i) => i.name)).toEqual(['urgent, later', 'soon', 'undated', 'low'])
  })

  it('applies within grocery sections too', () => {
    const g = groupItems([
      item({ type: 'grocery', section: 'Produce', name: 'apples' }),
      item({ type: 'grocery', section: 'Produce', name: 'limes', priority: 'high' }),
    ])
    expect(g.groceries[0].items.map((i) => i.name)).toEqual(['limes', 'apples'])
  })
})
