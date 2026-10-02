import type { DayEntry, Mood } from '../domain/types'
import { mergeText } from '../domain/mergeText'
import { withDerived } from '../storage/DexieDiaryRepository'

/** Teks dan mood yang terakhir sama-sama dikenal perangkat ini dan server. */
export interface EntryBase {
  markdown: string
  mood: Mood | null
}

export type EntryMerge = 'remote' | 'local' | { merged: DayEntry }

export { MERGE_SEPARATOR } from '../domain/mergeText'

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
  const markdown = mergeText(newer.markdown, older.markdown, agreed.markdown)
  if (markdown === remote.markdown && mood === remote.mood) return 'remote'
  if (markdown === local.markdown && mood === local.mood) return 'local'
  return {
    merged: withDerived({ date: local.date, markdown, mood, createdAt: Math.min(local.createdAt, remote.createdAt), updatedAt: now }),
  }
}
