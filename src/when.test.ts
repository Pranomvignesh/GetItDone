import { describe, expect, it } from 'vitest'
import { parseWhen } from './when'

// Wednesday 21 Oct 2026, 10:00 local time.
const now = new Date(2026, 9, 21, 10, 0).getTime()
const t = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()
const parse = (text: string, at = now) => parseWhen(text, at)

describe('the examples from the brief', () => {
  it('"tonight" means 10pm today', () => {
    expect(parse('Wash shoe tonight')).toEqual({ text: 'Wash shoe', deadlineAt: t(21, 22), remindAt: null, priority: undefined })
  })

  it('"@ 11pm" sets the time', () => {
    expect(parse('Wash shoe @ 11pm')).toMatchObject({ text: 'Wash shoe', deadlineAt: t(21, 23) })
  })

  it('"tomorrow" means the end of tomorrow (10pm)', () => {
    expect(parse('Wash shoe tomorrow')).toMatchObject({ text: 'Wash shoe', deadlineAt: t(22, 22) })
  })

  it('"urgent" sets high priority', () => {
    expect(parse('Wash shoe tomorrow urgent')).toMatchObject({ text: 'Wash shoe', deadlineAt: t(22, 22), priority: 'high' })
  })

  it('"remind at 6pm" reminds on the deadline day', () => {
    expect(parse('Wash shoe tomorrow, remind at 6pm')).toMatchObject({ text: 'Wash shoe', deadlineAt: t(22, 22), remindAt: t(22, 18) })
  })
})

describe('the variants from the brief: time phrase at the end or the start', () => {
  it.each([
    ['Wash shoe tonight', 'Wash shoe', t(21, 22)],
    ['tonight wash shoe', 'wash shoe', t(21, 22)],
    ['Tonight: wash shoe', 'wash shoe', t(21, 22)],
    ['wash shoe at 10pm', 'wash shoe', t(21, 22)],
    ['wash shoe @10pm', 'wash shoe', t(21, 22)],
    ['wash shoe @ 10pm', 'wash shoe', t(21, 22)],
    ['10pm shoe wash', 'shoe wash', t(21, 22)],
    ['@10pm wash shoe', 'wash shoe', t(21, 22)],
    ['at 10pm wash shoe', 'wash shoe', t(21, 22)],
    ['tomorrow wash shoe', 'wash shoe', t(22, 22)],
    ['tomorrow 9am wash shoe', 'wash shoe', t(22, 9)],
    ['tomorrow morning wash shoe', 'wash shoe', t(22, 9)],
    ['friday wash shoe', 'wash shoe', t(23, 22)],
    ['in 2 hours wash shoe', 'wash shoe', now + 2 * 3_600_000],
    ['30 oct wash shoe', 'wash shoe', t(30, 22)],
    ['tonight wash shoe at 11pm', 'wash shoe', t(21, 23)],
  ])('%s', (input, text, deadline) => {
    expect(parse(input)).toMatchObject({ text, deadlineAt: deadline })
  })

  it('takes priority and reminders from either end too', () => {
    expect(parse('urgent tomorrow wash shoe')).toMatchObject({ text: 'wash shoe', deadlineAt: t(22, 22), priority: 'high' })
    expect(parse('tomorrow wash shoe, remind at 6pm')).toMatchObject({ text: 'wash shoe', deadlineAt: t(22, 22), remindAt: t(22, 18) })
  })

  it('stays cautious at the start', () => {
    expect(parse('sun cream')).toMatchObject({ text: 'sun cream', deadlineAt: null })
    expect(parse('sat nav update')).toMatchObject({ text: 'sat nav update', deadlineAt: null })
    expect(parse("today's specials")).toMatchObject({ text: "today's specials", deadlineAt: null })
    expect(parse('10 eggs')).toMatchObject({ text: '10 eggs', deadlineAt: null })
  })
})

