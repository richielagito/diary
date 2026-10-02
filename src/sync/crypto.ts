const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const KDF_ITERATIONS = 600_000
export const MIN_PASSPHRASE_LENGTH = 10
const MIN_ITERATIONS = 100_000
const MAX_ITERATIONS = 10_000_000

/** Yang disimpan server: tidak cukup untuk membuka apa pun tanpa frasa sandi. */
export interface WrappedKey {
  keyId: string
  salt: string
  wrapped: string
  iterations: number
}

export interface SyncKeys {
  enc: CryptoKey
  id: CryptoKey
}

export interface Envelope {
  v: number
  c: string
  k: string
  t: number
  d: unknown
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('wrong passphrase')
  }
}

export class OutdatedError extends Error {
  constructor() {
    super('record written by a newer app version')
  }
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const binary = atob(s)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export const toBase64Url = (bytes: Uint8Array): string => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> =>
  fromBase64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))

export const randomToken = (bytes = 16): string => toBase64Url(randomBytes(bytes))

export async function sha256Base64Url(text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))))
}

/** Ukuran setelah didekode dari base64 berpadding, sama dengan hitungan server. */
export function blobBytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return (b64.length / 4) * 3 - padding
}

async function wrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error('unsupported key parameters')
  }
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function keysFromMaster(master: Uint8Array<ArrayBuffer>): Promise<SyncKeys> {
  const hkdf = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey'])
  const params = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) })
  return {
    enc: await crypto.subtle.deriveKey(params('diary-sync enc v1'), hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    id: await crypto.subtle.deriveKey(params('diary-sync id v1'), hkdf, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
  }
}

/** Membuat rahasia induk acak dan membungkusnya dengan frasa sandi. Rahasia induk tidak pernah meninggalkan fungsi ini. */
export async function createKey(passphrase: string, iterations = KDF_ITERATIONS): Promise<{ wrappedKey: WrappedKey; keys: SyncKeys }> {
  const master = randomBytes(32)
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const wrapper = await wrappingKey(passphrase, salt, iterations)
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapper, master))
  return {
    wrappedKey: { keyId: randomToken(16), salt: toBase64Url(salt), wrapped: toBase64Url(concat(iv, sealed)), iterations },
    keys: await keysFromMaster(master),
  }
}

export async function openKey(passphrase: string, wrappedKey: WrappedKey): Promise<SyncKeys> {
  const wrapper = await wrappingKey(passphrase, fromBase64Url(wrappedKey.salt), wrappedKey.iterations)
  const raw = fromBase64Url(wrappedKey.wrapped)
  let master: Uint8Array<ArrayBuffer>
  try {
    master = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, wrapper, raw.slice(12)))
  } catch {
    throw new WrongPassphraseError()
  }
  return keysFromMaster(master)
}

/** Id record di server: tidak memperlihatkan koleksi maupun kuncinya (misalnya tanggal). */
export async function recordId(keys: SyncKeys, c: string, k: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', keys.id, encoder.encode(`${c}\n${k}`)))
  return toBase64Url(mac.slice(0, 16))
}

/** IV acak + ciphertext, base64. Id ikut diautentikasi, jadi blob tidak bisa dipindah ke id lain. */
export async function seal(keys: SyncKeys, id: string, envelope: Envelope): Promise<string> {
  const iv = randomBytes(12)
  const data = encoder.encode(JSON.stringify(envelope))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(id) }, keys.enc, data))
  return toBase64(concat(iv, sealed))
}

export async function open(keys: SyncKeys, id: string, blob: string): Promise<Envelope> {
  const raw = fromBase64(blob)
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: encoder.encode(id) }, keys.enc, raw.slice(12))
  const envelope = JSON.parse(decoder.decode(data)) as Envelope
  if (typeof envelope.v !== 'number' || envelope.v > 1) throw new OutdatedError()
  return envelope
}
