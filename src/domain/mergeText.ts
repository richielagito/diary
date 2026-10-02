import { unescapeMarkdown } from './markdownText'

/** Garis pemisah Markdown di antara dua versi teks yang sama-sama berubah. */
export const MERGE_SEPARATOR = '\n\n---\n\n'

/**
 * Bentuk untuk membandingkan: tanpa backslash escape Markdown dan tanpa spasi di ujung.
 * Teks yang sama bisa tersimpan sebagai `#self\_care` (dari editor) atau `#self_care` (dari cadangan yang di-import).
 */
const norm = (text: string): string => unescapeMarkdown(text).trim()

/** `a` sudah memuat `b`: `b` adalah awal `a` (perangkat lain hanya tertinggal), atau muncul di dalamnya sebagai baris-baris utuh. */
const contains = (a: string, b: string): boolean => a.startsWith(b) || `\n${a}\n`.includes(`\n${b}\n`)

/**
 * Menggabung dua versi teks satu hari terhadap versi yang terakhir sama-sama dikenal.
 * Tidak pernah membuang tulisan: kalau keduanya berubah dan tidak saling memuat, keduanya ditumpuk, `newer` di atas.
 * Perbandingan memakai bentuk `norm`; yang dikembalikan selalu teks aslinya.
 */
export function mergeText(newer: string, older: string, base: string): string {
  const n = norm(newer)
  const o = norm(older)
  const b = norm(base)
  if (n === o) return newer
  if (n === b) return older
  if (o === b) return newer
  if (n === '') return older
  if (o === '') return newer
  // Satu versi sudah memuat versi lainnya: pakai yang lebih lengkap.
  if (contains(n, o)) return newer
  if (contains(o, n)) return older
  return `${newer.replace(/[\r\n]+$/, '')}${MERGE_SEPARATOR}${older.replace(/^[\r\n]+/, '')}`
}
