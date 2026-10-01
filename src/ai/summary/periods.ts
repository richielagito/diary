import { addDays, dateKey, parseDateKey } from '../../domain/date'
import type { DateKey } from '../../domain/types'
import type { SummaryKind } from '../../storage/SummaryRepository'

export { addDays }

export interface Period {
  id: string
  kind: SummaryKind
  start: DateKey
  end: DateKey
}

/** Senin dari minggu ISO yang memuat tanggal ini. */
export function weekStart(k: DateKey): DateKey {
  const d = parseDateKey(k)
  return addDays(k, -((d.getDay() + 6) % 7))
}

export function completedWeeks(today: DateKey, count = 8): Period[] {
  const thisWeek = weekStart(today)
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(thisWeek, -7 * (i + 1))
    return { id: `week:${start}`, kind: 'week' as const, start, end: addDays(start, 6) }
  })
}

export function completedMonths(today: DateKey, count = 6): Period[] {
  const t = parseDateKey(today)
  return Array.from({ length: count }, (_, i) => {
    const first = new Date(t.getFullYear(), t.getMonth() - (i + 1), 1)
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
    const start = dateKey(first)
    return { id: `month:${start.slice(0, 7)}`, kind: 'month' as const, start, end: dateKey(last) }
  })
}

export function completedPeriods(today: DateKey): Period[] {
  return [...completedWeeks(today), ...completedMonths(today)].sort(
    (a, b) => b.end.localeCompare(a.end) || (a.kind === b.kind ? 0 : a.kind === 'week' ? -1 : 1),
  )
}
