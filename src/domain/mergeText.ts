import { unescapeMarkdown } from './markdownText'

/** Garis pemisah Markdown di antara dua versi teks yang sama-sama berubah tanpa versi asal yang diketahui. */
export const MERGE_SEPARATOR = '\n\n---\n\n'

/**
 * Bentuk untuk membandingkan: tanpa backslash escape Markdown dan tanpa spasi di ujung.
 * Teks yang sama bisa tersimpan sebagai `#self\_care` (dari editor) atau `#self_care` (dari cadangan yang di-import).
 */
const norm = (text: string): string => unescapeMarkdown(text).trim()

/** Kunci satu baris untuk dibandingkan: tanpa escape Markdown dan spasi di ujung kanan. */
const lineKey = (line: string): string => unescapeMarkdown(line).trimEnd()

/** `a` sudah memuat `b`: `b` adalah awal `a` (perangkat lain hanya tertinggal), atau muncul di dalamnya sebagai baris-baris utuh. */
const contains = (a: string, b: string): boolean => a.startsWith(b) || `\n${a}\n`.includes(`\n${b}\n`)

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])
const startsWith = (a: readonly string[], b: readonly string[]): boolean => b.length <= a.length && b.every((v, i) => v === a[i])
const endsWith = (a: readonly string[], b: readonly string[]): boolean => b.length <= a.length && b.every((v, i) => v === a[a.length - b.length + i])

/** Pasangan indeks baris yang sama di `a` dan `b` (subbarisan bersama terpanjang), berurutan. */
function matches(a: readonly string[], b: readonly string[]): Map<number, number> {
  // ponytail: LCS O(n·m), cukup untuk satu hari diary (ratusan baris); ganti ke Myers kalau entri ribuan baris.
  const w = b.length + 1
  const len = new Uint32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      len[i * w + j] = a[i] === b[j] ? len[(i + 1) * w + j + 1]! + 1 : Math.max(len[(i + 1) * w + j]!, len[i * w + j + 1]!)
    }
  }
  const out = new Map<number, number>()
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) out.set(i++, j++)
    else if (len[(i + 1) * w + j]! >= len[i * w + j + 1]!) i++
    else j++
  }
  return out
}

const dropBlank = (lines: string[], from: 'start' | 'end'): string[] => {
  const out = [...lines]
  while (out.length && (from === 'end' ? out[out.length - 1] : out[0])!.trim() === '') {
    if (from === 'end') out.pop()
    else out.shift()
  }
  return out
}

/**
 * Satu bagian yang diubah berbeda di kedua sisi. Tidak ada yang dibuang:
 * satu sisi hanya menambah sebelum atau sesudah bagian asal = tambahan itu menempel pada versi sisi lain (yang mengubah atau menghapusnya);
 * yang satu memuat yang lain = yang lebih lengkap; selain itu keduanya, `newer` di atas, dipisah satu baris kosong.
 */
function resolve(newer: string[], older: string[], base: readonly string[]): string[] {
  const [n, o] = [newer, older].map((lines) => lines.map(lineKey)) as [string[], string[]]
  if (base.length > 0) {
    if (startsWith(o, base)) return [...newer, ...older.slice(base.length)]
    if (startsWith(n, base)) return [...older, ...newer.slice(base.length)]
    if (endsWith(o, base)) return [...older.slice(0, older.length - base.length), ...newer]
    if (endsWith(n, base)) return [...newer.slice(0, newer.length - base.length), ...older]
  }
  let p = 0
  while (p < n.length && p < o.length && n[p] === o[p]) p++
  let s = 0
  while (s < n.length - p && s < o.length - p && n[n.length - 1 - s] === o[o.length - 1 - s]) s++
  const top = dropBlank(newer.slice(p, newer.length - s), 'end')
  const bottom = dropBlank(older.slice(p, older.length - s), 'start')
  const [t, b] = [top, bottom].map((lines) => norm(lines.join('\n')))
  const middle = contains(t!, b!) ? top : contains(b!, t!) ? bottom : [...top, '', ...bottom]
  return [...newer.slice(0, p), ...middle, ...newer.slice(newer.length - s)]
}

/** Gabung tiga arah per baris: perubahan di tempat berbeda digabung, bagian yang bentrok diselesaikan oleh `resolve`. */
function mergeLines(newer: string, older: string, base: string): string {
  const [N, O, B] = [newer, older, base].map((text) => text.split('\n')) as [string[], string[], string[]]
  const [n, o, b] = [N, O, B].map((lines) => lines.map(lineKey)) as [string[], string[], string[]]
  const inN = matches(b, n)
  const inO = matches(b, o)
  const out: string[] = []
  let ni = 0
  let oi = 0
  let bi = 0
  const chunk = (nEnd: number, oEnd: number, bEnd: number) => {
    const [cn, co, cb] = [n.slice(ni, nEnd), o.slice(oi, oEnd), b.slice(bi, bEnd)]
    if (same(cn, cb)) out.push(...O.slice(oi, oEnd))
    else if (same(co, cb) || same(cn, co)) out.push(...N.slice(ni, nEnd))
    else out.push(...resolve(N.slice(ni, nEnd), O.slice(oi, oEnd), cb))
  }
  // Baris asal yang masih ada di kedua sisi menjadi titik temu; di antaranya tiap sisi bisa berubah sendiri-sendiri.
  for (let k = 0; k < B.length; k++) {
    const x = inN.get(k)
    const y = inO.get(k)
    if (x === undefined || y === undefined) continue
    chunk(x, y, k)
    out.push(N[x]!)
    ni = x + 1
    oi = y + 1
    bi = k + 1
  }
  chunk(N.length, O.length, B.length)
  return out.join('\n')
}

/**
 * Menggabung dua versi teks satu hari terhadap versi yang terakhir sama-sama dikenal.
 * Tidak pernah membuang tulisan. Dengan versi asal: gabung tiga arah per baris, tanpa penanda.
 * Tanpa versi asal: yang lebih lengkap kalau satu memuat yang lain, kalau tidak keduanya ditumpuk dengan garis, `newer` di atas.
 * Perbandingan memakai bentuk tanpa escape; yang dikembalikan selalu teks aslinya.
 */
export function mergeText(newer: string, older: string, base: string): string {
  // Persis sama dulu: sisi yang tidak menyentuh teks tidak boleh mengalahkan suntingan yang hanya mengubah escape atau spasi.
  if (newer === older || older === base) return newer
  if (newer === base) return older
  const n = norm(newer)
  const o = norm(older)
  const b = norm(base)
  if (n === o) return newer
  if (n === b) return older
  if (o === b) return newer
  if (n === '') return older
  if (o === '') return newer
  if (b !== '') return mergeLines(newer, older, base)
  // Satu versi sudah memuat versi lainnya: pakai yang lebih lengkap.
  if (contains(n, o)) return newer
  if (contains(o, n)) return older
  return `${newer.replace(/[\r\n]+$/, '')}${MERGE_SEPARATOR}${older.replace(/^[\r\n]+/, '')}`
}
