import { TODO, categoryFromKey, type Category } from './categories'
import { DICTIONARY, TODO_VERBS } from './dictionary'
import { parseRoutine, type ParsedRoutine } from './routine'
import { parseWhen, type Priority } from './when'

/** User corrections: normalized item name → category key (see categoryKey). */
export type Overrides = Record<string, string>

export interface ParsedItem {
  name: string
  category: Category
}

/** One item from the add bar: name and category, plus any deadline, reminder and priority it mentioned. */
export interface ParsedEntry extends ParsedItem {
  deadlineAt: number | null
  remindAt: number | null
  priority?: Priority
  /** Set when the text describes a routine ("… every month on the 1st sunday at 10am"). */
  routine?: ParsedRoutine
}

const BUY_PREFIX = /^(buy|pick up|grab)\s+(some\s+|more\s+)?/i

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s&'-]/gu, '').replace(/\s+/g, ' ').trim()
}

/** Split "milk, eggs\ncall plumber" into individual item strings. */
export function splitInput(raw: string): string[] {
  return raw
    .split(/[,\n;]/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function singular(word: string): string[] {
  const forms = [word]
  if (word.endsWith('ies')) forms.push(word.slice(0, -3) + 'y')
  if (word.endsWith('es')) forms.push(word.slice(0, -2))
  if (word.endsWith('s')) forms.push(word.slice(0, -1))
  return forms
}

/** Look up a grocery section for a short phrase, trying longest word runs first. */
function lookup(words: string[]): Category | undefined {
  for (let len = Math.min(3, words.length); len >= 1; len--) {
    // Prefer matches nearer the end ("chicken stock" → Pantry via "stock" only if no 2-word match).
    for (let start = words.length - len; start >= 0; start--) {
      const phrase = words.slice(start, start + len).join(' ')
      for (const form of len === 1 ? singular(phrase) : [phrase]) {
        const section = DICTIONARY.get(form)
        if (section) return { type: 'grocery', section }
      }
    }
  }
  return undefined
}

export function categorize(text: string, overrides: Overrides = {}): ParsedItem {
  const trimmed = text.trim()
  const norm = normalize(trimmed)

  const override = overrides[norm]
  if (override) return { name: trimmed, category: categoryFromKey(override) }

  const buy = trimmed.match(BUY_PREFIX)
  if (buy) {
    const rest = trimmed.slice(buy[0].length).trim()
    if (rest) {
      const restOverride = overrides[normalize(rest)]
      const category = restOverride ? categoryFromKey(restOverride) : lookup(normalize(rest).split(' '))
      return { name: rest, category: category ?? { type: 'grocery', section: 'Other' } }
    }
  }

  const words = norm.split(' ')
  if (TODO_VERBS.has(words[0]) && words.length > 1) return { name: trimmed, category: TODO }

  // Long sentences are almost always tasks, even when they mention food.
  if (words.length <= 4) {
    const found = lookup(words)
    if (found) return { name: trimmed, category: found }
  }

  return { name: trimmed, category: TODO }
}

/**
 * Parses the add bar: "milk, wash shoe tomorrow, remind at 6pm, call plumber urgent".
 * A part that only holds a time or priority ("remind at 6pm", "urgent") belongs
 * to the item before it rather than becoming an item of its own.
 */
export function parseInput(raw: string, overrides: Overrides = {}, now = Date.now()): ParsedEntry[] {
  const parts: string[] = []
  for (const part of splitInput(raw)) {
    if (parts.length > 0 && parseWhen(part, now).text === '') parts[parts.length - 1] += `, ${part}`
    else parts.push(part)
  }
  return parts.map((part) => parseOne(part, overrides, now))
}

/** Parses text as a single item, without splitting on commas (used when editing an existing item). */
export function parseOne(part: string, overrides: Overrides = {}, now = Date.now()): ParsedEntry {
  const routine = parseRoutine(part, now)
  if (routine) {
    return { ...categorize(routine.name, overrides), deadlineAt: null, remindAt: null, priority: routine.priority, routine }
  }
  const when = parseWhen(part, now)
  // Nothing left but a time phrase ("tomorrow" on its own): keep the words as the item.
  if (!when.text) return { ...categorize(part.trim(), overrides), deadlineAt: null, remindAt: null }
  return { ...categorize(when.text, overrides), deadlineAt: when.deadlineAt, remindAt: when.remindAt, priority: when.priority }
}

