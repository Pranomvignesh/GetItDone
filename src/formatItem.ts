import type { Item } from './db'
import { timeText } from './routine'
import { END_OF_DAY_HOUR } from './when'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Calendar days from today to the given day (DST-safe). */
function daysAhead(ts: number, now: number): number {
  const a = new Date(startOfDay(now))
  const b = new Date(startOfDay(ts))
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000)
}

/** A day the parser reads back to exactly this date: today, tomorrow, friday, nov 2, or 2026-10-20. */
function dayPhrase(ts: number, now: number): string {
  const d = new Date(ts)
  const ahead = daysAhead(ts, now)
  if (ahead === 0) return 'today'
  if (ahead === 1) return 'tomorrow'
  if (ahead > 1 && ahead < 7) return WEEKDAYS[d.getDay()]
  if (ahead > 0 && ahead < 365) return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  // Past (overdue) or far ahead: be explicit.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function clock(ts: number): string {
  const d = new Date(ts)
  return timeText({ h: d.getHours(), m: d.getMinutes() })
}

/**
 * Writes an item as add-bar text that parses back to the same item, e.g.
 * "Wash shoe tomorrow urgent, remind at 6pm" (the inverse of parseInput).
 */
export function formatItem(item: Pick<Item, 'name' | 'deadlineAt' | 'remindAt' | 'priority'>, now: number): string {
  let text = item.name
  if (item.deadlineAt !== null) {
    const d = new Date(item.deadlineAt)
    const endOfDay = d.getHours() === END_OF_DAY_HOUR && d.getMinutes() === 0
    text += ` ${dayPhrase(item.deadlineAt, now)}${endOfDay ? '' : ` ${clock(item.deadlineAt)}`}`
  }
  if (item.priority === 'high') text += ' urgent'
  if (item.priority === 'low') text += ' low priority'
  if (item.remindAt !== null) {
    const sameDay = item.deadlineAt !== null && startOfDay(item.deadlineAt) === startOfDay(item.remindAt)
    text += sameDay ? `, remind at ${clock(item.remindAt)}` : `, remind ${dayPhrase(item.remindAt, now)} ${clock(item.remindAt)}`
  }
  return text
}
