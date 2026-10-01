/** Frasa dicocokkan sebagai kata utuh setelah normalisasi (huruf kecil, tanda baca jadi spasi). */
const PHRASES = [
  'bunuh diri',
  'ingin mati',
  'pengen mati',
  'pingin mati',
  'mau mati aja',
  'mau mati saja',
  'mengakhiri hidup',
  'akhiri hidup',
  'menyakiti diri',
  'melukai diri',
  'nyakitin diri',
  'gak mau hidup',
  'ga mau hidup',
  'nggak mau hidup',
  'tidak mau hidup',
  'tidak ingin hidup',
  'self harm',
  'selfharm',
  'suicide',
  'suicidal',
  'kill myself',
  'end my life',
  'want to die',
  'wanna die',
  'hurt myself',
  'capek hidup',
  'lelah hidup',
  'pengen hilang aja',
  'ingin menghilang',
  'mengakhiri semuanya',
  'akhiri semuanya',
  'lebih baik mati',
  'gak ada gunanya hidup',
  'tidak ada gunanya hidup',
  'tidak ada alasan untuk hidup',
  'don t want to live',
  'dont want to live',
  'no reason to live',
  'better off dead',
  'cutting myself',
  'cut myself',
  'pengin mati',
  'gantung diri',
  'gamau hidup',
  'gak pengen hidup',
  'end it all',
  'wish i was dead',
  'wish i were dead',
]

function normalize(text: string): string {
  return ` ${text.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
}

export function detectCrisis(text: string): boolean {
  const normalized = normalize(text)
  return PHRASES.some((phrase) => normalized.includes(` ${phrase} `))
}
