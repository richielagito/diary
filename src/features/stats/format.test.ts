import { formatMood, formatNumber, monthKeyLabel, periodLabel, trendLabel } from './format'

test('formatNumber uses the locale separator', () => {
  expect(formatNumber(58300, 'id')).toBe('58.300')
  expect(formatNumber(58300, 'en')).toBe('58,300')
})

test('formatMood has one decimal and locale separator', () => {
  expect(formatMood(3.25, 'id')).toBe('3,3')
  expect(formatMood(3.25, 'en')).toBe('3.3')
})

test('periodLabel', () => {
  expect(periodLabel({ kind: 'month', year: 2026, month: 10 }, 'id')).toBe('Oktober 2026')
  expect(periodLabel({ kind: 'year', year: 2026 }, 'id')).toBe('2026')
})

test('trendLabel: day range for month, short month name for year', () => {
  expect(trendLabel({ key: '2026-09-28', from: '2026-10-01', to: '2026-10-04', average: null, count: 0 }, 'month', 'id')).toBe('1–4')
  expect(trendLabel({ key: '2026-10', from: '2026-10-01', to: '2026-10-31', average: null, count: 0 }, 'year', 'id')).toBe('Okt')
})

test('monthKeyLabel', () => {
  expect(monthKeyLabel('2026-10', 'id')).toBe('Oktober')
})
