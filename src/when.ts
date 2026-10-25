/**
 * Deterministic natural-language parsing of deadlines, reminders and priority
 * from one item's text (no LLM, runs on the device):
 *
 *   "Wash shoe tonight"                  → deadline today 10pm
 *   "Wash shoe @ 11pm"                   → deadline 11pm (today, or tomorrow if past)
 *   "Wash shoe tomorrow urgent"          → deadline tomorrow 10pm, high priority
 *   "Wash shoe tomorrow, remind at 6pm"  → deadline tomorrow 10pm, reminder tomorrow 6pm
 *   "remind me to call mom tomorrow 9am" → "call mom", reminder tomorrow 9am
 *
 * Phrases are recognised at the END of the text, and the unambiguous ones at the
 * START too ("tonight wash shoe", "10pm shoe wash"), never in the middle, so
 * "call mom about friday party" is left alone.
 * All functions take `now` so they're testable.
 */

export type Priority = 'high' | 'low'

export interface ParsedWhen {
  /** The item text with the recognised phrases removed. Empty if nothing else was left. */
  text: string
  deadlineAt: number | null
  remindAt: number | null
  priority?: Priority
}

/** "tonight", and deadlines given as a day without a time, mean this hour. */
export const END_OF_DAY_HOUR = 22
/** A reminder given as a day without a time fires at this hour. */
const REMINDER_HOUR = 9
const PART_OF_DAY: Record<string, number> = { morning: 9, afternoon: 15, evening: 18, night: 22 }

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const WEEKDAY = String.raw`sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?`
const MONTH = String.raw`jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?`
const CLOCK = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)|(\d{1,2}):(\d{2})|noon|midnight`
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** What a phrase said, before it's turned into a timestamp. */
interface Spec {
  /** Local midnight of the day. */
  day?: Date
  /** Hour and minute. */
  time?: { h: number; m: number }
  /** Exact time, e.g. "in 2 hours". */
  exact?: number
  /** "tonight": 10pm, but if that's passed, last minute of today. */
  tonight?: boolean
}

function midnight(now: number, addDays = 0): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + addDays)
  return d
}

function weekdayIndex(word: string): number {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(word.slice(0, 3).toLowerCase())
}

function monthIndex(word: string): number {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(word.slice(0, 3).toLowerCase())
}

/** Next occurrence of a weekday: today counts unless `strictlyAfter` ("next friday"). */
function nextWeekday(now: number, index: number, strictlyAfter: boolean): Date {
  const today = midnight(now)
  let add = (index - today.getDay() + 7) % 7
  if (add === 0 && strictlyAfter) add = 7
  return midnight(now, add)
}

/** A day-of-month date: this year (or month) unless it has passed, then the next one. */
function upcomingDate(now: number, month: number | null, day: number): Date | null {
  const today = midnight(now)
  const year = today.getFullYear()
  const m = month ?? today.getMonth()
  let d = new Date(year, m, day)
  if (d.getDate() !== day) return null // e.g. 31 Feb
  if (d < today) d = month === null ? new Date(year, m + 1, day) : new Date(year + 1, m, day)
  return d.getDate() === day ? d : null
}

function clockTime(m: RegExpMatchArray, offset: number): { h: number; m: number } | null {
  const text = m[offset - 1].toLowerCase()
  if (text.includes('noon')) return { h: 12, m: 0 }
  if (text.includes('midnight')) return { h: 23, m: 59 }
  const [h12, min12, ampm, h24, min24] = m.slice(offset, offset + 5)
  if (h12) {
    let h = Number(h12)
    const minutes = Number(min12 ?? 0)
    if (h < 1 || h > 12 || minutes > 59) return null
    if (ampm.startsWith('p') && h !== 12) h += 12
    if (ampm.startsWith('a') && h === 12) h = 0
    return { h, m: minutes }
  }
  const h = Number(h24)
  const minutes = Number(min24)
  return h <= 23 && minutes <= 59 ? { h, m: minutes } : null
}

type Apply = (m: RegExpMatchArray, spec: Spec, now: number) => boolean

const RELATIVE = String.raw`in\s+(half\s+an?\s+hour|(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(minutes?|mins?|hours?|hrs?|h|days?|weeks?))`
const AT_CLOCK = String.raw`(?:(?:at|@|by|around|before)\s*)?(${CLOCK})`
const AT_HOUR = String.raw`(?:at|@|by|around)\s*(\d{1,2})`
const PART = String.raw`(?:this|in\s+the)\s+(morning|afternoon|evening|night)`
const SLASH_DATE = String.raw`(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?`

/**
 * A numeric date like 10/30 or 30/10. If one number is over 12 it must be the
 * day; when both could be months (5/6) it's read as month/day. Without a year,
 * a date that has passed means next year.
 */
function slashDate(now: number, a: number, b: number, year?: string): Date | null {
  let month: number
  let day: number
  if (a > 12 && b <= 12) [day, month] = [a, b]
  else if (a <= 12) [month, day] = [a, b]
  else return null
  if (month < 1 || day < 1) return null
  if (year) {
    const y = year.length === 2 ? 2000 + Number(year) : Number(year)
    const d = new Date(y, month - 1, day)
    return d.getMonth() === month - 1 && d.getDate() === day ? d : null
  }
  return upcomingDate(now, month - 1, day)
}

/**
 * Phrases recognised at the end of the text (`re`) and, for the unambiguous
 * ones, at the start (`start`), tried in order. Each returns false if the match
 * turned out not to make sense (then it's left in the text).
 */
const PHRASES: { re?: RegExp; start?: RegExp; apply: Apply }[] = [
  // "in 2 hours", "in 30 min", "in half an hour", "in 3 days", "in a week"
  {
    re: phrase(RELATIVE),
    start: lead(RELATIVE),
    apply: (m, s, now) => {
      if (/^half/i.test(m[1])) return set(s, 'exact', now + 30 * MINUTE)
      const n = /^\d+$/.test(m[2]) ? Number(m[2]) : NUMBER_WORDS[m[2].toLowerCase()]
      const unit = m[3].toLowerCase()
      if (unit.startsWith('m')) return set(s, 'exact', now + n * MINUTE)
      if (unit.startsWith('h')) return set(s, 'exact', now + n * HOUR)
      return set(s, 'day', midnight(now, unit.startsWith('w') ? n * 7 : n))
    },
  },
  // "at 6pm", "@ 11pm", "by 10:30", "18:00", "noon"
  { re: phrase(AT_CLOCK), start: lead(AT_CLOCK), apply: (m, s) => setTime(s, clockTime(m, 2)) },
  // "at 6", "by 9": 1–7 means pm, 8–11 am, 12 noon
  {
    re: phrase(AT_HOUR),
    start: lead(AT_HOUR),
    apply: (m, s) => {
      const h = Number(m[1])
      if (h < 1 || h > 12) return false
      return setTime(s, { h: h === 12 ? 12 : h <= 7 ? h + 12 : h, m: 0 })
    },
  },
  // "this evening", "in the morning"; "tomorrow morning" (only right after a day word)
  {
    re: phrase(PART),
    start: lead(PART),
    apply: (m, s) => setTime(s, { h: PART_OF_DAY[m[1].toLowerCase()], m: 0 }),
  },
  {
    re: phrase(String.raw`(?<=\b(?:today|tomorrow|tmrw|tmr|${WEEKDAY})\s+)(morning|afternoon|evening|night)`),
    apply: (m, s) => setTime(s, { h: PART_OF_DAY[m[1].toLowerCase()], m: 0 }),
  },
  // Start only: "tomorrow morning wash shoe"
  {
    start: lead(String.raw`(today|tomorrow|tmrw|tmr)\s+(morning|afternoon|evening|night)`),
    apply: (m, s, now) =>
      set(s, 'day', midnight(now, m[1].toLowerCase() === 'today' ? 0 : 1)) && set(s, 'time', { h: PART_OF_DAY[m[2].toLowerCase()], m: 0 }),
  },
  { re: phrase('tonight'), start: lead('tonight'), apply: (_m, s, now) => set(s, 'day', midnight(now)) && set(s, 'tonight', true) },
  { re: phrase(String.raw`(?:by\s+)?(?:today|eod|end\s+of\s+(?:the\s+)?day)`), start: lead('today'), apply: (_m, s, now) => set(s, 'day', midnight(now)) },
  { re: phrase(String.raw`(?:by\s+)?(?:the\s+)?day\s+after\s+tomorrow`), start: lead(String.raw`(?:the\s+)?day\s+after\s+tomorrow`), apply: (_m, s, now) => set(s, 'day', midnight(now, 2)) },
  { re: phrase(String.raw`(?:by\s+)?(?:tomorrow|tomorow|tmrw|tmr)`), start: lead(String.raw`(?:tomorrow|tomorow|tmrw|tmr)`), apply: (_m, s, now) => set(s, 'day', midnight(now, 1)) },
  // "this weekend": the coming Sunday (end of the weekend); "next weekend": a week later
  {
    re: phrase(String.raw`(?:by\s+|over\s+)?(?:(this|the|next)\s+)?weekend`),
    start: lead(String.raw`(?:(this|next)\s+)?weekend`),
    apply: (m, s, now) => {
      const sunday = nextWeekday(now, 0, false)
      if (m[1]?.toLowerCase() === 'next') sunday.setDate(sunday.getDate() + 7)
      return set(s, 'day', sunday)
    },
  },
  // "next week": Monday of next week
  { re: phrase(String.raw`(?:by\s+)?next\s+week`), start: lead(String.raw`next\s+week`), apply: (_m, s, now) => set(s, 'day', nextWeekday(now, 1, true)) },
  // "friday", "on fri", "by thursday", "this sat", "next monday"
  {
    re: phrase(String.raw`(?:(on|by|this|next|coming)\s+)?(${WEEKDAY})`),
    // At the start only full names, so "sun cream" or "sat nav" stay as they are.
    start: lead(String.raw`(?:(on|this|next|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)`),
    apply: (m, s, now) => set(s, 'day', nextWeekday(now, weekdayIndex(m[2]), m[1]?.toLowerCase() === 'next')),
  },
  // "30 oct", "30th of october", "on 5 nov"
  {
    re: phrase(String.raw`(?:(?:on|by)\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH})`),
    start: lead(String.raw`(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH})`),
    apply: (m, s, now) => setDay(s, upcomingDate(now, monthIndex(m[2]), Number(m[1]))),
  },
  // "oct 30", "october 30th"
  {
    re: phrase(String.raw`(?:(?:on|by)\s+)?(${MONTH})\s+(\d{1,2})(?:st|nd|rd|th)?`),
    start: lead(String.raw`(?:on\s+)?(${MONTH})\s+(\d{1,2})(?:st|nd|rd|th)?`),
    apply: (m, s, now) => setDay(s, upcomingDate(now, monthIndex(m[1]), Number(m[2]))),
  },
  // "on the 5th"
  {
    re: phrase(String.raw`(?:(?:on|by)\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)`),
    apply: (m, s, now) => setDay(s, upcomingDate(now, null, Number(m[1]))),
  },
  // "10/30", "30/10", "10/30/26": a number over 12 decides the order; otherwise month/day
  {
    re: phrase(String.raw`(?:(?:on|by)\s+)?${SLASH_DATE}`),
    start: lead(String.raw`(?:on\s+)?${SLASH_DATE}`),
    apply: (m, s, now) => setDay(s, slashDate(now, Number(m[1]), Number(m[2]), m[3])),
  },
  // "2026-10-30"
  {
    re: phrase(String.raw`(?:(?:on|by)\s+)?(\d{4})-(\d{2})-(\d{2})`),
    start: lead(String.raw`(\d{4})-(\d{2})-(\d{2})`),
    apply: (m, s) => {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      return d.getDate() === Number(m[3]) ? set(s, 'day', d) : false
    },
  },
]

const HIGH = String.raw`urgent|asap|important|high\s+priority|priority\s*:?\s*high|p1`
const LOW = String.raw`low\s+priority|priority\s*:?\s*low|p3|whenever|no\s+rush`
// "!!" counts even when attached ("Wash shoe!!"); a single "!" is usually just emphasis.
const HIGH_END = new RegExp(String.raw`(?:(?:^|\s)(?:${HIGH})|\s*!{2,3})\s*[,.;]*\s*$`, 'i')
const LOW_END = phrase(`(${LOW})`)
const HIGH_START = new RegExp(String.raw`^\s*(?:urgent|asap|important|!{2,3})(?:\s*[:\-–]\s*|\s+)`, 'i')
const REMIND_ME_TO = /^\s*remind\s+me\s+(?:to\s+)?/i

/** A phrase that must sit at the end of the text, after a space or the start. */
function phrase(body: string): RegExp {
  return new RegExp(String.raw`(?:^|\s)(?:${body})\s*[,.;]*\s*$`, 'i')
}

/** A phrase at the start of the text, followed by a separator and more text ("tonight: wash shoe"). */
function lead(body: string): RegExp {
  return new RegExp(String.raw`^\s*(?:${body})(?:\s*[,:\-–]\s*|\s+)(?=\S)`, 'i')
}

/** Sets a field unless an earlier (later-in-text) phrase already set it. */
function set<K extends keyof Spec>(s: Spec, key: K, value: Spec[K]): true {
  if (s[key] === undefined) s[key] = value
  return true
}

function setTime(s: Spec, t: { h: number; m: number } | null): boolean {
  return t ? set(s, 'time', t) : false
}

function setDay(s: Spec, d: Date | null): boolean {
  return d ? set(s, 'day', d) : false
}

/** Removes trailing connectors left behind, e.g. "Wash shoe by" → "Wash shoe". */
function tidy(text: string): string {
  return text
    .replace(/(?:\s+(?:by|at|on|@|due|and|-|–|,))+\s*$/i, '')
    .replace(/[\s,;:\-–]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strips one recognised phrase from the end (or start). Returns the shorter text, or null. */
function stripOne(text: string, spec: Spec, now: number, from: 'end' | 'start' = 'end'): string | null {
  for (const { re, start, apply } of PHRASES) {
    const pattern = from === 'end' ? re : start
    const m = pattern && text.match(pattern)
    if (!m || m.index === undefined) continue
    const probe: Spec = { ...spec }
    if (!apply(m, probe, now)) continue
    Object.assign(spec, probe)
    return from === 'end' ? text.slice(0, m.index) : text.slice(m[0].length)
  }
  return null
}

/** Reads a whole string as a when-expression, e.g. "at 6pm tomorrow". Null if anything is left over. */
function wholeSpec(text: string, now: number): Spec | null {
  const spec: Spec = {}
  let rest = text
  for (let i = 0; i < 6 && rest.trim(); i++) {
    const next = stripOne(rest, spec, now)
    if (next === null) return null
    rest = tidy(next)
  }
  return rest.trim() ? null : spec
}

function at(day: Date, h: number, m: number): number {
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** Deadline: a day alone means 10pm that day; a time alone means its next occurrence. */
function resolveDeadline(s: Spec, now: number): number | null {
  if (s.exact !== undefined) return s.exact
  if (s.tonight && !s.time) {
    const tenPm = at(s.day!, END_OF_DAY_HOUR, 0)
    return tenPm > now ? tenPm : at(s.day!, 23, 59)
  }
  if (s.day && s.time) return at(s.day, s.time.h, s.time.m)
  if (s.day) return at(s.day, END_OF_DAY_HOUR, 0)
  if (s.time) {
    const today = at(midnight(now), s.time.h, s.time.m)
    return today > now ? today : at(midnight(now, 1), s.time.h, s.time.m)
  }
  return null
}

/** Reminder: a time alone falls on the deadline's day (or its next occurrence); a day alone means 9am. */
function resolveReminder(s: Spec, deadlineAt: number | null, now: number): number | null {
  if (s.exact !== undefined) return s.exact
  if (s.tonight && !s.time) return resolveDeadline(s, now)
  if (s.day && s.time) return at(s.day, s.time.h, s.time.m)
  if (s.day) return at(s.day, REMINDER_HOUR, 0)
  if (s.time) {
    if (deadlineAt !== null) return at(midnight(deadlineAt), s.time.h, s.time.m)
    const today = at(midnight(now), s.time.h, s.time.m)
    return today > now ? today : at(midnight(now, 1), s.time.h, s.time.m)
  }
  return null
}

const isEmpty = (s: Spec) => s.day === undefined && s.time === undefined && s.exact === undefined

export function parseWhen(input: string, now: number): ParsedWhen {
  let text = input.trim()
  let priority: Priority | undefined
  const deadline: Spec = {}
  let reminder: Spec | null = null

  // "remind me to X …": the time is when to remind, not a deadline.
  const remindMeTo = REMIND_ME_TO.test(text)
  if (remindMeTo) text = text.replace(REMIND_ME_TO, '')

  // Read phrases off the end (and the start) until nothing more is recognised.
  for (let i = 0; i < 12; i++) {
    const before = text
    if (HIGH_START.test(text)) {
      priority ??= 'high'
      text = text.replace(HIGH_START, '')
      continue
    }
    const high = text.match(HIGH_END)
    const low = !high && text.match(LOW_END)
    const pm = high || low
    if (pm && pm.index !== undefined) {
      priority ??= high ? 'high' : 'low'
      text = tidy(text.slice(0, pm.index))
      continue
    }
    // ", remind at 6pm" / "remind me tomorrow morning" / "and remind me in 2 hours"
    const remindAt = text.search(/(?:^|[\s,])(?:and\s+)?remind(?:\s+me)?(?=\s|$)/i)
    if (remindAt !== -1 && !reminder) {
      const clause = text.slice(remindAt).replace(/^[\s,]*(?:and\s+)?remind(?:\s+me)?/i, '')
      const spec = wholeSpec(clause.trim(), now)
      if (spec && !isEmpty(spec)) {
        reminder = spec
        text = tidy(text.slice(0, remindAt))
        continue
      }
    }
    const next = stripOne(text, deadline, now) ?? stripOne(text, deadline, now, 'start')
    if (next !== null) text = tidy(next)
    if (text === before) break
  }

  let deadlineAt = isEmpty(deadline) ? null : resolveDeadline(deadline, now)
  let remindAt = reminder ? resolveReminder(reminder, deadlineAt, now) : null
  if (remindMeTo && !reminder && deadlineAt !== null) {
    // "remind me to call mom tomorrow 9am": that time is the reminder.
    remindAt = isEmpty(deadline) ? null : resolveReminder(deadline, null, now)
    deadlineAt = null
  }

  return { text: tidy(text), deadlineAt, remindAt, priority }
}
