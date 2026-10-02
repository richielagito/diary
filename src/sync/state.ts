import type { DiaryDB } from '../storage/db'

export async function getState<T>(db: DiaryDB, key: string): Promise<T | undefined> {
  return (await db.syncState.get(key))?.value as T | undefined
}

export async function setState(db: DiaryDB, key: string, value: unknown): Promise<void> {
  await db.syncState.put({ key, value })
}

/** Menghapus sesi, kunci, kursor dan indeks. Diary di perangkat tidak disentuh. */
export async function clearSyncData(db: DiaryDB): Promise<void> {
  await db.transaction('rw', db.syncState, db.syncIndex, async () => {
    await db.syncState.clear()
    await db.syncIndex.clear()
  })
}
