/** Deadline and reminder helpers (FR3). All functions take `now` so they're testable. */

const HOUR = 3_600_000

function at(base: Date, dayOffset: number, hour: number): number {
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

export interface Preset {
  label: string
  value: number
}

/** Quick picks: Today 6pm (while it's still ahead), Tomorrow 9am, This weekend (Saturday 10am). */
export function presets(now: number): Preset[] {
  const today = new Date(now)
  const list: Preset[] = []
  const sixPm = at(today, 0, 18)
  if (sixPm > now + 15 * 60_000) list.push({ label: 'Today 6pm', value: sixPm })
  list.push({ label: 'Tomorrow 9am', value: at(today, 1, 9) })
  // Next Saturday; on a weekend, the coming one only if it's still ahead (else next week's).
  const daysToSat = (6 - today.getDay() + 7) % 7
  let weekend = at(today, daysToSat, 10)
  if (weekend <= now) weekend = at(today, daysToSat + 7, 10)
  list.push({ label: 'This weekend', value: weekend })
  return list
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function time(d: Date): string {
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${d.getHours() < 12 ? 'am' : 'pm'}`
}

/** Short label for a date chip: "Today 6pm", "Tomorrow 9am", "Sat 10am", "Oct 30". */
export function shortLabel(ts: number, now: number): string {
  const d = new Date(ts)
  const today = new Date(now)
  const tomorrow = new Date(at(today, 1, 0))
  const yesterday = new Date(at(today, -1, 0))
  if (sameDay(d, today)) return `Today ${time(d)}`
  if (sameDay(d, tomorrow)) return `Tomorrow ${time(d)}`
  if (sameDay(d, yesterday)) return `Yesterday ${time(d)}`
  const days = (ts - now) / (24 * HOUR)
  if (days > 0 && days < 6) return `${d.toLocaleDateString('en', { weekday: 'short' })} ${time(d)}`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export function isOverdue(deadlineAt: number | null, doneAt: number | null, now: number): boolean {
  return deadlineAt !== null && doneAt === null && deadlineAt < now
}

/** Value for <input type="datetime-local"> in local time. */
export function toInputValue(ts: number): string {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

export function fromInputValue(value: string): number | null {
  if (!value) return null
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}

export const SNOOZE_MS = HOUR
