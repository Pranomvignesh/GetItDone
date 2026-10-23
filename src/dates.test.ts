import { describe, expect, it } from 'vitest'
import { fromInputValue, isOverdue, presets, shortLabel, toInputValue } from './dates'

// Wednesday 22 Oct 2026, 10:00 local time.
const wed10am = new Date(2026, 9, 22, 10, 0).getTime()
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()

describe('presets', () => {
  it('offers today 6pm, tomorrow 9am and Saturday 10am', () => {
    expect(presets(wed10am)).toEqual([
      { label: 'Today 6pm', value: local(22, 18) },
      { label: 'Tomorrow 9am', value: local(23, 9) },
      { label: 'This weekend', value: local(24, 10) },
    ])
  })

  it('drops "Today 6pm" once it has passed', () => {
    expect(presets(local(22, 18, 30)).map((p) => p.label)).toEqual(['Tomorrow 9am', 'This weekend'])
  })

  it('on a Saturday afternoon, "This weekend" means next Saturday', () => {
    const sat3pm = local(24, 15)
    expect(presets(sat3pm).find((p) => p.label === 'This weekend')?.value).toBe(local(31, 10))
  })
})

describe('shortLabel', () => {
  it.each([
    [local(22, 18), 'Today 6pm'],
    [local(23, 9), 'Tomorrow 9am'],
    [local(21, 9, 30), 'Yesterday 9:30am'],
    [local(24, 10), 'Sat 10am'],
    [local(30, 12), 'Oct 30'],
  ])('%s → %s', (ts, label) => {
    expect(shortLabel(ts, wed10am)).toBe(label)
  })
})

it('flags open items past their deadline as overdue', () => {
  expect(isOverdue(local(21, 9), null, wed10am)).toBe(true)
  expect(isOverdue(local(21, 9), local(21, 10), wed10am)).toBe(false)
  expect(isOverdue(local(23, 9), null, wed10am)).toBe(false)
  expect(isOverdue(null, null, wed10am)).toBe(false)
})

it('converts to and from datetime-local input values in local time', () => {
  expect(toInputValue(local(22, 18, 5))).toBe('2026-10-22T18:05')
  expect(fromInputValue('2026-10-22T18:05')).toBe(local(22, 18, 5))
  expect(fromInputValue('')).toBeNull()
})
