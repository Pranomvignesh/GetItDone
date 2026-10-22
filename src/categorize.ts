import { TODO, categoryFromKey, type Category } from './categories'
import { DICTIONARY, TODO_VERBS } from './dictionary'

/** User corrections: normalized item name → category key (see categoryKey). */
export type Overrides = Record<string, string>

export interface ParsedItem {
  name: string
  category: Category
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

export function parseInput(raw: string, overrides: Overrides = {}): ParsedItem[] {
  return splitInput(raw).map((s) => categorize(s, overrides))
}

