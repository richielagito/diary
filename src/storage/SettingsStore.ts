import { DEFAULT_PERSONA, type PersonaSettings } from '../ai/prompt/persona'
import type { AiConfig } from '../ai/provider/types'
import type { Unsubscribe } from './DiaryRepository'

export type Language = 'id' | 'en'
export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  language: Language
  theme: Theme
  lastExportAt: number | null
  /** null = pengingat backup dimatikan */
  backupReminderDays: number | null
  /** null = belum pernah diminta */
  persistGranted: boolean | null
  /** null = AI belum diatur */
  ai: AiConfig | null
  persona: PersonaSettings
  /** Sertakan diary sebagai konteks chat: 7 hari terakhir, ringkasan mingguan/bulanan, dan entri lama yang relevan (sampai 365 hari) */
  aiIncludeDiary: boolean
  /** Izinkan AI mengingat fakta tentang user */
  aiMemoryEnabled: boolean
  /** Buat dan kirim ringkasan mingguan/bulanan */
  aiSummariesEnabled: boolean
  /** Saran tag dari AI saat mengetik #; kalau mati hanya tag lama yang disarankan */
  aiTagSuggest: boolean
  /** createdAt pesan chat terakhir yang sudah diproses ekstraksi memori */
  memoryCursor: number
}

export function defaultSettings(navigatorLanguage: string): Settings {
  return {
    language: navigatorLanguage.toLowerCase().startsWith('id') ? 'id' : 'en',
    theme: 'system',
    lastExportAt: null,
    backupReminderDays: 14,
    persistGranted: null,
    ai: null,
    persona: { ...DEFAULT_PERSONA },
    aiIncludeDiary: true,
    aiMemoryEnabled: true,
    aiSummariesEnabled: true,
    aiTagSuggest: true,
    memoryCursor: 0,
  }
}

export interface SettingsStore {
  getAll(): Promise<Settings>
  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  watchAll(cb: (s: Settings) => void): Unsubscribe
}
