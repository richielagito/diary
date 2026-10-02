/** Garis pemisah Markdown di antara dua versi teks yang sama-sama berubah. */
export const MERGE_SEPARATOR = '\n\n---\n\n'

/**
 * Menggabung dua versi teks satu hari terhadap versi yang terakhir sama-sama dikenal.
 * Tidak pernah membuang tulisan: kalau keduanya berubah dan tidak saling memuat, keduanya ditumpuk, `newer` di atas.
 */
export function mergeText(newer: string, older: string, base: string): string {
  if (newer === older) return newer
  if (newer === base) return older
  if (older === base) return newer
  if (newer.trim() === '') return older
  if (older.trim() === '') return newer
  // Satu versi sudah memuat versi lainnya (misalnya perangkat ini hanya tertinggal): pakai yang lebih lengkap.
  if (newer.includes(older.trim())) return newer
  if (older.includes(newer.trim())) return older
  return `${newer.replace(/[\r\n]+$/, '')}${MERGE_SEPARATOR}${older.replace(/^[\r\n]+/, '')}`
}
