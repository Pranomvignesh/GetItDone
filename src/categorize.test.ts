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