describe('more phrases from the brief', () => {
  it('"on saturday" means the coming Saturday', () => {
    expect(parse('Wash shoe on saturday')).toMatchObject({ text: 'Wash shoe', deadlineAt: t(24, 22) })
    expect(parse('on saturday wash shoe')).toMatchObject({ text: 'wash shoe', deadlineAt: t(24, 22) })
  })

  it('"10/30 11pm" means 30 October at 11pm', () => {
    expect(parse('Wash shoe on 10/30 11pm')).toMatchObject({ text: 'Wash shoe', deadlineAt: t(30, 23) })
    expect(parse('Wash shoe 11pm on 10/30')).toMatchObject({ text: 'Wash shoe', deadlineAt: t(30, 23) })
    expect(parse('10/30 11pm wash shoe')).toMatchObject({ text: 'wash shoe', deadlineAt: t(30, 23) })
  })

  it('"next weekend" means the weekend after the coming one', () => {
    expect(parse('Wash shoe next weekend')).toMatchObject({ text: 'Wash shoe', deadlineAt: new Date(2026, 10, 1, 22).getTime() })
    expect(parse('Wash shoe this weekend').deadlineAt).toBe(t(25, 22))
    expect(parse('next weekend wash shoe').deadlineAt).toBe(new Date(2026, 10, 1, 22).getTime())
  })
})

describe('month names with a time', () => {
  it.each([
    ['Wash shoe on Nov 2 10:30am', 'Wash shoe'],
    ['Wash shoe 10:30am on Nov 2', 'Wash shoe'],
    ['Wash shoe on november 2nd at 10:30 am', 'Wash shoe'],
    ['Wash shoe 2 nov 10:30am', 'Wash shoe'],
    ['Nov 2 10:30am wash shoe', 'wash shoe'],
  ])('%s', (input, text) => {
    expect(parse(input)).toMatchObject({ text, deadlineAt: new Date(2026, 10, 2, 10, 30).getTime() })
  })
})

describe('numeric dates', () => {
  it.each([
    ['pay rent 10/30', t(30, 22)], // month/day
    ['pay rent 30/10', t(30, 22)], // day/month: 30 can only be the day
    ['pay rent by 10/25', t(25, 22)],
    ['pay rent 10/30/2026', t(30, 22)],
    ['pay rent 10/30/26', t(30, 22)],
    ['pay rent 11/5', new Date(2026, 10, 5, 22).getTime()], // both ≤ 12: month/day → 5 Nov
    ['pay rent 10/5', new Date(2027, 9, 5, 22).getTime()], // passed this year → next year
  ])('%s', (text, deadline) => {
    expect(parse(text)).toMatchObject({ text: 'pay rent', deadlineAt: deadline })
  })

  it('ignores impossible dates and plain fractions', () => {
    expect(parse('pay rent 2/30').deadlineAt).toBeNull()
    expect(parse('pay rent 13/13').deadlineAt).toBeNull()
    expect(parse('flour 1/2 cup')).toMatchObject({ text: 'flour 1/2 cup', deadlineAt: null })
  })

  it('works for reminders', () => {
    expect(parse('renew passport, remind me 10/28 9am')).toMatchObject({ text: 'renew passport', remindAt: t(28, 9) })
  })
})

describe('times', () => {
  it.each([
    ['call bank at 6pm', t(21, 18)],
    ['call bank by 10:30am', t(21, 10, 30)],
    ['call bank 18:00', t(21, 18)],
    ['call bank at 6', t(21, 18)], // bare 1–7 → pm
    ['call bank at 11', t(21, 11)], // bare 8–11 → am
    ['call bank at noon', t(21, 12)],
    ['call bank this evening', t(21, 18)],
    ['call bank at 9am', t(22, 9)], // already past today → tomorrow
  ])('%s', (text, deadline) => {
    expect(parse(text)).toMatchObject({ text: 'call bank', deadlineAt: deadline })
  })

  it('combines a day and a time in either order', () => {
    expect(parse('dentist tomorrow at 4pm').deadlineAt).toBe(t(22, 16))
    expect(parse('dentist at 4pm tomorrow').deadlineAt).toBe(t(22, 16))
    expect(parse('dentist tomorrow morning').deadlineAt).toBe(t(22, 9))
    expect(parse('dentist friday 3pm').deadlineAt).toBe(t(23, 15))
  })

  it('handles relative times', () => {
    expect(parse('take out bread in 30 min').deadlineAt).toBe(now + 30 * 60_000)
    expect(parse('take out bread in 2 hours').deadlineAt).toBe(now + 2 * 3_600_000)
    expect(parse('take out bread in half an hour').deadlineAt).toBe(now + 30 * 60_000)
    expect(parse('renew licence in 3 days').deadlineAt).toBe(t(24, 22))
    expect(parse('renew licence in a week').deadlineAt).toBe(t(28, 22))
  })

  it('"tonight" after 10pm means the last minute of today', () => {
    expect(parse('lock the door tonight', t(21, 22, 30)).deadlineAt).toBe(t(21, 23, 59))
  })
})

