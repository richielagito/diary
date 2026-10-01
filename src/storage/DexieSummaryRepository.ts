import { liveQuery } from 'dexie'
import type { DiaryDB } from './db'
import type { Unsubscribe } from './DiaryRepository'
import type { Summary, SummaryRepository } from './SummaryRepository'

export class DexieSummaryRepository implements SummaryRepository {
  constructor(private readonly db: DiaryDB) {}

  get(id: string): Promise<Summary | undefined> {
    return this.db.summaries.get(id)
  }

  list(): Promise<Summary[]> {
    return this.db.summaries.orderBy('periodStart').toArray()
  }

  async put(summary: Summary): Promise<void> {
    await this.db.summaries.put(summary)
  }

  async remove(id: string): Promise<void> {
    await this.db.summaries.delete(id)
  }

  watch(cb: (summaries: Summary[]) => void): Unsubscribe {
    const sub = liveQuery(() => this.list()).subscribe({ next: cb })
    return () => sub.unsubscribe()
  }
}
