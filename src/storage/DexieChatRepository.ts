import Dexie, { liveQuery } from 'dexie'
import type { DateKey } from '../domain/types'
import type { ChatMessage, ChatRepository, NewChatMessage } from './ChatRepository'
import type { DiaryDB } from './db'
import type { Unsubscribe } from './DiaryRepository'

export class DexieChatRepository implements ChatRepository {
  constructor(private readonly db: DiaryDB) {}

  private byDate(date: DateKey) {
    return this.db.chatMessages.where('[date+createdAt]').between([date, Dexie.minKey], [date, Dexie.maxKey])
  }

  listByDate(date: DateKey): Promise<ChatMessage[]> {
    return this.byDate(date).toArray()
  }

  listAll(): Promise<ChatMessage[]> {
    return this.db.chatMessages.orderBy('[date+createdAt]').toArray()
  }

  async add(message: NewChatMessage): Promise<ChatMessage> {
    const saved: ChatMessage = { ...message, id: crypto.randomUUID() }
    await this.db.chatMessages.put(saved)
    return saved
  }

  async deleteByDate(date: DateKey): Promise<void> {
    await this.db.chatMessages.where('date').equals(date).delete()
  }

  importMany(messages: ChatMessage[]): Promise<number> {
    return this.db.transaction('rw', this.db.chatMessages, async () => {
      const unique = [...new Map(messages.map((m) => [m.id, m])).values()]
      const existing = await this.db.chatMessages.bulkGet(unique.map((m) => m.id))
      const fresh = unique.filter((_, i) => existing[i] === undefined)
      await this.db.chatMessages.bulkAdd(fresh)
      return fresh.length
    })
  }

  async datesWithChats(): Promise<DateKey[]> {
    return (await this.db.chatMessages.orderBy('date').uniqueKeys()) as DateKey[]
  }

  watchByDate(date: DateKey, cb: (messages: ChatMessage[]) => void): Unsubscribe {
    const sub = liveQuery(() => this.byDate(date).toArray()).subscribe({ next: cb })
    return () => sub.unsubscribe()
  }
}
