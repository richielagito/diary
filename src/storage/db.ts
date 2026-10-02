import Dexie, { type EntityTable } from 'dexie'
import type { DayEntry, Mood } from '../domain/types'
import type { ChatMessage } from './ChatRepository'
import type { LetterRecord } from './LetterRepository'
import type { Memory } from './MemoryRepository'
import type { Summary } from './SummaryRepository'

export interface SettingRow {
  key: string
  value: unknown
}

/** Keadaan terakhir sebuah record yang diketahui ada di server. Beda dari isi lokal berarti perlu dikirim. */
export interface SyncIndexRow {
  /** Id record di server (HMAC dari koleksi dan kunci). */
  id: string
  c: string
  k: string
  t: number
  rev: number
  deleted: boolean
  /** entries: teks dan mood di server, untuk gabung tiga arah. settings: JSON nilai di server. */
  base?: { markdown: string; mood: Mood | null } | string
}

export interface SyncStateRow {
  key: string
  value: unknown
}

export class DiaryDB extends Dexie {
  entries!: EntityTable<DayEntry, 'date'>
  settings!: EntityTable<SettingRow, 'key'>
  chatMessages!: EntityTable<ChatMessage, 'id'>
  memories!: EntityTable<Memory, 'id'>
  summaries!: EntityTable<Summary, 'id'>
  letters!: EntityTable<LetterRecord, 'periodId'>
  syncIndex!: EntityTable<SyncIndexRow, 'id'>
  syncState!: EntityTable<SyncStateRow, 'key'>

  constructor(name = 'diary') {
    super(name)
    this.version(1).stores({
      entries: 'date, *tags, updatedAt',
      settings: 'key',
    })
    this.version(2).stores({
      chatMessages: 'id, date, [date+createdAt]',
    })
    this.version(3).stores({
      memories: 'id, updatedAt',
      summaries: 'id, kind, periodStart',
    })
    this.version(4).stores({
      letters: 'periodId',
    })
    this.version(5).stores({
      syncIndex: 'id, [c+k]',
      syncState: 'key',
    })
  }
}
