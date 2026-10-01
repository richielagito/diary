import Dexie, { type EntityTable } from 'dexie'
import type { DayEntry } from '../domain/types'
import type { ChatMessage } from './ChatRepository'
import type { LetterRecord } from './LetterRepository'
import type { Memory } from './MemoryRepository'
import type { Summary } from './SummaryRepository'

export interface SettingRow {
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
  }
}
