import { describe, expect, it } from 'vitest'
import { categoryKey } from './categories'
import { categorize, parseInput, splitInput } from './categorize'

const key = (text: string, overrides = {}) => categoryKey(categorize(text, overrides).category)

describe('splitInput', () => {
  it('splits on commas, new lines and semicolons', () => {
    expect(splitInput('milk, eggs\ncall plumber;  bread ')).toEqual(['milk', 'eggs', 'call plumber', 'bread'])
  })
  it('drops empty entries', () => {
    expect(splitInput(' , ,\n')).toEqual([])
  })
})

describe('categorize', () => {
  it.each([
    ['milk', 'Dairy & eggs'],
    ['Eggs', 'Dairy & eggs'],
    ['bananas', 'Produce'],
    ['tomatoes', 'Produce'],
    ['strawberries', 'Produce'],
    ['sourdough bread', 'Bakery'],
    ['chicken thighs', 'Meat & fish'],
    ['oat milk', 'Dairy & eggs'],
    ['ice cream', 'Frozen'],
    ['olive oil', 'Pantry'],
    ['toilet paper', 'Household'],
    ['toothpaste', 'Personal care'],
    ['sparkling water', 'Snacks & drinks'],
    ['besan', 'Pantry'],
    ['toor dal', 'Pantry'],
    ['ghee', 'Dairy & eggs'],
    ['squash', 'Produce'],
    ['dish liquid', 'Household'],
    ['coconut water', 'Snacks & drinks'],
    ['paracetamol', 'Personal care'],
  ])('%s → %s', (text, expected) => {
    expect(key(text)).toBe(expected)
  })

  it.each(['call plumber', 'Pay electricity bill', 'book dentist', 'email Sam about Friday', 'water the plants'])(
    '%s is a to-do',
    (text) => expect(key(text)).toBe('To-do'),
  )

  it('treats long sentences as to-dos even when they mention food', () => {
    expect(key('remember to thank Priya for the cake')).toBe('To-do')
  })

  it('defaults unknown words to To-do', () => {
    expect(key('zxqv')).toBe('To-do')
  })

  it('"buy X" is a grocery and drops the verb from the name', () => {
    expect(categorize('buy milk')).toEqual({ name: 'milk', category: { type: 'grocery', section: 'Dairy & eggs' } })
    expect(categorize('Buy some gift wrap')).toEqual({ name: 'gift wrap', category: { type: 'grocery', section: 'Other' } })
  })

  it('applies user corrections before any rule', () => {
    expect(key('tofu')).toBe('To-do')
    expect(key('Tofu', { tofu: 'Dairy & eggs' })).toBe('Dairy & eggs')
    expect(key('milk', { milk: 'To-do' })).toBe('To-do')
  })
})

describe('parseInput', () => {
  it('categorizes each item in a multi-item line', () => {
    expect(parseInput('milk, eggs, call plumber').map((p) => [p.name, categoryKey(p.category)])).toEqual([
      ['milk', 'Dairy & eggs'],
      ['eggs', 'Dairy & eggs'],
      ['call plumber', 'To-do'],
    ])
  })
})

describe('parseInput with times and priority', () => {
  const now = new Date(2026, 9, 21, 10, 0).getTime()
  const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime()

  it('keeps a trailing "remind at …" with its item instead of splitting it off', () => {
    const [wash] = parseInput('Wash shoe tomorrow, remind at 6pm', {}, now)
    expect(parseInput('Wash shoe tomorrow, remind at 6pm', {}, now)).toHaveLength(1)
    expect(wash).toMatchObject({ name: 'Wash shoe', deadlineAt: at(22, 22), remindAt: at(22, 18) })
  })

  it('attaches "urgent" after a comma to the item before it', () => {
    expect(parseInput('call plumber, urgent', {}, now)).toEqual([
      { name: 'call plumber', category: { type: 'todo' }, deadlineAt: null, remindAt: null, priority: 'high' },
    ])
  })

  it('still splits ordinary lists, each with its own details', () => {
    const items = parseInput('milk, wash shoe tonight, call bank at 6pm urgent', {}, now)
    expect(items.map((i) => [i.name, categoryKey(i.category), i.deadlineAt, i.priority])).toEqual([
      ['milk', 'Dairy & eggs', null, undefined],
      ['wash shoe', 'To-do', at(21, 22), undefined],
      ['call bank', 'To-do', at(21, 18), 'high'],
    ])
  })

  it('categorises the name without the time words', () => {
    expect(categoryKey(parseInput('milk tomorrow', {}, now)[0].category)).toBe('Dairy & eggs')
  })

  it('keeps a lone time phrase as the item text', () => {
    expect(parseInput('tomorrow', {}, now)[0]).toMatchObject({ name: 'tomorrow', deadlineAt: null })
  })
})
