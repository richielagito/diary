import { buildMonthGrid, monthRange, shiftMonth } from './calendar'

test('September 2026 starts on Tuesday (Monday-first grid)', () => {
  const grid = buildMonthGrid({ year: 2026, month: 9 })
  expect(grid[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
  expect(grid.every((w) => w.length === 7)).toBe(true)
  expect(grid.flat().filter(Boolean)).toHaveLength(30)
  expect(grid.at(-1)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null])
})

test('February in leap year', () => {
  expect(buildMonthGrid({ year: 2024, month: 2 }).flat().filter(Boolean)).toHaveLength(29)
})

test('month starting on Monday has no leading nulls', () => {
  expect(buildMonthGrid({ year: 2026, month: 6 })[0][0]).toBe('2026-06-01')
})

test('shiftMonth wraps years', () => {
  expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
})

test('monthRange is inclusive first..last day', () => {
  expect(monthRange({ year: 2026, month: 2 })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
})
