import { dateKey } from './date'
import type { DateKey } from './types'

export interface YearMonth {
  year: number
  month: number // 1-12
}

export function buildMonthGrid({ year, month }: YearMonth): (DateKey | null)[][] {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const leading = (first.getDay() + 6) % 7 // Senin = 0
  const cells: (DateKey | null)[] = Array(leading).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(dateKey(new Date(year, month - 1, d)))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (DateKey | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function monthRange({ year, month }: YearMonth): { from: DateKey; to: DateKey } {
  return { from: dateKey(new Date(year, month - 1, 1)), to: dateKey(new Date(year, month, 0)) }
}
