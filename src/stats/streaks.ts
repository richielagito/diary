import { addDays } from '../domain/date'
import type { DateKey } from '../domain/types'

/** dates: terurut naik dan unik. */
export function longestStreak(dates: DateKey[]): number {
  let best = 0
  let run = 0
  for (let i = 0; i < dates.length; i++) {
    run = i > 0 && dates[i] === addDays(dates[i - 1], 1) ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

/** Berakhir hari ini, atau kemarin kalau hari ini belum menulis. */
export function currentStreak(dates: DateKey[], today: DateKey): number {
  const set = new Set(dates)
  let cursor = set.has(today) ? today : addDays(today, -1)
  let n = 0
  while (set.has(cursor)) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}
