import { describe, expect, it } from 'vitest'
import { parseOne } from './categorize'
import { formatItem } from './formatItem'

// Wednesday 21 Oct 2026, 10:00 local time.
const now = new Date(2026, 9, 21, 10, 0).getTime()
const t = (m: number, d: number, h: number, min = 0, y = 2026) => new Date(y, m - 1, d, h, min).getTime()

type Fields = { name: string; deadlineAt: number | null; remindAt: number | null; priority?: 'high' | 'low' }

describe('formatItem', () => {
  it('writes the example from the brief', () => {
    expect(formatItem({ name: 'Wash shoe', deadlineAt: t(10, 22, 22), remindAt: t(10, 22, 18), priority: 'high' }, now)).toBe(
      'Wash shoe tomorrow urgent, remind at 6pm',
    )
  })

  it.each<[string, Fields]>([
    ['plain', { name: 'milk', deadlineAt: null, remindAt: null }],
    ['today, end of day', { name: 'pay rent', deadlineAt: t(10, 21, 22), remindAt: null }],
    ['today at a time', { name: 'call bank', deadlineAt: t(10, 21, 18, 30), remindAt: null }],
    ['tomorrow 9am', { name: 'dentist', deadlineAt: t(10, 22, 9), remindAt: null }],
    ['this week (weekday name)', { name: 'bins', deadlineAt: t(10, 23, 20), remindAt: null }],
    ['later this year', { name: 'passport', deadlineAt: t(11, 2, 10, 30), remindAt: null }],
    ['next year', { name: 'taxes', deadlineAt: t(3, 31, 22, 0, 2027), remindAt: null }],
    ['overdue', { name: 'late thing', deadlineAt: t(10, 19, 22), remindAt: null }],
    ['low priority', { name: 'tidy shed', deadlineAt: null, remindAt: null, priority: 'low' }],
    ['reminder on the deadline day', { name: 'wash shoe', deadlineAt: t(10, 24, 22), remindAt: t(10, 24, 18), priority: 'high' }],
    ['reminder on another day', { name: 'report', deadlineAt: t(10, 23, 22), remindAt: t(10, 22, 17) }],
    ['reminder only', { name: 'water plants', deadlineAt: null, remindAt: t(10, 21, 19) }],
    ['name with a comma', { name: 'bread, eggs list', deadlineAt: t(10, 22, 22), remindAt: null }],
  ])('round-trips: %s', (_label, item) => {
    const text = formatItem(item, now)
    const parsed = parseOne(text, {}, now)
    expect({ name: parsed.name, deadlineAt: parsed.deadlineAt, remindAt: parsed.remindAt, priority: parsed.priority }).toEqual({
      priority: undefined,
      ...item,
    })
  })
})
