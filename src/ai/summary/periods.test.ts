import { addDays, completedMonths, completedPeriods, completedWeeks, weekStart } from './periods'

test('weekStart returns the Monday', () => {
  expect(weekStart('2026-09-28')).toBe('2026-09-28') // Senin
  expect(weekStart('2026-09-27')).toBe('2026-09-21') // Minggu
  expect(weekStart('2026-10-01')).toBe('2026-09-28')
})

test('addDays crosses months', () => {
  expect(addDays('2026-09-28', 6)).toBe('2026-10-04')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
})

test('completed weeks exclude the current week, newest first', () => {
  expect(completedWeeks('2026-09-28', 2)).toEqual([
    { id: 'week:2026-09-21', kind: 'week', start: '2026-09-21', end: '2026-09-27' },
    { id: 'week:2026-09-14', kind: 'week', start: '2026-09-14', end: '2026-09-20' },
  ])
  expect(completedWeeks('2026-09-27', 1)[0].start).toBe('2026-09-14')
  expect(completedWeeks('2026-09-28')).toHaveLength(8)
})

test('completed months exclude the current month and wrap years', () => {
  expect(completedMonths('2026-01-15', 2)).toEqual([
    { id: 'month:2025-12', kind: 'month', start: '2025-12-01', end: '2025-12-31' },
    { id: 'month:2025-11', kind: 'month', start: '2025-11-01', end: '2025-11-30' },
  ])
  expect(completedMonths('2026-03-10', 1)[0]).toMatchObject({ start: '2026-02-01', end: '2026-02-28' })
  expect(completedMonths('2026-09-28')).toHaveLength(6)
})

test('completedPeriods merges newest first, week before month on equal end', () => {
  const ids = completedPeriods('2026-09-01').map((p) => p.id)
  expect(ids.slice(0, 3)).toEqual(['month:2026-08', 'week:2026-08-24', 'week:2026-08-17'])
  expect(ids).toHaveLength(14)
})
