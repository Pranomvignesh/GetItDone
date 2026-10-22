export type ItemType = 'grocery' | 'todo'

// Store-walk order: the order sections appear in the Groceries group.
export const SECTIONS = [
  'Produce',
  'Bakery',
  'Meat & fish',
  'Dairy & eggs',
  'Frozen',
  'Pantry',
  'Snacks & drinks',
  'Household',
  'Personal care',
  'Other',
] as const

export type Section = (typeof SECTIONS)[number]

export interface Category {
  type: ItemType
  section?: Section
}

export const TODO: Category = { type: 'todo' }

export function categoryKey(c: Category): string {
  return c.type === 'todo' ? 'To-do' : c.section ?? 'Other'
}

export function categoryFromKey(key: string): Category {
  if (key === 'To-do') return TODO
  return { type: 'grocery', section: (SECTIONS as readonly string[]).includes(key) ? (key as Section) : 'Other' }
}

/** Every choice offered in the category picker, groceries first in store order. */
export const CATEGORY_CHOICES: Category[] = [...SECTIONS.map((section) => ({ type: 'grocery' as const, section })), TODO]
