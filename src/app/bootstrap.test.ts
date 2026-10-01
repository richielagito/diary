import { DiaryDB } from '../storage/db'
import { DexieSettingsStore } from '../storage/DexieSettingsStore'
import { defaultSettings } from '../storage/SettingsStore'
import { openDatabase, requestPersist } from './bootstrap'

let db: DiaryDB
beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('openDatabase true when IndexedDB works', async () => {
  expect(await openDatabase(db)).toBe(true)
})

test('openDatabase false when open fails', async () => {
  vi.spyOn(db, 'open').mockRejectedValue(new Error('blocked'))
  expect(await openDatabase(db)).toBe(false)
})

test('requestPersist stores result once', async () => {
  const store = new DexieSettingsStore(db, defaultSettings('id'))
  const storage = { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) }
  await requestPersist(store, storage)
  expect((await store.getAll()).persistGranted).toBe(false)
  await requestPersist(store, storage)
  expect(storage.persist).toHaveBeenCalledTimes(1)
})

test('requestPersist skips prompt when already persisted', async () => {
  const store = new DexieSettingsStore(db, defaultSettings('id'))
  const storage = { persisted: vi.fn().mockResolvedValue(true), persist: vi.fn() }
  await requestPersist(store, storage)
  expect(storage.persist).not.toHaveBeenCalled()
  expect((await store.getAll()).persistGranted).toBe(true)
})
