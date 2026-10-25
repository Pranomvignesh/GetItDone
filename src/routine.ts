/**
 * Routines: recurring items, parsed deterministically from the add bar.
 *
 *   "Clean dishwasher every month on the 1st sunday at 10am"
 *   "Water plants every day 8am"
 *   "Gym every mon, wed and fri at 7am"
 *   "Pay rent every month on the 1st"
 *   "Renew insurance every year on 3 mar"
 *
 * The schedule is read from the "every …" / "daily" / "weekly" … clause at the
 * end of the text. Everything here takes `now` so it's testable.
 */

import { CLOCK, MONTH, WEEKDAY, clockTime, midnight, monthIndex, parseWhen, upcomingDate, weekdayIndex, type Priority } from './when'

export type Rule =
  | { freq: 'daily'; interval: number }
  /** days: 0 = Sunday … 6 = Saturday */
  | { freq: 'weekly'; interval: number; days: number[] }
  | { freq: 'monthly'; interval: number; day: number }
  /** nth: 1–4, or -1 for the last */
  | { freq: 'monthly'; interval: number; nth: number; weekday: number }
  | { freq: 'yearly'; month: number; day: number }

export interface Schedule {
  rule: Rule
  time: { h: number; m: number }
  /** Local midnight the schedule counts from (intervals align to it). */
  start: number
  /** Last day (local midnight) an occurrence may fall on. */
  until?: number
}

export interface ParsedRoutine {
  name: string
  schedule: Schedule
  priority?: Priority
}

/** Occurrences without a stated time happen at 9am. */
const DEFAULT_HOUR = 9
const DAY = 86_400_000

const ORDINAL: Record<string, number> = { '1st': 1, first: 1, '2nd': 2, second: 2, '3rd': 3, third: 3, '4th': 4, fourth: 4, last: -1 }
const WORD_NUMBER: Record<string, number> = { other: 2, two: 2, three: 3, four: 4, five: 5, six: 6 }
const PART_HOUR: Record<string, number> = { morning: 9, afternoon: 15, evening: 18, night: 22 }

const NTH = String.raw`(1st|first|2nd|second|3rd|third|4th|fourth|last)`
/** Where a routine's schedule begins: "every", "each", "daily", "weekly" … */
const START = /(?:^|\s)(every|each|daily|weekly|fortnightly|monthly|yearly|annually)(?=\s|$|[,.])/i

