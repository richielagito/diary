import type { DayEntry, Mood } from '../domain/types'
import { withDerived } from '../storage/DexieDiaryRepository'

/** Teks dan mood yang terakhir sama-sama dikenal perangkat ini dan server. */
export interface EntryBase {
  markdown: string
  mood: Mood | null
}

export type EntryMerge = 'remote' | 'local' | { merged: DayEntry }

/** Garis pemisah Markdown di antara dua versi teks yang sama-sama berubah. */
export const MERGE_SEPARATOR = '\n\n---\n\n'

/** Sama di kedua perangkat: waktu ubah dulu, lalu isi, supaya dua gabungan bersamaan menghasilkan teks yang persis sama. */
function isNewer(a: DayEntry, b: DayEntry): boolean {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt
  if (a.markdown !== b.markdown) return a.markdown > b.markdown
  return (a.mood ?? 0) > (b.mood ?? 0)
}

function pickMood(local: DayEntry, remote: DayEntry, base: EntryBase, newer: DayEntry): Mood | null {
  if (local.mood === base.mood) return remote.mood
  if (remote.mood === base.mood) return local.mood
  if (local.mood === null) return remote.mood
  if (remote.mood === null) return local.mood
  return newer.mood
}

function pickMarkdown(local: DayEntry, remote: DayEntry, base: EntryBase, newer: DayEntry, older: DayEntry): string {
  if (local.markdown === remote.markdown) return local.markdown
  if (local.markdown === base.markdown) return remote.markdown
  if (remote.markdown === base.markdown) return local.markdown
  if (local.markdown.trim() === '') return remote.markdown
  if (remote.markdown.trim() === '') return local.markdown
  // Hanya buang baris kosong di sekitar pemisah, jangan indentasi.
  return `${newer.markdown.replace(/[\r\n]+$/, '')}${MERGE_SEPARATOR}${older.markdown.replace(/^[\r\n]+/, '')}`
}

/**
 * Gabung tiga arah untuk satu hari. `null` berarti entri dihapus di sisi itu.
 * Edit menang atas hapus; mood dan teks digabung terpisah; teks yang sama-sama berubah ditumpuk, yang terbaru di atas.
 */
export function mergeEntry(local: DayEntry | null, remote: DayEntry | null, base: EntryBase | null, now: number): EntryMerge {
  if (!local || !remote) return local ? 'local' : 'remote'
  const agreed = base ?? { markdown: '', mood: null }
  const newer = isNewer(local, remote) ? local : remote
  const older = newer === local ? remote : local
  const mood = pickMood(local, remote, agreed, newer)
  const markdown = pickMarkdown(local, remote, agreed, newer, older)
  if (markdown === remote.markdown && mood === remote.mood) return 'remote'
  if (markdown === local.markdown && mood === local.mood) return 'local'
  return {
    merged: withDerived({ date: local.date, markdown, mood, createdAt: Math.min(local.createdAt, remote.createdAt), updatedAt: now }),
  }
}
