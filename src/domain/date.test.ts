import { dateKey, isValidDateKey, parseDateKey, toLocalIso } from './date'

describe('dateKey', () => {
  test('uses local time, not UTC', () => {
    // 17:30 UTC = 00:30 WIB keesokan harinya
    expect(dateKey(new Date('2026-09-27T17:30:00Z'))).toBe('2026-09-28')
  })
  test('pads month and day', () => {
    expect(dateKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })
  test('23:59 local stays on same day', () => {
    expect(dateKey(new Date(2026, 8, 27, 23, 59, 59))).toBe('2026-09-27')
  })
})

describe('isValidDateKey', () => {
  test.each(['2026-09-27', '2024-02-29'])('accepts %s', (k) => {
    expect(isValidDateKey(k)).toBe(true)
  })
  test.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-9-27', '26-09-27', 'abc', ''])('rejects %s', (k) => {
    expect(isValidDateKey(k)).toBe(false)
  })
})

test('parseDateKey returns local midnight', () => {
  const d = parseDateKey('2026-09-27')
  expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 27, 0])
})

test('toLocalIso includes local offset', () => {
  expect(toLocalIso(Date.parse('2026-09-27T01:12:00Z'))).toBe('2026-09-27T08:12:00+07:00')
})
