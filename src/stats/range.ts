import { addDays, dateKey, parseDateKey } from '../domain/date'
import type { DateKey } from '../domain/types'

export type StatsPeriod = { kind: 'month'; year: number; month: number /* 1-12 */ } | { kind: 'year'; year: number }

export interface PeriodRange {
  from: DateKey
  to: DateKey
  elapsedTo: DateKey // min(to, today); kalau today < from maka addDays(from, -1)
  days: number
  elapsedDays: number
  isCurrent: boolean
}

/** Jumlah hari inklusif; 0 kalau to < from. */
export function daysBetween(from: DateKey, to: DateKey): number {
  if (to < from) return 0
  const a = parseDateKey(from)
  const b = parseDateKey(to)
  // UTC menghindari selisih jam DST
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  return Math.round(ms / 86_400_000) + 1
}

export function periodRange(p: StatsPeriod, today: DateKey): PeriodRange {
  const first = p.kind === 'month' ? new Date(p.year, p.month - 1, 1) : new Date(p.year, 0, 1)
  const last = p.kind === 'month' ? new Date(p.year, p.month, 0) : new Date(p.year, 11, 31)
  const from = dateKey(first)
  const to = dateKey(last)
  const elapsedTo = today < from ? addDays(from, -1) : today < to ? today : to
  return {
    from,
    to,
    elapsedTo,
    days: daysBetween(from, to),
    elapsedDays: daysBetween(from, elapsedTo),
    isCurrent: from <= today && today <= to,
  }
}

export function periodId(p: StatsPeriod): string {
  return p.kind === 'year' ? String(p.year) : `${p.year}-${String(p.month).padStart(2, '0')}`
}

export function parsePeriodId(id: string): StatsPeriod | null {
  if (/^\d{4}$/.test(id)) return { kind: 'year', year: Number(id) }
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(id)
  return m ? { kind: 'month', year: Number(m[1]), month: Number(m[2]) } : null
}

export function shiftPeriod(p: StatsPeriod, delta: number): StatsPeriod {
  if (p.kind === 'year') return { kind: 'year', year: p.year + delta }
  const idx = p.year * 12 + (p.month - 1) + delta
  return { kind: 'month', year: Math.floor(idx / 12), month: (((idx % 12) + 12) % 12) + 1 }
}

export function periodContaining(kind: 'month' | 'year', date: DateKey): StatsPeriod {
  const d = parseDateKey(date)
  return kind === 'year'
    ? { kind: 'year', year: d.getFullYear() }
    : { kind: 'month', year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** Hanya untuk kind yang sama; urut menurut tanggal mulai. */
export function comparePeriods(a: StatsPeriod, b: StatsPeriod): number {
  return periodRange(a, '1970-01-01').from.localeCompare(periodRange(b, '1970-01-01').from)
}
