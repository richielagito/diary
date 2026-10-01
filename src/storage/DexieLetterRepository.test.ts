import Dexie from 'dexie'
import { DiaryDB } from './db'
import { DexieDiaryRepository } from './DexieDiaryRepository'
import { DexieLetterRepository } from './DexieLetterRepository'

let db: DiaryDB
let repo: DexieLetterRepository
beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  repo = new DexieLetterRepository(db)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('put and get round-trip, overwrite by periodId, clear', async () => {
  expect(await repo.get('2026-09')).toBeUndefined()
  await repo.put({ periodId: '2026-09', text: 'satu', fingerprint: 'a', createdAt: 1 })
  await repo.put({ periodId: '2026', text: 'tahun', fingerprint: 'b', createdAt: 2 })
  expect(await repo.get('2026-09')).toEqual({ periodId: '2026-09', text: 'satu', fingerprint: 'a', createdAt: 1 })
  await repo.put({ periodId: '2026-09', text: 'dua', fingerprint: 'c', createdAt: 3 })
  expect((await repo.get('2026-09'))?.text).toBe('dua')
  await repo.clear()
  expect(await repo.get('2026-09')).toBeUndefined()
  expect(await repo.get('2026')).toBeUndefined()
})

test('upgrading a v3 database with data to v4 keeps everything', async () => {
  const name = `test-${crypto.randomUUID()}`
  const v3 = new Dexie(name)
  v3.version(1).stores({ entries: 'date, *tags, updatedAt', settings: 'key' })
  v3.version(2).stores({ chatMessages: 'id, date, [date+createdAt]' })
  v3.version(3).stores({ memories: 'id, updatedAt', summaries: 'id, kind, periodStart' })
  await v3.table('entries').put({ date: '2026-09-01', markdown: 'lama', mood: 3, tags: [], wordCount: 1, createdAt: 1, updatedAt: 1 })
  await v3.table('memories').put({ id: 'm1', text: 'kucing', source: 'auto', createdAt: 1, updatedAt: 1 })
  v3.close()

  const upgraded = new DiaryDB(name)
  expect((await new DexieDiaryRepository(upgraded).get('2026-09-01'))?.markdown).toBe('lama')
  expect(await upgraded.memories.count()).toBe(1)
  const letters = new DexieLetterRepository(upgraded)
  await letters.put({ periodId: '2026', text: 'x', fingerprint: 'f', createdAt: 1 })
  expect((await letters.get('2026'))?.text).toBe('x')
  upgraded.close()
  await upgraded.delete()
})
