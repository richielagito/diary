import { describe, expect, it } from 'vitest'
import { currentStreak, longestStreak } from './streaks'

describe('longestStreak', () => {
  it('spans month boundary', () => {
    expect(longestStreak(['2026-02-27', '2026-02-28', '2026-03-01'])).toBe(3)
  })
  it('spans year boundary', () => {
    expect(longestStreak(['2027-12-31', '2028-01-01'])).toBe(2)
  })
  it('within a range counts a run that touches it at full length, across the month boundary', () => {
    const dates = ['2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02', '2026-03-10']
    expect(longestStreak(dates, { from: '2026-03-01', to: '2026-03-31' })).toBe(5)
    expect(longestStreak(dates, { from: '2026-03-05', to: '2026-03-31' })).toBe(1)
    expect(longestStreak(dates, { from: '2026-04-01', to: '2026-04-30' })).toBe(0)
  })
  it('empty', () => expect(longestStreak([])).toBe(0))
  it('picks the longest run', () => {
    expect(longestStreak(['2026-03-01', '2026-03-03', '2026-03-04', '2026-03-05'])).toBe(3)
  })
})

describe('currentStreak', () => {
  const dates = ['2026-02-27', '2026-02-28', '2026-03-01']
  it('counts from yesterday when today is missing', () => {
    expect(currentStreak(dates, '2026-03-02')).toBe(3)
  })
  it('counts through today', () => {
    expect(currentStreak([...dates, '2026-03-02'], '2026-03-02')).toBe(4)
  })
  it('is 0 after a gap', () => expect(currentStreak(dates, '2026-03-03')).toBe(0))
  it('empty', () => expect(currentStreak([], '2026-03-02')).toBe(0))
})
