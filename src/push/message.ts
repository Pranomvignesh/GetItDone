import type { ItemType } from '../categories'

export interface ChangedItem {
  name: string
  type: ItemType
  kind: 'added' | 'updated' | 'deleted' | 'done'
}

const VERB = { added: 'added', updated: 'updated', deleted: 'removed', done: 'checked off' } as const
const GROUP = { grocery: 'Groceries', todo: 'To-dos' } as const

function names(list: string[], max = 3): string {
  if (list.length <= max) return list.join(', ')
  return `${list.slice(0, max).join(', ')} and ${list.length - max} more`
}

/**
 * Text for the batched "list updated" notification (FR5), e.g.
 * "Groceries: milk, eggs added · To-dos: call plumber checked off".
 * iOS shows a notification for every push, so it should say something useful.
 */
export function describeChanges(changes: ChangedItem[], extra = 0): { title: string; body: string } {
  if (changes.length === 0) {
    return { title: 'List updated', body: extra > 0 ? `${extra} changes from another device` : 'Your list is up to date' }
  }
  const parts: string[] = []
  for (const type of ['grocery', 'todo'] as const) {
    for (const kind of ['added', 'done', 'updated', 'deleted'] as const) {
      const matching = changes.filter((c) => c.type === type && c.kind === kind).map((c) => c.name)
      if (matching.length) parts.push(`${GROUP[type]}: ${names(matching)} ${VERB[kind]}`)
    }
  }
  const body = parts.join(' · ') + (extra > 0 ? ` (+${extra} more)` : '')
  return { title: 'List updated', body }
}
