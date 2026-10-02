import { DiaryDB } from '../storage/db'
import { createKey, open, recordId, seal } from './crypto'
import { clearSyncData, getState, setState } from './state'

const newDb = () => new DiaryDB(`test-${crypto.randomUUID()}`)

it('stores and reads values, including non-extractable keys', async () => {
  const db = newDb()
  expect(await getState(db, 'cursor')).toBeUndefined()
  await setState(db, 'cursor', 7)
  expect(await getState<number>(db, 'cursor')).toBe(7)

  const { keys } = await createKey('frasa sandi panjang', 100_000)
  await setState(db, 'keys', keys)
  const stored = await getState<typeof keys>(db, 'keys')
  expect(stored!.enc.extractable).toBe(false)
  const id = await recordId(stored!, 'entries', 'x')
  const envelope = { v: 1, c: 'entries', k: 'x', t: 1, d: null }
  expect(await open(stored!, id, await seal(keys, id, envelope))).toEqual(envelope)
})

it('finds an index row by collection and key', async () => {
  const db = newDb()
  await db.syncIndex.put({ id: 'abc', c: 'entries', k: '2026-10-01', t: 1, rev: 3, deleted: false, base: { markdown: 'a', mood: null } })
  expect((await db.syncIndex.where('[c+k]').equals(['entries', '2026-10-01']).first())?.id).toBe('abc')
})

it('clears sync data without touching the diary', async () => {
  const db = newDb()
  await db.entries.put({ date: '2026-10-01', markdown: 'tetap', mood: null, tags: [], wordCount: 1, createdAt: 1, updatedAt: 1 })
  await setState(db, 'token', 't')
  await db.syncIndex.put({ id: 'abc', c: 'entries', k: '2026-10-01', t: 1, rev: 3, deleted: false })
  await clearSyncData(db)
  expect(await db.syncState.count()).toBe(0)
  expect(await db.syncIndex.count()).toBe(0)
  expect(await db.entries.count()).toBe(1)
})