/** "first sunday of every month" → "every month on the first sunday", so the clause starts with "every". */
function normalise(text: string): string {
  return text
    .replace(new RegExp(String.raw`(?:on\s+)?(?:the\s+)?${NTH}\s+(${WEEKDAY})\s+of\s+(?:every|each|the)\s+month`, 'i'), 'every month on the $1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Reads the schedule clause ("every month on the 1st sunday at 10am"). Null unless all of it is understood. */
function parseClause(clause: string, now: number): { rule: Rule; time?: { h: number; m: number }; until?: number } | null {
  let rest = ` ${clause.toLowerCase()} `
  let time: { h: number; m: number } | undefined
  let until: number | undefined
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void): boolean => {
    const m = rest.match(re)
    if (!m || fn(m) === false) return false
    rest = rest.replace(m[0], ' ')
    return true
  }

  // Time: "at 10am", "10:30", "noon", "in the morning"; bare "at 7" (1–7 pm)
  take(new RegExp(String.raw`\s(?:at\s+|@\s*)?(${CLOCK})(?=\s)`, 'i'), (m) => {
    const t = clockTime(m, 2)
    if (!t) return false
    time = t
  }) ||
    take(/\s(?:at|@)\s*(\d{1,2})(?=\s)/i, (m) => {
      const h = Number(m[1])
      if (h < 1 || h > 12) return false
      time = { h: h === 12 ? 12 : h <= 7 ? h + 12 : h, m: 0 }
    })
  // "in the morning" (but not "every morning", which is the schedule itself)
  take(/(?<!\b(?:every|each))\s(?:in\s+the\s+)?(morning|afternoon|evening|night)(?=\s)/i, (m) => {
    time ??= { h: PART_HOUR[m[1]], m: 0 }
  })

  // End: "until 31 dec" / "until dec 31" / "for 6 weeks"
  take(new RegExp(String.raw`\suntil\s+(?:(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH})|(${MONTH})\s+(\d{1,2})(?:st|nd|rd|th)?)(?=\s)`, 'i'), (m) => {
    const d = m[1] ? upcomingDate(now, monthIndex(m[2]), Number(m[1])) : upcomingDate(now, monthIndex(m[3]), Number(m[4]))
    if (!d) return false
    until = d.getTime()
  })
  take(/\sfor\s+(\d+|a|an|one|two|three|four|five|six)\s+(days?|weeks?|months?)(?=\s)/i, (m) => {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : m[1] === 'a' || m[1] === 'an' ? 1 : (WORD_NUMBER[m[1]] ?? 1)
    const d = midnight(now)
    if (m[2].startsWith('day')) d.setDate(d.getDate() + n - 1)
    else if (m[2].startsWith('week')) d.setDate(d.getDate() + n * 7 - 1)
    else d.setMonth(d.getMonth() + n)
    until = d.getTime()
  })

  const today = midnight(now)
  let rule: Rule | null = null
  // Interval: "every 2 weeks", "every other day", "every three months"
  let interval = 1
  take(/\s(?:every|each)\s+(\d+|other|two|three|four|five|six)\s+(days?|weeks?|months?)(?=\s)/i, (m) => {
    interval = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBER[m[1]]
    if (interval < 1) return false
    rest = rest.replace(m[0], ` every ${m[2].replace(/s$/, '')} `)
  })

  if (take(/\s(?:every|each)\s+(?:day|morning|afternoon|evening|night)(?=\s)|\sdaily(?=\s)/i, (m) => {
    const part = m[0].trim().split(/\s+/)[1]
    if (part && PART_HOUR[part]) time ??= { h: PART_HOUR[part], m: 0 }
  })) {
    rule = { freq: 'daily', interval }
  } else if (take(/\s(?:every|each)\s+weekday(?=\s)/i, () => {})) {
    rule = { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] }
  } else if (take(/\s(?:every|each)\s+weekend(?=\s)/i, () => {})) {
    rule = { freq: 'weekly', interval: 1, days: [0, 6] }
  } else if (take(/\s(?:every|each)\s+week(?=\s)|\sweekly(?=\s)/i, () => {})) {
    rule = { freq: 'weekly', interval, days: [today.getDay()] }
    take(new RegExp(String.raw`\s(?:on\s+)?((?:(?:${WEEKDAY})(?:\s*(?:,|and|&)\s*|\s+))*(?:${WEEKDAY}))(?=\s)`, 'i'), (m) => {
      if (rule?.freq === 'weekly') rule.days = weekdays(m[1])
    })
  } else if (take(/\sfortnightly(?=\s)/i, () => {})) {
    rule = { freq: 'weekly', interval: 2, days: [today.getDay()] }
    take(new RegExp(String.raw`\s(?:on\s+)?(${WEEKDAY})(?=\s)`, 'i'), (m) => {
      if (rule?.freq === 'weekly') rule.days = [weekdayIndex(m[1])]
    })
  } else if (take(new RegExp(String.raw`\s(?:every|each)\s+((?:(?:${WEEKDAY})(?:\s*(?:,|and|&)\s*|\s+))*(?:${WEEKDAY}))(?=\s)`, 'i'), (m) => {
    rule = { freq: 'weekly', interval: 1, days: weekdays(m[1]) }
  })) {
    // rule set in the callback
  } else if (take(/\s(?:every|each)\s+month(?=\s)|\smonthly(?=\s)/i, () => {})) {
    rule = { freq: 'monthly', interval, day: today.getDate() }
    if (
      !take(new RegExp(String.raw`\s(?:on|at)?\s*(?:the\s+)?${NTH}\s+(${WEEKDAY})(?=\s)`, 'i'), (m) => {
        rule = { freq: 'monthly', interval, nth: ORDINAL[m[1]], weekday: weekdayIndex(m[2]) }
      })
    ) {
      take(/\s(?:on|at)?\s*(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)(?=\s)/i, (m) => {
        const day = Number(m[1])
        if (day < 1 || day > 31) return false
        rule = { freq: 'monthly', interval, day }
      })
    }
  } else if (take(/\s(?:every|each)\s+year(?=\s)|\s(?:yearly|annually)(?=\s)/i, () => {})) {
    rule = { freq: 'yearly', month: today.getMonth(), day: today.getDate() }
    take(new RegExp(String.raw`\s(?:on\s+)?(?:(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH})|(${MONTH})\s+(\d{1,2})(?:st|nd|rd|th)?)(?=\s)`, 'i'), (m) => {
      rule = m[1] ? { freq: 'yearly', month: monthIndex(m[2]), day: Number(m[1]) } : { freq: 'yearly', month: monthIndex(m[3]), day: Number(m[4]) }
    })
  }

  // Anything not understood means this isn't a schedule we can trust.
  if (!rule || rest.replace(/\b(?:at|on|the|and|,)\b|[,.]/g, ' ').trim()) return null
  return { rule, time, until }
}

