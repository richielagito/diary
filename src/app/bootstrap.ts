import type { DiaryDB } from '../storage/db'
import type { SettingsStore } from '../storage/SettingsStore'

export async function openDatabase(db: DiaryDB): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false
  try {
    await db.open()
    return true
  } catch {
    return false
  }
}

export async function requestPersist(
  settings: SettingsStore,
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<void> {
  if ((await settings.getAll()).persistGranted !== null) return
  if (!storage?.persist) return
  const granted = (await storage.persisted?.()) || (await storage.persist())
  await settings.set('persistGranted', granted)
}
