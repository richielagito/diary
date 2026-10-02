import type { Table } from 'dexie'
import { isMood, type EntryInput } from '../domain/types'
import type { DiaryDB } from '../storage/db'
import { withDerived } from '../storage/DexieDiaryRepository'
import type { Settings } from '../storage/SettingsStore'

/** Pengaturan yang ikut sync. `lastExportAt` dan `persistGranted` tentang perangkat ini saja, jadi tidak. */
export const SYNCED_SETTINGS: readonly (keyof Settings)[] = [
  'language',
  'theme',
  'backupReminderDays',
  'ai',
  'persona',
  'aiIncludeDiary',
  'aiMemoryEnabled',
  'aiSummariesEnabled',
  'aiTagSuggest',
  'memoryCursor',
]

export interface LocalRecord {
  c: string
  k: string
  /** Waktu ubah milik record. null untuk pengaturan, yang tidak punya waktu sendiri. */
  t: number | null
  d: unknown
}

type Row = Record<string, unknown>

interface TableSpec {
  c: string
  table: (db: DiaryDB) => Table<Row, string>
  key: string
  time: string
}

const spec = (c: string, table: (db: DiaryDB) => unknown, key: string, time: string): TableSpec => ({
  c,
  table: table as (db: DiaryDB) => Table<Row, string>,
  key,
  time,
})

const TABLES: readonly TableSpec[] = [
  spec('entries', (db) => db.entries, 'date', 'updatedAt'),
  spec('chatMessages', (db) => db.chatMessages, 'id', 'createdAt'),
  spec('memories', (db) => db.memories, 'id', 'updatedAt'),
  spec('summaries', (db) => db.summaries, 'id', 'createdAt'),
  spec('letters', (db) => db.letters, 'periodId', 'createdAt'),
]

const isSyncedSetting = (key: string): boolean => (SYNCED_SETTINGS as readonly string[]).includes(key)
const toRecord = (s: TableSpec, row: Row): LocalRecord => ({ c: s.c, k: String(row[s.key]), t: Number(row[s.time]), d: row })
const setting = (key: string, value: unknown): LocalRecord => ({ c: 'settings', k: key, t: null, d: { value } })

/** Tabel yang ditulis saat menerapkan data dari server, untuk cakupan transaksi. */
export function syncedTables(db: DiaryDB): Table[] {
  return [...TABLES.map((s) => s.table(db) as unknown as Table), db.settings as unknown as Table]
}

export async function readLocal(db: DiaryDB): Promise<LocalRecord[]> {
  const out: LocalRecord[] = []
  for (const s of TABLES) for (const row of await s.table(db).toArray()) out.push(toRecord(s, row))
  for (const row of await db.settings.toArray()) if (isSyncedSetting(row.key)) out.push(setting(row.key, row.value))
  return out
}

export async function getLocal(db: DiaryDB, c: string, k: string): Promise<LocalRecord | null> {
  if (c === 'settings') {
    const row = isSyncedSetting(k) ? await db.settings.get(k) : undefined
    return row ? setting(k, row.value) : null
  }
  const s = TABLES.find((x) => x.c === c)
  const row = s ? await s.table(db).get(k) : undefined
  return s && row ? toRecord(s, row) : null
}

/**
 * True kalau versi aplikasi ini bisa menyimpan record itu. Yang tidak dikenal diabaikan, bukan dihapus.
 * Perubahan bentuk pada koleksi yang sudah ada, yang ditolak di sini oleh versi lama, harus menaikkan `v` envelope:
 * versi lama mengingat revisi record yang ditolaknya dan bisa menimpanya dengan versinya sendiri.
 */
export function accepts(c: string, k: string, d: unknown): boolean {
  // Pengaturan tidak pernah dihapus aplikasi, jadi penanda hapus untuknya hanya gangguan.
  if (c === 'settings') return isSyncedSetting(k) && d !== null && typeof d === 'object' && 'value' in (d as object)
  const s = TABLES.find((x) => x.c === c)
  if (!s) return false
  if (d === null) return true
  if (typeof d !== 'object') return false
  const row = d as Row
  if (row[s.key] !== k || typeof row[s.time] !== 'number') return false
  if (c !== 'entries') return true
  return typeof row.markdown === 'string' && typeof row.createdAt === 'number' && (row.mood === null || isMood(row.mood))
}

/** Menulis satu record dari server ke tabel lokal; `null` menghapusnya. Hanya untuk record yang lolos `accepts`. */
export async function writeLocal(db: DiaryDB, c: string, k: string, d: unknown): Promise<void> {
  if (c === 'settings') {
    if (d === null) await db.settings.delete(k)
    else await db.settings.put({ key: k, value: (d as { value: unknown }).value })
    return
  }
  const table = TABLES.find((x) => x.c === c)!.table(db)
  if (d === null) await table.delete(k)
  // tags dan wordCount selalu dihitung ulang di sini, tidak dipercaya dari perangkat lain.
  else await table.put(c === 'entries' ? (withDerived(d as EntryInput) as unknown as Row) : (d as Row))
}
