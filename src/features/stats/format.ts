import { parseDateKey } from '../../domain/date'
import type { StatsPeriod } from '../../stats/range'
import type { TrendPoint } from '../../stats/computeStats'

export function periodLabel(p: StatsPeriod, language: string): string {
  if (p.kind === 'year') return String(p.year)
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(new Date(p.year, p.month - 1, 1))
}

/** Bulan: rentang hari ('1–4'); tahun: nama bulan singkat ('Okt'). */
export function trendLabel(point: TrendPoint, kind: 'month' | 'year', language: string): string {
  const from = parseDateKey(point.from)
  if (kind === 'year') return new Intl.DateTimeFormat(language, { month: 'short' }).format(from)
  const nf = new Intl.NumberFormat(language)
  const a = from.getDate()
  const b = parseDateKey(point.to).getDate()
  return a === b ? nf.format(a) : `${nf.format(a)}–${nf.format(b)}`
}

/** 'YYYY-MM' -> nama bulan panjang. */
export function monthKeyLabel(key: string, language: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(language, { month: 'long' }).format(new Date(y, m - 1, 1))
}

export function formatNumber(n: number, language: string): string {
  return new Intl.NumberFormat(language).format(n)
}

export function formatMood(avg: number, language: string): string {
  return new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(avg)
}