function weekdays(list: string): number[] {
  const days = list
    .split(/\s*(?:,|and|&)\s*|\s+/)
    .filter(Boolean)
    .map(weekdayIndex)
    .filter((d) => d >= 0)
  return [...new Set(days)].sort((a, b) => a - b)
}

/**
 * Reads a routine from add-bar text, or null if it isn't one. Priority and a
 * time before the clause ("water plants 8am every day") are taken from the name.
 */
export function parseRoutine(input: string, now: number): ParsedRoutine | null {
  const text = normalise(input)
  const m = text.match(START)
  if (!m || m.index === undefined) return null
  const clauseStart = m.index + (m[0].length - m[0].trimStart().length)
  const clause = parseClause(text.slice(clauseStart), now)
  if (!clause) return null

  const head = parseWhen(text.slice(0, clauseStart), now)
  const name = head.text
  if (!name) return null
  // "water plants 8am every day": a time before the clause sets the routine's time.
  let time = clause.time
  if (!time && head.deadlineAt !== null) {
    const d = new Date(head.deadlineAt)
    time = { h: d.getHours(), m: d.getMinutes() }
  }
  return {
    name,
    priority: head.priority,
    schedule: { rule: clause.rule, time: time ?? { h: DEFAULT_HOUR, m: 0 }, start: midnight(now).getTime(), until: clause.until },
  }
}

// ---------- Occurrences ----------

function at(day: Date, t: { h: number; m: number }): number {
  const d = new Date(day)
  d.setHours(t.h, t.m, 0, 0)
  return d.getTime()
}

/** Whole local days between two midnights (DST-safe). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY)
}

/** Whether the schedule has an occurrence on this local day. */
function fallsOn(s: Schedule, day: Date): boolean {
  const start = new Date(s.start)
  if (day < start) return false
  if (s.until !== undefined && day.getTime() > s.until) return false
  const r = s.rule
  switch (r.freq) {
    case 'daily':
      return daysBetween(start, day) % r.interval === 0
    case 'weekly': {
      if (!r.days.includes(day.getDay())) return false
      // Weeks counted from the start's Sunday.
      const startSunday = new Date(start)
      startSunday.setDate(start.getDate() - start.getDay())
      return Math.floor(daysBetween(startSunday, day) / 7) % r.interval === 0
    }
    case 'monthly': {
      const months = (day.getFullYear() - start.getFullYear()) * 12 + day.getMonth() - start.getMonth()
      if (months % r.interval !== 0) return false
      if ('day' in r) {
        // The 31st falls on a short month's last day.
        const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
        return day.getDate() === Math.min(r.day, last)
      }
      if (day.getDay() !== r.weekday) return false
      if (r.nth === -1) return day.getDate() + 7 > new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
      return Math.ceil(day.getDate() / 7) === r.nth
    }
    case 'yearly': {
      if (day.getMonth() !== r.month) return false
      const last = new Date(day.getFullYear(), r.month + 1, 0).getDate()
      return day.getDate() === Math.min(r.day, last) // 29 Feb → 28 Feb in other years
    }
  }
}

