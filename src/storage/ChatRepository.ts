import type { DateKey } from '../domain/types'
import type { Unsubscribe } from './DiaryRepository'

export interface ChatMessage {
  id: string
  date: DateKey
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  /** 'stopped' = user menekan berhenti; teks parsial disimpan */
  status: 'complete' | 'stopped'
}

export type NewChatMessage = Omit<ChatMessage, 'id'>

export interface ChatRepository {
  /** Urut createdAt naik. */
  listByDate(date: DateKey): Promise<ChatMessage[]>
  /** Semua pesan, urut tanggal lalu createdAt naik (untuk export). */
  listAll(): Promise<ChatMessage[]>
  add(message: NewChatMessage): Promise<ChatMessage>
  deleteByDate(date: DateKey): Promise<void>
  /** Menyimpan pesan yang id-nya belum ada, dalam satu transaksi. Mengembalikan jumlah yang ditambah. */
  importMany(messages: ChatMessage[]): Promise<number>
  /** Tanggal yang punya percakapan, urut naik, unik. */
  datesWithChats(): Promise<DateKey[]>
  watchByDate(date: DateKey, cb: (messages: ChatMessage[]) => void): Unsubscribe
}
