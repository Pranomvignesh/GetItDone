import { expect, it } from 'vitest'
import { searchByName } from './search'

const items = ['wash shoe', 'call plumber', 'shoe polish', 'pay rent', 'milk', 'washing powder'].map((name) => ({ name }))
const names = (q: string) => searchByName(items, q).map((i) => i.name)

it('ranks prefix matches, then word starts, then anywhere, then loose', () => {
  expect(names('wash')).toEqual(['wash shoe', 'washing powder'])
  expect(names('sho')).toEqual(['shoe polish', 'wash shoe'])
  expect(names('lumb')).toEqual(['call plumber'])
  expect(names('wsh')).toEqual(['wash shoe', 'washing powder'])
})

it('returns everything (up to the limit) for an empty query, and nothing for no match', () => {
  expect(names('')).toHaveLength(6)
  expect(searchByName(items, '', 3)).toHaveLength(3)
  expect(names('xyz')).toEqual([])
})

it('ignores case and extra spaces', () => {
  expect(names('  CALL   pl ')).toEqual(['call plumber'])
})
