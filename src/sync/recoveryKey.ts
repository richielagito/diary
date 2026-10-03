/** Crockford base32: tanpa I, L, O dan U, supaya tidak tertukar saat dibaca atau diketik. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** 15 byte = 120 bit acak = tepat 24 karakter. */
const KEY_BYTES = 15

/** Kunci pemulihan sync baru, misalnya `7KQF-2M9X-H4TR-WC8P-N3VD-6YJB`. Menggantikan frasa sandi buatan user. */
export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES))
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return formatRecoveryKey(out)
}

/** Bentuk yang dipakai untuk enkripsi: huruf besar tanpa spasi atau tanda hubung; O dibaca 0, I dan L dibaca 1. */
export function normalizeRecoveryKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export function formatRecoveryKey(normalized: string): string {
  return normalized.match(/.{1,4}/g)?.join('-') ?? ''
}
