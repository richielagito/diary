import type { DateKey, DayEntry, EntryInput, Mood } from '../domain/types'

export type Unsubscribe = () => void

export interface ImportResult {
  added: number
  overwritten: number
  skipped: number
}

export interface DiaryRepository {
  get(date: DateKey): Promise<DayEntry | undefined>
  /** Mengembalikan null kalau entri kosong (markdown kosong dan mood null) sehingga dihapus. */
  save(date: DateKey, patch: { markdown?: string; mood?: Mood | null }): Promise<DayEntry | null>
  /** Menambah teks di akhir entri dalam satu transaksi. Mood hanya diisi kalau belum ada. Menolak teks kosong. */
  appendToEntry(date: DateKey, text: string, moodIfEmpty: Mood | null): Promise<DayEntry>
  /** Urut naik berdasarkan tanggal. Range inklusif. */
  list(range?: { from: DateKey; to: DateKey }): Promise<DayEntry[]>
  delete(date: DateKey): Promise<void>
  /** Satu transaksi: berhasil semua atau tidak ada yang berubah. */
  importMany(entries: EntryInput[], onConflict: 'skip' | 'overwrite'): Promise<ImportResult>
  watch(date: DateKey, cb: (entry: DayEntry | undefined) => void): Unsubscribe
  /** createdAt terkecil dari semua entri, atau null kalau diary kosong. Reaktif. */
  watchFirstCreatedAt(cb: (ms: number | null) => void): Unsubscribe
}
