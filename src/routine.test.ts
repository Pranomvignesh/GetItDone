import { describe, expect, it } from 'vitest'
import { describeSchedule, nextOccurrence, parseRoutine, scheduleText, type Schedule } from './routine'

// Wednesday 21 Oct 2026, 10:00 local time.
const now = new Date(2026, 9, 21, 10, 0).getTime()
const d = (y: number, m: number, day: number, h: number, min = 0) => new Date(y, m - 1, day, h, min).getTime()

/** The next few occurrences after now. */
function upcoming(s: Schedule, count = 3): number[] {
  const out: number[] = []
  let t = now
  for (let i = 0; i < count; i++) {
    const n = nextOccurrence(s, t)
    if (n === null) break
    out.push(n)
    t = n
  }
  return out
}

describe('the example from the brief', () => {
  it.each([
    'Clean Dishwasher every month at 1st sunday 10am',
    'Clean Dishwasher every month on the 1st sunday at 10am',
    "Clean Dishwasher every month's first sunday at 10am".replace("month's", 'month on the'),
    'Clean Dishwasher on the first sunday of every month at 10am',
    'Clean Dishwasher first sunday of each month 10am',
  ])('%s', (text) => {
    const r = parseRoutine(text, now)!
    expect(r.name).toBe('Clean Dishwasher')
    expect(describeSchedule(r.schedule)).toBe('Every month on the first Sunday at 10am')
    expect(upcoming(r.schedule)).toEqual([d(2026, 11, 1, 10), d(2026, 12, 6, 10), d(2027, 1, 3, 10)])
  })
})

describe('schedules', () => {
  it.each([
    ['Water plants every day 8am', 'Every day at 8am', [d(2026, 10, 22, 8), d(2026, 10, 23, 8)]],
    ['Water plants daily', 'Every day at 9am', [d(2026, 10, 22, 9), d(2026, 10, 23, 9)]],
    ['Water plants 6pm every day', 'Every day at 6pm', [d(2026, 10, 21, 18), d(2026, 10, 22, 18)]],
    ['Stretch every morning', 'Every day at 9am', [d(2026, 10, 22, 9), d(2026, 10, 23, 9)]],
    ['Stretch every evening', 'Every day at 6pm', [d(2026, 10, 21, 18), d(2026, 10, 22, 18)]],
    ['Vitamins every other day at 8am', 'Every other day at 8am', [d(2026, 10, 23, 8), d(2026, 10, 25, 8)]],
    ['Standup every weekday at 9:30am', 'Every weekday at 9:30am', [d(2026, 10, 22, 9, 30), d(2026, 10, 23, 9, 30), d(2026, 10, 26, 9, 30)]],
    ['Long run every weekend 7am', 'Every weekend at 7am', [d(2026, 10, 24, 7), d(2026, 10, 25, 7), d(2026, 10, 31, 7)]],
    ['Gym every mon, wed and fri at 7am', 'Every Mon, Wed and Fri at 7am', [d(2026, 10, 23, 7), d(2026, 10, 26, 7), d(2026, 10, 28, 7)]],
    ['Bins every thursday 8pm', 'Every Thursday at 8pm', [d(2026, 10, 22, 20), d(2026, 10, 29, 20)]],
    ['Review weekly on friday at 5pm', 'Every Friday at 5pm', [d(2026, 10, 23, 17), d(2026, 10, 30, 17)]],
    ['Cleaner every 2 weeks on saturday', 'Every other week on Saturday at 9am', [d(2026, 10, 24, 9), d(2026, 11, 7, 9)]],
    ['Pay rent every month on the 1st', 'Every month on the 1st at 9am', [d(2026, 11, 1, 9), d(2026, 12, 1, 9)]],
    ['Pay rent monthly on the 25th at 10am', 'Every month on the 25th at 10am', [d(2026, 10, 25, 10), d(2026, 11, 25, 10)]],
    ['Payslip every month on the last friday', 'Every month on the last Friday at 9am', [d(2026, 10, 30, 9), d(2026, 11, 27, 9)]],
    ['Car service every 3 months on the 21st', 'Every 3 months on the 21st at 9am', [d(2027, 1, 21, 9), d(2027, 4, 21, 9)]],
    ['Insurance every year on 3 mar', 'Every year on 3 Mar at 9am', [d(2027, 3, 3, 9), d(2028, 3, 3, 9)]],
    ['Anniversary yearly on dec 12 8pm', 'Every year on 12 Dec at 8pm', [d(2026, 12, 12, 20), d(2027, 12, 12, 20)]],
  ])('%s', (text, description, next) => {
    const r = parseRoutine(text, now)!
    expect(describeSchedule(r.schedule)).toBe(description)
    expect(upcoming(r.schedule, next.length)).toEqual(next)
  })

  it('takes priority from the name', () => {
    expect(parseRoutine('Take medicine urgent every day at 8pm', now)).toMatchObject({ name: 'Take medicine', priority: 'high' })
  })

  it('handles the 31st in short months and 29 Feb in other years', () => {
    const r = parseRoutine('Backup every month on the 31st', now)!
    expect(upcoming(r.schedule, 3)).toEqual([d(2026, 10, 31, 9), d(2026, 11, 30, 9), d(2026, 12, 31, 9)])
    const leap: Schedule = { rule: { freq: 'yearly', month: 1, day: 29 }, time: { h: 9, m: 0 }, start: d(2026, 1, 1, 0) }
    expect(nextOccurrence(leap, now)).toBe(d(2027, 2, 28, 9))
  })

  it('stops at an end date', () => {
    const r = parseRoutine('Physio every day until 23 oct', now)!
    expect(upcoming(r.schedule, 5)).toEqual([d(2026, 10, 22, 9), d(2026, 10, 23, 9)])
    const weeks = parseRoutine('Course every monday for 2 weeks', now)!
    expect(upcoming(weeks.schedule, 5)).toEqual([d(2026, 10, 26, 9), d(2026, 11, 2, 9)])
  })
})

describe('not a routine', () => {
  it.each(['call each client', 'everything bagel', 'milk', 'wash shoe tomorrow', 'every day', 'tidy every corner of the house'])('%s', (text) => {
    expect(parseRoutine(text, now)).toBeNull()
  })
})

describe('schedule text round-trip (for editing)', () => {
  it.each([
    'every day at 8am',
    'every 3 days at 7pm',
    'every weekday at 9:30am',
    'every weekend at 7am',
    'every monday and thursday at 6pm',
    'every 2 weeks on saturday at 9am',
    'every month on the 1st at 9am',
    'every month on the first sunday at 10am',
    'every month on the last friday at 9am',
    'every 3 months on the 21st at 9am',
    'every year on 3 mar at 9am',
    'every day at 9am until 31 dec',
  ])('%s', (text) => {
    const r = parseRoutine(`thing ${text}`, now)!
    expect(scheduleText(r.schedule)).toBe(text)
    expect(parseRoutine(`thing ${scheduleText(r.schedule)}`, now)!.schedule).toEqual(r.schedule)
  })
})
