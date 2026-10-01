import { describe, expect, it } from 'vitest'
import type { DateKey, DayEntry, Mood } from '../domain/types'
import { computeStats } from './computeStats'

function entry(date: DateKey, over: Partial<DayEntry> = {}): DayEntry {
  return { date, markdown: 'x', mood: null, tags: [], wordCount: 10, createdAt: 0, updatedAt: 0, ...over }
}

describe('computeStats heatmap grid', () => {
  it('month Oct 2026 starts on the Monday before the 1st', () => {
    const s = computeStats([], { kind: 'month', year: 2026, month: 10 }, '2026-10-15')
    expect(s.heatmap[0].date).toBe('2026-09-28')
    expect(s.heatmap[0].inRange).toBe(false)
    expect(s.heatmap.findIndex((c) => c.inRange)).toBe(3)
    expect(s.weeks).toBe(5)
  })

  it('year 2028 has 53 weeks and 366 in-range cells', () => {
    const s = computeStats([], { kind: 'year', year: 2028 }, '2028-06-01')
    expect(s.heatmap[0].date).toBe('2027-12-27')
    expect(s.heatmap[s.heatmap.length - 1].date).toBe('2028-12-31')
    expect(s.weeks).toBe(53)
    const inRange = s.heatmap.filter((c) => c.inRange)
    expect(inRange).toHaveLength(366)
    expect(new Set(inRange.map((c) => c.date)).size).toBe(366)
  })

  it('year 2012 has 54 weeks', () => {
    const s = computeStats([], { kind: 'year', year: 2012 }, '2012-06-01')
    expect(s.heatmap[0].date).toBe('2011-12-26')
    expect(s.heatmap[s.heatmap.length - 1].date).toBe('2013-01-06')
    expect(s.weeks).toBe(54)
    const inRange = s.heatmap.filter((c) => c.inRange)
    expect(inRange).toHaveLength(366)
    expect(new Set(inRange.map((c) => c.date)).size).toBe(366)
    expect(s.heatmap[6].date).toBe('2012-01-01')
  })
})

describe('computeStats counts', () => {
  it('empty current month', () => {
    const s = computeStats([], { kind: 'month', year: 2026, month: 10 }, '2026-10-01')
    expect(s.daysWritten).toBe(0)
    expect(s.writtenRatio).toBe(0)
    expect(s.mood.average).toBeNull()
    expect(s.mood.trend).toHaveLength(1)
    expect(s.mood.trend[0].count).toBe(0)
  })

  it('ignores future-dated entries', () => {
    const s = computeStats(
      [entry('2026-10-03'), entry('2026-10-20', { wordCount: 99 })],
      { kind: 'month', year: 2026, month: 10 },
      '2026-10-05',
    )
    expect(s.daysWritten).toBe(1)
    expect(s.totalWords).toBe(10)
    const cell = s.heatmap.find((c) => c.date === '2026-10-20')!
    expect(cell.future).toBe(true)
    expect(cell.entry).toBeNull()
  })

  it('distribution, clipped trend week, unsorted input', () => {
    const s = computeStats(
      [entry('2026-10-03', { mood: 4 }), entry('2026-10-01', { mood: 4 }), entry('2026-10-02', { mood: 2 })],
      { kind: 'month', year: 2026, month: 10 },
      '2026-10-10',
    )
    expect(s.mood.distribution).toEqual({ 1: 0, 2: 1, 3: 0, 4: 2, 5: 0 })
    expect(s.mood.count).toBe(3)
    expect(s.mood.trend[0].from).toBe('2026-10-01')
    expect(s.mood.trend[0].key).toBe('2026-09-28')
    expect(s.mood.trend[0].to).toBe('2026-10-04')
    expect(s.mood.trend[0].average).toBeCloseTo(10 / 3)
    expect(s.mood.brightest).toBeNull()
    expect(s.longestStreak).toBe(3)
    expect(s.currentStreak).toBe(0)
  })
})

describe('computeStats year mood', () => {
  const days = (month: string, mood: Mood, n = 3) =>
    Array.from({ length: n }, (_, i) => entry(`2026-${month}-0${i + 1}`, { mood }))
  const year = { kind: 'year', year: 2026 } as const

  it('brightest/heaviest null with one qualifying month', () => {
    const s = computeStats([...days('01', 5), ...days('02', 1, 2)], year, '2026-12-31')
    expect(s.mood.brightest).toBeNull()
    expect(s.mood.heaviest).toBeNull()
    expect(s.mood.trend).toHaveLength(12)
  })

  it('set with two qualifying months', () => {
    const s = computeStats([...days('01', 5), ...days('02', 1)], year, '2026-12-31')
    expect(s.mood.brightest).toBe('2026-01')
    expect(s.mood.heaviest).toBe('2026-02')
  })

  it('brightest/heaviest null when the qualifying months have equal averages', () => {
    // Tanpa ini Januari tampil sebagai paling cerah sekaligus paling berat
    const s = computeStats([...days('01', 4), ...days('02', 4), ...days('03', 4, 5)], year, '2026-12-31')
    expect(s.mood.brightest).toBeNull()
    expect(s.mood.heaviest).toBeNull()
  })

  it('only months up to elapsedTo', () => {
    const s = computeStats([], year, '2026-03-15')
    expect(s.mood.trend.map((p) => p.key)).toEqual(['2026-01', '2026-02', '2026-03'])
  })
})
