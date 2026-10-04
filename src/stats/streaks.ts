import { addDays } from '../domain/date'
import type { DateKey } from '../domain/types'

/**
 * dates: terurut naik dan unik. Dengan `within`, hanya runtun yang menyentuh rentang itu yang dihitung, tapi
 * panjangnya utuh melewati batas bulan atau tahun, supaya runtun terpanjang tidak pernah kalah dari runtun saat ini.
 */
export function longestStreak(dates: DateKey[], within?: { from: DateKey; to: DateKey }): number {
  let best = 0
  let run = 0
  let start = ''
  for (let i = 0; i < dates.length; i++) {
    if (i > 0 && dates[i] === addDays(dates[i - 1], 1)) run++
    else {
      run = 1
      start = dates[i]
    }
    if (run > best && (!within || (start <= within.to && dates[i] >= within.from))) best = run
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
