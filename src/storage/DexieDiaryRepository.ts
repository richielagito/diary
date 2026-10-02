import { liveQuery } from 'dexie'
import { extractTags } from '../domain/tags'
import type { DateKey, DayEntry, EntryInput, Mood } from '../domain/types'
import { wordCount } from '../domain/wordCount'
import type { DiaryDB } from './db'
import { StaleTextError, type DiaryRepository, type ImportResult, type Unsubscribe } from './DiaryRepository'

export function withDerived(input: EntryInput): DayEntry {
  return { ...input, tags: extractTags(input.markdown), wordCount: wordCount(input.markdown) }
}

export class DexieDiaryRepository implements DiaryRepository {
  constructor(
    private readonly db: DiaryDB,
    private readonly now: () => number = Date.now,
  ) {}

  get(date: DateKey): Promise<DayEntry | undefined> {
    return this.db.entries.get(date)
  }

  save(date: DateKey, patch: { markdown?: string; mood?: Mood | null; baseMarkdown?: string }): Promise<DayEntry | null> {
    return this.db.transaction('rw', this.db.entries, async () => {
      const existing = await this.db.entries.get(date)
      if (patch.markdown !== undefined && patch.baseMarkdown !== undefined && (existing?.markdown ?? '') !== patch.baseMarkdown) {
        throw new StaleTextError(existing?.markdown ?? '')
      }
      const markdown = patch.markdown ?? existing?.markdown ?? ''
      const mood = patch.mood !== undefined ? patch.mood : (existing?.mood ?? null)
      if (markdown.trim() === '' && mood === null) {
        if (existing) await this.db.entries.delete(date)
        return null
      }
      const t = this.now()
      const entry = withDerived({ date, markdown, mood, createdAt: existing?.createdAt ?? t, updatedAt: t })
      await this.db.entries.put(entry)
      return entry
    })
  }

  appendToEntry(date: DateKey, text: string, moodIfEmpty: Mood | null): Promise<DayEntry> {
    const addition = text.trim()
    if (addition === '') return Promise.reject(new Error('Cannot append empty text'))
    return this.db.transaction('rw', this.db.entries, async () => {
      const existing = await this.db.entries.get(date)
      const markdown = existing && existing.markdown.trim() !== '' ? `${existing.markdown.trimEnd()}\n\n${addition}` : addition
      const mood = existing?.mood ?? moodIfEmpty
      const t = this.now()
      const entry = withDerived({ date, markdown, mood, createdAt: existing?.createdAt ?? t, updatedAt: t })
      await this.db.entries.put(entry)
      return entry
    })
  }

  list(range?: { from: DateKey; to: DateKey }): Promise<DayEntry[]> {
    if (range) return this.db.entries.where('date').between(range.from, range.to, true, true).toArray()
    return this.db.entries.orderBy('date').toArray()
  }

  delete(date: DateKey): Promise<void> {
    return this.db.entries.delete(date)
  }

  importMany(entries: EntryInput[], onConflict: 'skip' | 'overwrite'): Promise<ImportResult> {
    return this.db.transaction('rw', this.db.entries, async () => {
      const result: ImportResult = { added: 0, overwritten: 0, skipped: 0 }
      for (const input of entries) {
        // Entri kosong tanpa mood tidak pernah disimpan.
        if (input.markdown.trim() === '' && input.mood === null) {
          result.skipped++
          continue
        }
        const existing = await this.db.entries.get(input.date)
        if (existing && onConflict === 'skip') {
          result.skipped++
          continue
        }
        await this.db.entries.put(withDerived(input))
        if (existing) result.overwritten++
        else result.added++
      }
      return result
    })
  }

  watch(date: DateKey, cb: (entry: DayEntry | undefined) => void): Unsubscribe {
    const sub = liveQuery(() => this.db.entries.get(date)).subscribe({ next: cb })
    return () => sub.unsubscribe()
  }

  watchFirstCreatedAt(cb: (ms: number | null) => void): Unsubscribe {
    const sub = liveQuery(async () => {
      let min: number | null = null
      await this.db.entries.each((e) => {
        if (min === null || e.createdAt < min) min = e.createdAt
      })
      return min
    }).subscribe({ next: cb })
    return () => sub.unsubscribe()
  }
}
