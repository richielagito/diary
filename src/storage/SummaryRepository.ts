import type { DateKey } from '../domain/types'
import type { Unsubscribe } from './DiaryRepository'

export type SummaryKind = 'week' | 'month'

export interface Summary {
  /** 'week:<YYYY-MM-DD senin>' atau 'month:<YYYY-MM>' */
  id: string
  kind: SummaryKind
  periodStart: DateKey
  periodEnd: DateKey
  text: string
  /** Jumlah entri saat ringkasan dibuat. */
  entryCount: number
  /** updatedAt terbesar dari entri saat ringkasan dibuat. */
  sourceUpdatedAt: number
  createdAt: number
}

export interface SummaryRepository {
  get(id: string): Promise<Summary | undefined>
  /** Urut periodStart naik. */
  list(): Promise<Summary[]>
  put(summary: Summary): Promise<void>
  remove(id: string): Promise<void>
  watch(cb: (summaries: Summary[]) => void): Unsubscribe
}
