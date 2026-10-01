import type { EntryInput } from '../domain/types'
import { DiaryDB } from './db'
import { DexieDiaryRepository } from './DexieDiaryRepository'

let db: DiaryDB
let repo: DexieDiaryRepository
const input = (date: string, markdown: string): EntryInput => ({ date, markdown, mood: 3, createdAt: 1, updatedAt: 2 })

beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  repo = new DexieDiaryRepository(db, () => 999)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('adds new entries with derived fields and original timestamps', async () => {
  const r = await repo.importMany([input('2026-09-01', 'a #x'), input('2026-09-02', 'b')], 'skip')
  expect(r).toEqual({ added: 2, overwritten: 0, skipped: 0 })
  expect(await repo.get('2026-09-01')).toEqual({ ...input('2026-09-01', 'a #x'), tags: ['x'], wordCount: 2 })
})

test('skip keeps existing on conflict', async () => {
  await repo.save('2026-09-01', { markdown: 'lama' })
  const r = await repo.importMany([input('2026-09-01', 'baru'), input('2026-09-02', 'b')], 'skip')
  expect(r).toEqual({ added: 1, overwritten: 0, skipped: 1 })
  expect((await repo.get('2026-09-01'))?.markdown).toBe('lama')
})

test('overwrite replaces existing on conflict', async () => {
  await repo.save('2026-09-01', { markdown: 'lama' })
  const r = await repo.importMany([input('2026-09-01', 'baru')], 'overwrite')
  expect(r).toEqual({ added: 0, overwritten: 1, skipped: 0 })
  expect((await repo.get('2026-09-01'))?.markdown).toBe('baru')
})

test('empty entries without mood are skipped, even on overwrite', async () => {
  await repo.save('2026-09-01', { markdown: 'lama' })
  const empty = (date: string): EntryInput => ({ ...input(date, '  \n'), mood: null })
  const moodOnly: EntryInput = { ...input('2026-09-03', ' '), mood: 2 }
  const r = await repo.importMany([empty('2026-09-01'), empty('2026-09-02'), moodOnly], 'overwrite')
  expect(r).toEqual({ added: 1, overwritten: 0, skipped: 2 })
  expect((await repo.get('2026-09-01'))?.markdown).toBe('lama')
  expect(await repo.get('2026-09-02')).toBeUndefined()
  expect((await repo.get('2026-09-03'))?.mood).toBe(2)
})

test('failure rolls back the whole import', async () => {
  const bad = { ...input('2026-09-02', 'b'), date: undefined } as unknown as EntryInput
  await expect(repo.importMany([input('2026-09-01', 'a'), bad], 'skip')).rejects.toThrow()
  expect(await repo.list()).toEqual([])
})
