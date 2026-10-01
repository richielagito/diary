import Dexie from 'dexie'
import { DiaryDB } from './db'
import { DexieChatRepository } from './DexieChatRepository'
import { DexieDiaryRepository } from './DexieDiaryRepository'
import { DexieMemoryRepository } from './DexieMemoryRepository'

let db: DiaryDB
let repo: DexieMemoryRepository
beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  repo = new DexieMemoryRepository(db)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('add and list in createdAt order', async () => {
  await repo.add('kedua', 'auto', 20)
  const first = await repo.add('pertama', 'user', 10)
  expect(first).toMatchObject({ text: 'pertama', source: 'user', createdAt: 10, updatedAt: 10 })
  expect((await repo.list()).map((m) => m.text)).toEqual(['pertama', 'kedua'])
})

test('edit marks memory as user-owned; empty text deletes it', async () => {
  const m = await repo.add('kuliah di UI', 'auto', 1)
  await repo.edit(m.id, 'kuliah di ITB', 5)
  expect(await repo.list()).toEqual([{ ...m, text: 'kuliah di ITB', source: 'user', updatedAt: 5 }])
  await repo.edit(m.id, '   ', 6)
  expect(await repo.list()).toEqual([])
})

test('put, remove and clear', async () => {
  const m = await repo.add('a', 'auto', 1)
  await repo.put({ ...m, text: 'b' })
  expect((await repo.list())[0].text).toBe('b')
  await repo.add('c', 'auto', 2)
  await repo.remove(m.id)
  expect((await repo.list()).map((x) => x.text)).toEqual(['c'])
  await repo.clear()
  expect(await repo.list()).toEqual([])
})

test('importMany skips existing ids', async () => {
  const m = await repo.add('ada', 'user', 1)
  const added = await repo.importMany([
    { ...m, text: 'jangan timpa' },
    { id: 'baru', text: 'baru', source: 'auto', createdAt: 2, updatedAt: 2 },
  ])
  expect(added).toBe(1)
  expect((await repo.list()).map((x) => x.text)).toEqual(['ada', 'baru'])
})

test('watch emits changes', async () => {
  const seen: number[] = []
  const unsub = repo.watch((m) => seen.push(m.length))
  await vi.waitFor(() => expect(seen).toEqual([0]))
  await repo.add('x', 'auto', 1)
  await vi.waitFor(() => expect(seen).toEqual([0, 1]))
  unsub()
})

test('upgrading a v2 database with data to v3 keeps everything', async () => {
  const name = `test-${crypto.randomUUID()}`
  const v2 = new Dexie(name)
  v2.version(1).stores({ entries: 'date, *tags, updatedAt', settings: 'key' })
  v2.version(2).stores({ chatMessages: 'id, date, [date+createdAt]' })
  await v2.table('entries').put({ date: '2026-09-01', markdown: 'lama', mood: 3, tags: [], wordCount: 1, createdAt: 1, updatedAt: 1 })
  await v2.table('settings').put({ key: 'theme', value: 'dark' })
  await v2.table('chatMessages').put({ id: 'c1', date: '2026-09-01', role: 'user', content: 'halo', createdAt: 1, status: 'complete' })
  v2.close()

  const upgraded = new DiaryDB(name)
  expect((await new DexieDiaryRepository(upgraded).get('2026-09-01'))?.markdown).toBe('lama')
  expect(await upgraded.settings.get('theme')).toEqual({ key: 'theme', value: 'dark' })
  expect(await new DexieChatRepository(upgraded).listByDate('2026-09-01')).toHaveLength(1)
  await new DexieMemoryRepository(upgraded).add('baru', 'auto', 1)
  expect(await upgraded.memories.count()).toBe(1)
  upgraded.close()
  await upgraded.delete()
})

describe('conditional writes', () => {
  test('putIfUnchanged adds only when the id is absent (null)', async () => {
    const m = { id: 'x', text: 'a', source: 'auto' as const, createdAt: 1, updatedAt: 1 }
    expect(await repo.putIfUnchanged(m, null)).toBe(true)
    expect(await repo.putIfUnchanged({ ...m, text: 'b' }, null)).toBe(false)
    expect((await repo.list())[0].text).toBe('a')
  })

  test('putIfUnchanged overwrites only an unchanged auto record', async () => {
    const m = await repo.add('a', 'auto', 1)
    expect(await repo.putIfUnchanged({ ...m, text: 'b', updatedAt: 2 }, 1)).toBe(true)
    expect(await repo.putIfUnchanged({ ...m, text: 'c', updatedAt: 3 }, 1)).toBe(false)
    expect((await repo.list())[0].text).toBe('b')
    expect(await repo.putIfUnchanged({ ...m, id: 'ghost' }, 1)).toBe(false)
    await repo.edit(m.id, 'user text', 9)
    expect(await repo.putIfUnchanged({ ...m, text: 'ai', updatedAt: 10 }, 9)).toBe(false)
    expect((await repo.list())[0]).toMatchObject({ text: 'user text', source: 'user' })
  })

  test('removeIfUnchanged deletes only an unchanged auto record', async () => {
    const a = await repo.add('a', 'auto', 1)
    const u = await repo.add('u', 'user', 1)
    expect(await repo.removeIfUnchanged(a.id, 2)).toBe(false)
    expect(await repo.removeIfUnchanged(u.id, 1)).toBe(false)
    expect(await repo.removeIfUnchanged('ghost', 1)).toBe(false)
    expect(await repo.removeIfUnchanged(a.id, 1)).toBe(true)
    expect((await repo.list()).map((m) => m.id)).toEqual([u.id])
  })
})
