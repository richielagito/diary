import type { WrappedKey } from '../sync/crypto'

/** Jumlah digit kode masuk yang dikirim server lewat email. */
export const EMAIL_CODE_LENGTH = 6

const REQUEST_TIMEOUT_MS = 120_000

/**
 * Server menjawab dengan error. `code` adalah isi `{ "error": ... }`, atau 'unknown'.
 * Jawaban sukses yang bentuknya tidak sesuai protokol menjadi status 502 dengan code 'bad_response'.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`)
  }
}

/** Permintaan tidak sampai ke server (offline, DNS, CORS). */
export class NetworkError extends Error {
  constructor() {
    super('network')
  }
}

export interface AccountInfo {
  email: string
  plan: string
  key: WrappedKey | null
  usage: { bytes: number; limit: number }
}

export interface RemoteRecord {
  id: string
  blob: string
  rev: number
}

export interface PullResult {
  keyId: string | null
  records: RemoteRecord[]
  rev: number
  more: boolean
}

export interface PushRecord {
  id: string
  blob: string
  prevRev: number
}

export interface PushResult {
  applied: { id: string; rev: number }[]
  conflicts: string[]
}

export interface Api {
  emailStart(email: string, lang: string): Promise<void>
  emailVerify(email: string, code: string): Promise<string>
  googleStartUrl(origin: string, challenge: string): string
  exchange(code: string, verifier: string): Promise<string>
  logout(token: string): Promise<void>
  account(token: string): Promise<AccountInfo>
  putKey(token: string, key: WrappedKey, reset: boolean): Promise<void>
  deleteAccount(token: string): Promise<void>
  pull(token: string, since: number): Promise<PullResult>
  push(token: string, keyId: string, records: PushRecord[]): Promise<PushResult>
}

// Bentuk jawaban diperiksa sebelum dipakai: jawaban 200 yang salah bentuk (proxy, server rusak) tidak boleh dikira
// perubahan kunci atau data kosong. Yang salah bentuk menjadi ApiError(502, 'bad_response') dan dicoba lagi nanti.
type Shape<T> = (data: unknown) => data is T
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number'
const listOf = (v: unknown, item: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(item)

const hasToken: Shape<{ token: string }> = (d): d is { token: string } => isObject(d) && isString(d.token) && d.token !== ''
const isKey = (k: unknown): boolean => isObject(k) && isString(k.keyId) && isString(k.salt) && isString(k.wrapped) && isNumber(k.iterations)
const isAccount: Shape<AccountInfo> = (d): d is AccountInfo =>
  isObject(d) &&
  isString(d.email) &&
  isString(d.plan) &&
  (d.key === null || isKey(d.key)) &&
  isObject(d.usage) &&
  isNumber(d.usage.bytes) &&
  isNumber(d.usage.limit)
const isPull: Shape<PullResult> = (d): d is PullResult =>
  isObject(d) &&
  (d.keyId === null || isString(d.keyId)) &&
  listOf(d.records, (r) => isObject(r) && isString(r.id) && isString(r.blob) && isNumber(r.rev)) &&
  Number.isInteger(d.rev) &&
  (d.rev as number) >= 0 &&
  typeof d.more === 'boolean'
const isPush: Shape<PushResult> = (d): d is PushResult =>
  isObject(d) && listOf(d.applied, (a) => isObject(a) && isString(a.id) && isNumber(a.rev)) && listOf(d.conflicts, isString)

export function createApi(baseUrl: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Api {
  const base = baseUrl.replace(/\/+$/, '')

  /** Tanpa `shape` jawabannya tidak dipakai dan isinya tidak dilihat. */
  async function call<T = void>(method: string, path: string, options: { token?: string; body?: unknown } = {}, shape?: Shape<T>): Promise<T> {
    const headers: Record<string, string> = {}
    if (options.token) headers.Authorization = `Bearer ${options.token}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    let res: Response
    try {
      res = await fetchImpl(base + path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store',
        // Koneksi yang macet tidak boleh menahan sync atau keluar akun selamanya.
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
      })
    } catch {
      throw new NetworkError()
    }
    let data: unknown
    try {
      if (res.status !== 204) data = await res.json()
    } catch {
      // Bukan JSON (misalnya halaman error dari proxy): ditangani di bawah.
    }
    if (!res.ok) {
      const code = (data as { error?: unknown } | null | undefined)?.error
      throw new ApiError(res.status, typeof code === 'string' ? code : 'unknown')
    }
    if (!shape) return undefined as T
    if (!shape(data)) throw new ApiError(502, 'bad_response')
    return data
  }

  return {
    emailStart: (email, lang) => call('POST', '/auth/email/start', { body: { email, lang } }),
    emailVerify: async (email, code) => (await call('POST', '/auth/email/verify', { body: { email, code } }, hasToken)).token,
    googleStartUrl: (origin, challenge) => `${base}/auth/google/start?${new URLSearchParams({ return: origin, challenge })}`,
    exchange: async (code, verifier) => (await call('POST', '/auth/exchange', { body: { code, verifier } }, hasToken)).token,
    logout: (token) => call('POST', '/auth/logout', { token }),
    account: (token) => call('GET', '/account', { token }, isAccount),
    putKey: (token, key, reset) => call('PUT', '/account/key', { token, body: reset ? { ...key, reset: true } : key }),
    deleteAccount: (token) => call('DELETE', '/account', { token }),
    pull: (token, since) => call('GET', `/sync?since=${since}`, { token }, isPull),
    push: (token, keyId, records) => call('POST', '/sync', { token, body: { keyId, records } }, isPush),
  }
}
