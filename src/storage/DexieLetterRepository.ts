import type { DiaryDB } from './db'
import type { LetterRecord, LetterRepository } from './LetterRepository'

export class DexieLetterRepository implements LetterRepository {
  constructor(private readonly db: DiaryDB) {}

  get(periodId: string): Promise<LetterRecord | undefined> {
    return this.db.letters.get(periodId)
  }

  async put(letter: LetterRecord): Promise<void> {
    await this.db.letters.put(letter)
  }

  async clear(): Promise<void> {
    await this.db.letters.clear()
  }
}
