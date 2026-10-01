import Dexie from 'dexie'
import type { NewChatMessage } from './ChatRepository'
import { DiaryDB } from './db'
import { DexieChatRepository } from './DexieChatRepository'
import { DexieDiaryRepository } from './DexieDiaryRepository'

let db: DiaryDB
let chats: DexieChatRepository
const msg = (date: string, content: string, createdAt: number, role: 'user' | 'assistant' = 'user'): NewChatMessage => ({
  date,
  role,
  content,
  createdAt,
  status: 'complete',
})

beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  chats = new DexieChatRepository(db)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('add assigns an id and listByDate returns that day in createdAt order', async () => {
  await chats.add(msg('2026-09-28', 'kedua', 20, 'assistant'))
  const first = await chats.add(msg('2026-09-28', 'pertama', 10))
  await chats.add(msg('2026-09-27', 'kemarin', 5))
  expect(first.id).toMatch(/[0-9a-f-]{36}/)
  expect((await chats.listByDate('2026-09-28')).map((m) => m.content)).toEqual(['pertama', 'kedua'])
})

test('deleteByDate removes only that day', async () => {
  await chats.add(msg('2026-09-28', 'a', 1))
  await chats.add(msg('2026-09-27', 'b', 1))
  await chats.deleteByDate('2026-09-28')
  expect(await chats.listByDate('2026-09-28')).toEqual([])
  expect(await chats.listByDate('2026-09-27')).toHaveLength(1)
})

test('datesWithChats is unique and sorted', async () => {
  await chats.add(msg('2026-09-28', 'a', 1))
  await chats.add(msg('2026-09-26', 'b', 1))
  await chats.add(msg('2026-09-28', 'c', 2))
  expect(await chats.datesWithChats()).toEqual(['2026-09-26', '2026-09-28'])
})

test('listAll returns every message ordered by date then createdAt', async () => {
  await chats.add(msg('2026-09-28', 'b', 2))
  await chats.add(msg('2026-09-26', 'lama', 9))
  await chats.add(msg('2026-09-28', 'a', 1))
  expect((await chats.listAll()).map((m) => m.content)).toEqual(['lama', 'a', 'b'])
})

test('importMany adds only ids that do not exist yet and returns the number added', async () => {
  const existing = await chats.add(msg('2026-09-28', 'sudah ada', 1))
  const incoming = [
    { ...existing, content: 'versi impor' },
    { ...msg('2026-09-28', 'baru', 2), id: 'id-baru' },
    { ...msg('2026-09-27', 'kemarin', 1), id: 'id-kemarin' },
  ]
  expect(await chats.importMany(incoming)).toBe(2)
  expect((await chats.listAll()).map((m) => m.content)).toEqual(['kemarin', 'sudah ada', 'baru'])
  expect(await chats.importMany(incoming)).toBe(0)
  expect(await chats.listAll()).toHaveLength(3)
})

test('watchByDate emits current list and updates', async () => {
  const seen: number[] = []
  const unsub = chats.watchByDate('2026-09-28', (m) => seen.push(m.length))
  await vi.waitFor(() => expect(seen).toEqual([0]))
  await chats.add(msg('2026-09-28', 'a', 1))
  await vi.waitFor(() => expect(seen).toEqual([0, 1]))
  unsub()
})

test('upgrading a v1 database keeps diary entries and adds the chat table', async () => {
  const name = `test-${crypto.randomUUID()}`
  const v1 = new Dexie(name)
  v1.version(1).stores({ entries: 'date, *tags, updatedAt', settings: 'key' })
  await v1.table('entries').put({ date: '2026-09-01', markdown: 'lama', mood: 3, tags: [], wordCount: 1, createdAt: 1, updatedAt: 1 })
  await v1.table('settings').put({ key: 'theme', value: 'dark' })
  v1.close()

  const upgraded = new DiaryDB(name)
  expect((await new DexieDiaryRepository(upgraded).get('2026-09-01'))?.markdown).toBe('lama')
  expect(await upgraded.settings.get('theme')).toEqual({ key: 'theme', value: 'dark' })
  const repo = new DexieChatRepository(upgraded)
  await repo.add(msg('2026-09-01', 'halo', 1))
  expect(await repo.listByDate('2026-09-01')).toHaveLength(1)
  upgraded.close()
  await upgraded.delete()
})
