import { expect, it } from 'vitest'
import { describeChanges } from './message'

it('summarises changes by list and kind', () => {
  expect(
    describeChanges([
      { name: 'milk', type: 'grocery', kind: 'added' },
      { name: 'eggs', type: 'grocery', kind: 'added' },
      { name: 'call plumber', type: 'todo', kind: 'done' },
    ]),
  ).toEqual({ title: 'List updated', body: 'Groceries: milk, eggs added · To-dos: call plumber checked off' })
})

it('shortens long lists and mentions changes it could not name', () => {
  const many = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, type: 'grocery' as const, kind: 'added' as const }))
  expect(describeChanges(many, 2).body).toBe('Groceries: a, b, c and 2 more added (+2 more)')
})

it('still says something useful when nothing could be named (iOS shows every push)', () => {
  expect(describeChanges([]).body).toBe('Your list is up to date')
  expect(describeChanges([], 3).body).toBe('3 changes from another device')
})
