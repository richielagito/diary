import { liveQuery } from 'dexie'
import type { DiaryDB, SettingRow } from './db'
import type { Unsubscribe } from './DiaryRepository'
import type { Settings, SettingsStore } from './SettingsStore'

export class DexieSettingsStore implements SettingsStore {
  constructor(
    private readonly db: DiaryDB,
    private readonly defaults: Settings,
  ) {}

  private merge(rows: SettingRow[]): Settings {
    const s: Record<string, unknown> = { ...this.defaults }
    for (const r of rows) if (r.key in s) s[r.key] = r.value
    return s as unknown as Settings
  }

  async getAll(): Promise<Settings> {
    return this.merge(await this.db.settings.toArray())
  }

  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    await this.db.settings.put({ key, value })
  }

  watchAll(cb: (s: Settings) => void): Unsubscribe {
    const sub = liveQuery(() => this.db.settings.toArray()).subscribe({ next: (rows) => cb(this.merge(rows)) })
    return () => sub.unsubscribe()
  }
}