describe('days and dates', () => {
  it.each([
    ['pay rent today', t(21, 22)],
    ['pay rent by eod', t(21, 22)],
    ['pay rent day after tomorrow', t(23, 22)],
    ['pay rent tmrw', t(22, 22)],
    ['pay rent friday', t(23, 22)],
    ['pay rent by fri', t(23, 22)],
    ['pay rent on wednesday', t(21, 22)], // today is Wednesday
    ['pay rent next wednesday', t(28, 22)],
    ['pay rent this weekend', t(25, 22)], // Sunday
    ['pay rent next week', t(26, 22)], // Monday
    ['pay rent 30 oct', t(30, 22)],
    ['pay rent october 30th', t(30, 22)],
    ['pay rent on the 25th', t(25, 22)],
    ['pay rent 2026-10-30', t(30, 22)],
  ])('%s', (text, deadline) => {
    expect(parse(text)).toMatchObject({ text: 'pay rent', deadlineAt: deadline })
  })

  it('rolls past dates forward', () => {
    expect(parse('renew passport 5 oct').deadlineAt).toBe(new Date(2027, 9, 5, 22).getTime())
    expect(parse('renew passport on the 3rd').deadlineAt).toBe(new Date(2026, 10, 3, 22).getTime())
  })
})

describe('reminders', () => {
  it('reminds without a deadline', () => {
    expect(parse('water plants remind me at 7pm')).toEqual({ text: 'water plants', deadlineAt: null, remindAt: t(21, 19), priority: undefined })
    expect(parse('water plants, remind me in 2 hours')).toMatchObject({ remindAt: now + 2 * 3_600_000, deadlineAt: null })
    expect(parse('water plants, remind me tomorrow')).toMatchObject({ remindAt: t(22, 9) })
  })

  it('reads "remind me to …" as a reminder, not a deadline', () => {
    expect(parse('remind me to call mom tomorrow at 9am')).toEqual({ text: 'call mom', deadlineAt: null, remindAt: t(22, 9), priority: undefined })
  })

  it('keeps a deadline and a reminder apart', () => {
    expect(parse('submit report friday, remind me thursday 5pm')).toMatchObject({ text: 'submit report', deadlineAt: t(23, 22), remindAt: t(22, 17) })
  })
})

describe('priority', () => {
  it.each([
    ['fix tap urgent', 'high'],
    ['fix tap asap', 'high'],
    ['fix tap!!', 'high'],
    ['fix tap high priority', 'high'],
    ['fix tap p1', 'high'],
    ['urgent: fix tap', 'high'],
    ['fix tap low priority', 'low'],
    ['fix tap whenever', 'low'],
  ])('%s → %s', (text, priority) => {
    expect(parse(text)).toMatchObject({ text: 'fix tap', priority })
  })

  it('a single "!" is just emphasis', () => {
    expect(parse('fix tap!')).toMatchObject({ text: 'fix tap!', priority: undefined })
  })

  it('combines with times in any order', () => {
    expect(parse('fix tap urgent tomorrow 9am')).toMatchObject({ text: 'fix tap', priority: 'high', deadlineAt: t(22, 9) })
  })
})

describe('leaves ordinary text alone', () => {
  it.each([
    'call mom about friday party',
    'buy night cream',
    'call tom',
    'read important email',
    'dry fruits',
    'watch the monday show prep',
    'buy 2 dozen eggs',
    'milk',
  ])('%s', (text) => {
    expect(parse(text)).toEqual({ text, deadlineAt: null, remindAt: null, priority: undefined })
  })

  it('returns empty text when there was only a time phrase', () => {
    expect(parse('remind at 6pm').text).toBe('')
    expect(parse('urgent').text).toBe('')
  })
})