/** The first occurrence strictly after `after`, or null if the schedule has ended. Looks up to ~3 years ahead. */
export function nextOccurrence(s: Schedule, after: number): number | null {
  const day = midnight(Math.max(after, s.start))
  for (let i = 0; i < 1100; i++) {
    if (s.until !== undefined && day.getTime() > s.until) return null
    if (fallsOn(s, day)) {
      const t = at(day, s.time)
      if (t > after) return t
    }
    day.setDate(day.getDate() + 1)
  }
  return null
}

/** Start of the local day an occurrence falls on: when its to-do appears. */
export function occurrenceDay(occurrence: number): number {
  return midnight(occurrence).getTime()
}

// ---------- Describing ----------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NTH_NAMES: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' }

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${s}`
}

export function timeText(t: { h: number; m: number }): string {
  const h = t.h % 12 || 12
  return `${h}${t.m ? `:${String(t.m).padStart(2, '0')}` : ''}${t.h < 12 ? 'am' : 'pm'}`
}

function every(interval: number, unit: string): string {
  return interval === 1 ? `Every ${unit}` : interval === 2 ? `Every other ${unit}` : `Every ${interval} ${unit}s`
}

/** "Every month on the first Sunday at 10am", "Every Mon, Wed and Fri at 7am". */
export function describeSchedule(s: Schedule): string {
  const r = s.rule
  let text: string
  switch (r.freq) {
    case 'daily':
      text = every(r.interval, 'day')
      break
    case 'weekly': {
      const days = r.days.join() === '1,2,3,4,5' ? 'weekday' : r.days.join() === '0,6' ? 'weekend' : null
      if (days && r.interval === 1) text = `Every ${days}`
      else {
        const names = r.days.map((d) => (r.days.length === 1 ? FULL_DAY[d] : DAY_NAMES[d]))
        const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
        text = r.interval === 1 ? `Every ${list}` : `${every(r.interval, 'week')} on ${list}`
      }
      break
    }
    case 'monthly':
      text = `${every(r.interval, 'month')} on the ${'day' in r ? ordinal(r.day) : `${NTH_NAMES[r.nth]} ${FULL_DAY[r.weekday]}`}`
      break
    case 'yearly':
      text = `Every year on ${r.day} ${MONTH_NAMES[r.month]}`
      break
  }
  text += ` at ${timeText(s.time)}`
  if (s.until !== undefined) {
    const u = new Date(s.until)
    text += `, until ${u.getDate()} ${MONTH_NAMES[u.getMonth()]}`
  }
  return text
}

/** Schedule as add-bar text that parses back to the same schedule (for editing). */
export function scheduleText(s: Schedule): string {
  const r = s.rule
  let text: string
  switch (r.freq) {
    case 'daily':
      text = r.interval === 1 ? 'every day' : `every ${r.interval} days`
      break
    case 'weekly':
      if (r.interval === 1 && r.days.join() === '1,2,3,4,5') text = 'every weekday'
      else if (r.interval === 1 && r.days.join() === '0,6') text = 'every weekend'
      else if (r.interval === 1) text = `every ${r.days.map((d) => FULL_DAY[d].toLowerCase()).join(' and ')}`
      else text = `every ${r.interval} weeks on ${FULL_DAY[r.days[0]].toLowerCase()}`
      break
    case 'monthly':
      text = `${r.interval === 1 ? 'every month' : `every ${r.interval} months`} on the ${'day' in r ? ordinal(r.day) : `${NTH_NAMES[r.nth]} ${FULL_DAY[r.weekday].toLowerCase()}`}`
      break
    case 'yearly':
      text = `every year on ${r.day} ${MONTH_NAMES[r.month].toLowerCase()}`
      break
  }
  text += ` at ${timeText(s.time)}`
  if (s.until !== undefined) {
    const u = new Date(s.until)
    text += ` until ${u.getDate()} ${MONTH_NAMES[u.getMonth()].toLowerCase()}`
  }
  return text
}
