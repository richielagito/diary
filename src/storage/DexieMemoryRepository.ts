import { liveQuery } from 'dexie'
import type { DiaryDB } from './db'
import type { Unsubscribe } from './DiaryRepository'
import type { Memory, MemoryRepository, MemorySource } from './MemoryRepository'

export class DexieMemoryRepository implements MemoryRepository {
  constructor(private readonly db: DiaryDB) {}

  async list(): Promise<Memory[]> {
    return (await this.db.memories.toArray()).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }

  async add(text: string, source: MemorySource, now = Date.now()): Promise<Memory> {
    const memory: Memory = { id: crypto.randomUUID(), text, source, createdAt: now, updatedAt: now }
    await this.db.memories.put(memory)
    return memory
  }

  async edit(id: string, text: string, now = Date.now()): Promise<void> {
    await this.db.transaction('rw', this.db.memories, async () => {
      if (!text.trim()) {
        await this.db.memories.delete(id)
        return
      }
      await this.db.memories.update(id, { text, source: 'user', updatedAt: now })
    })
  }

  async put(memory: Memory): Promise<void> {
    await this.db.memories.put(memory)
  }

  async remove(id: string): Promise<void> {
    await this.db.memories.delete(id)
  }

  putIfUnchanged(memory: Memory, expectedUpdatedAt: number | null): Promise<boolean> {
    return this.db.transaction('rw', this.db.memories, async () => {
      const stored = await this.db.memories.get(memory.id)
      if (expectedUpdatedAt === null) {
        if (stored) return false
      } else if (!stored || stored.source !== 'auto' || stored.updatedAt !== expectedUpdatedAt) {
        return false
      }
      await this.db.memories.put(memory)
      return true
    })
  }

  removeIfUnchanged(id: string, expectedUpdatedAt: number): Promise<boolean> {
    return this.db.transaction('rw', this.db.memories, async () => {
      const stored = await this.db.memories.get(id)
      if (!stored || stored.source !== 'auto' || stored.updatedAt !== expectedUpdatedAt) return false
      await this.db.memories.delete(id)
      return true
    })
  }

  async clear(): Promise<void> {
    await this.db.memories.clear()
  }

  importMany(items: Memory[]): Promise<number> {
    return this.db.transaction('rw', this.db.memories, async () => {
      const existing = await this.db.memories.bulkGet(items.map((m) => m.id))
      const fresh = items.filter((_, i) => !existing[i])
      await this.db.memories.bulkAdd(fresh)
      return fresh.length
    })
  }

  watch(cb: (memories: Memory[]) => void): Unsubscribe {
    const sub = liveQuery(() => this.list()).subscribe({ next: cb })
    return () => sub.unsubscribe()
  }
}
