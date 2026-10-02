import type { WrappedKey } from '../sync/crypto'

/** Jumlah digit kode masuk yang dikirim server lewat email. */
export const EMAIL_CODE_LENGTH = 6

const REQUEST_TIMEOUT_MS = 120_000

/** Server menjawab dengan error. `code` adalah isi `{ "error": ... }`, atau 'unknown'. */
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

export function createApi(baseUrl: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Api {
  const base = baseUrl.replace(/\/+$/, '')

  async function call<T>(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
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
    if (res.status === 204) return undefined as T
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      // Bukan JSON (misalnya halaman error dari proxy): ditangani di bawah.
    }
    if (!res.ok) {
      const code = (data as { error?: unknown } | null)?.error
      throw new ApiError(res.status, typeof code === 'string' ? code : 'unknown')
    }
    return data as T
  }

  return {
    emailStart: (email, lang) => call('POST', '/auth/email/start', { body: { email, lang } }),
    emailVerify: async (email, code) => (await call<{ token: string }>('POST', '/auth/email/verify', { body: { email, code } })).token,
    googleStartUrl: (origin, challenge) => `${base}/auth/google/start?${new URLSearchParams({ return: origin, challenge })}`,
    exchange: async (code, verifier) => (await call<{ token: string }>('POST', '/auth/exchange', { body: { code, verifier } })).token,
    logout: (token) => call('POST', '/auth/logout', { token }),
    account: (token) => call('GET', '/account', { token }),
    putKey: (token, key, reset) => call('PUT', '/account/key', { token, body: reset ? { ...key, reset: true } : key }),
    deleteAccount: (token) => call('DELETE', '/account', { token }),
    pull: (token, since) => call('GET', `/sync?since=${since}`, { token }),
    push: (token, keyId, records) => call('POST', '/sync', { token, body: { keyId, records } }),
  }
}
