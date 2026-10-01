import { describe, expect, it } from 'vitest'
import { comparePeriods, daysBetween, parsePeriodId, periodContaining, periodId, periodRange, shiftPeriod } from './range'

describe('periodRange', () => {
  it('past month', () => {
    expect(periodRange({ kind: 'month', year: 2026, month: 2 }, '2026-10-01')).toEqual({
      from: '2026-02-01', to: '2026-02-28', elapsedTo: '2026-02-28', days: 28, elapsedDays: 28, isCurrent: false,
    })
  })
  it('leap february', () => {
    expect(periodRange({ kind: 'month', year: 2028, month: 2 }, '2028-10-01').to).toBe('2028-02-29')
  })
  it('current month on day 1', () => {
    const r = periodRange({ kind: 'month', year: 2026, month: 10 }, '2026-10-01')
    expect(r.elapsedTo).toBe('2026-10-01')
    expect(r.elapsedDays).toBe(1)
    expect(r.isCurrent).toBe(true)
  })
  it('future year has no elapsed days', () => {
    const r = periodRange({ kind: 'year', year: 2027 }, '2026-10-01')
    expect(r.elapsedDays).toBe(0)
    expect(r.elapsedTo).toBe('2026-12-31')
    expect(r.isCurrent).toBe(false)
  })
})

describe('period ids', () => {
  it('formats', () => {
    expect(periodId({ kind: 'year', year: 2026 })).toBe('2026')
    expect(periodId({ kind: 'month', year: 2026, month: 9 })).toBe('2026-09')
  })
  it('parses', () => {
    expect(parsePeriodId('2026-13')).toBeNull()
    expect(parsePeriodId('26')).toBeNull()
    expect(parsePeriodId('2026-09')).toEqual({ kind: 'month', year: 2026, month: 9 })
    expect(parsePeriodId('2026')).toEqual({ kind: 'year', year: 2026 })
  })
})

describe('shift / contain / compare', () => {
  it('wraps months', () => {
    expect(shiftPeriod({ kind: 'month', year: 2026, month: 1 }, -1)).toEqual({ kind: 'month', year: 2025, month: 12 })
    expect(shiftPeriod({ kind: 'month', year: 2026, month: 12 }, 2)).toEqual({ kind: 'month', year: 2027, month: 2 })
    expect(shiftPeriod({ kind: 'year', year: 2026 }, 1)).toEqual({ kind: 'year', year: 2027 })
  })
  it('periodContaining', () => {
    expect(periodContaining('month', '2026-09-30')).toEqual({ kind: 'month', year: 2026, month: 9 })
    expect(periodContaining('year', '2026-09-30')).toEqual({ kind: 'year', year: 2026 })
  })
  it('comparePeriods', () => {
    const a = { kind: 'month', year: 2025, month: 12 } as const
    const b = { kind: 'month', year: 2026, month: 1 } as const
    expect(comparePeriods(a, b)).toBeLessThan(0)
    expect(comparePeriods(b, a)).toBeGreaterThan(0)
    expect(comparePeriods(a, a)).toBe(0)
  })
  it('daysBetween', () => {
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(3)
    expect(daysBetween('2026-03-02', '2026-03-01')).toBe(0)
  })
})
