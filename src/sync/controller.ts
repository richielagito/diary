import Dexie from 'dexie'
import { ApiError, NetworkError, type Api } from '../account/api'
import type { DiaryDB } from '../storage/db'
import { KDF_ITERATIONS, MIN_PASSPHRASE_LENGTH, OutdatedError, createKey, openKey, randomToken, sha256Base64Url, type SyncKeys } from './crypto'
import { KeyChangedError, syncOnce } from './engine'
import { clearSyncData, getState, setState } from './state'

export type SyncProblem = 'needs-login' | 'quota' | 'plan' | 'outdated' | 'retrying'

export interface SyncStatus {
  phase: 'signed-out' | 'needs-passphrase' | 'ready'
  email: string | null
  /** Di phase needs-passphrase: true = masukkan frasa sandi yang sudah ada, false = buat baru. */
  accountHasKey: boolean
  syncing: boolean
  problem: SyncProblem | null
  lastSyncAt: number | null
  usage: { bytes: number; limit: number } | null
}

export class PassphraseTooShortError extends Error {
  constructor() {
    super('passphrase too short')
  }
}

/** Perangkat lain sudah lebih dulu membuat frasa sandi untuk akun ini. */
export class KeyExistsError extends Error {
  constructor() {
    super('account already has a key')
  }
}

export interface SyncController {
  status(): SyncStatus
  subscribe(listener: () => void): () => void
  start(): Promise<void>
  stop(): void
  requestEmailCode(email: string, lang: string): Promise<void>
  verifyEmailCode(email: string, code: string): Promise<void>
  googleLoginUrl(): Promise<string>
  completeGoogleLogin(code: string): Promise<void>
  createPassphrase(passphrase: string): Promise<void>
  enterPassphrase(passphrase: string): Promise<void>
  resetSync(passphrase: string): Promise<void>
  refreshAccount(): Promise<void>
  syncNow(): Promise<void>
  logout(): Promise<void>
  deleteAccount(): Promise<void>
}

export interface SyncControllerOptions {
  db: DiaryDB
  api: Api
  now?: () => number
  /** Jeda setelah perubahan lokal terakhir sebelum sync. */
  debounceMs?: number
  retryDelaysMs?: readonly number[]
  iterations?: number
  origin?: string
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

const VERIFIER_KEY = 'diary.googleVerifier'
const OWN_TABLES = new Set(['syncIndex', 'syncState'])
const SIGNED_OUT: SyncStatus = { phase: 'signed-out', email: null, accountHasKey: false, syncing: false, problem: null, lastSyncAt: null, usage: null }

export function createSyncController(options: SyncControllerOptions): SyncController {
  const { db, api } = options
  const now = options.now ?? Date.now
  const debounceMs = options.debounceMs ?? 5000
  const retryDelays = options.retryDelaysMs ?? [30_000, 120_000, 600_000, 1_800_000]
  const iterations = options.iterations ?? KDF_ITERATIONS
  const origin = options.origin ?? globalThis.location?.origin ?? ''
  const storage = options.storage ?? globalThis.localStorage

  let current: SyncStatus = SIGNED_OUT
  let token: string | null = null
  let keys: SyncKeys | null = null
  let keyId: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let failures = 0
  /** Putaran yang sedang berjalan. Pemanggil kedua menunggu promise yang sama. */
  let inFlight: Promise<void> | null = null
  let again = false
  let started = false
  const listeners = new Set<() => void>()

  const set = (patch: Partial<SyncStatus>) => {
    current = { ...current, ...patch }
    for (const listener of listeners) listener()
  }

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void syncNow()
    }, ms)
  }

  const cancelTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const needToken = (): string => {
    if (!token) throw new Error('not signed in')
    return token
  }

  async function load(): Promise<void> {
    token = (await getState<string>(db, 'token')) ?? null
    keys = (await getState<SyncKeys>(db, 'keys')) ?? null
    keyId = (await getState<string>(db, 'keyId')) ?? null
    const email = (await getState<string>(db, 'email')) ?? null
    set({
      email,
      accountHasKey: (await getState<boolean>(db, 'accountHasKey')) ?? false,
      lastSyncAt: (await getState<number>(db, 'lastSyncAt')) ?? null,
      phase: !email ? 'signed-out' : keys ? 'ready' : 'needs-passphrase',
      // Email tersimpan tapi token tidak: sesi berakhir sebelum aplikasi ditutup.
      problem: email && !token ? 'needs-login' : null,
    })
  }

  /** Kunci tidak berlaku lagi: buang kunci, indeks dan kursor. Sesi dan diary tetap. */
  async function forgetKeys(): Promise<void> {
    keys = null
    keyId = null
    await db.transaction('rw', db.syncState, db.syncIndex, async () => {
      await db.syncState.bulkDelete(['keys', 'keyId', 'cursor'])
      await db.syncIndex.clear()
    })
  }

  /** Kunci baru untuk perangkat ini: indeks dan kursor dimulai dari nol, lalu sync seperti pertama kali. */
  async function adoptKeys(next: SyncKeys, id: string): Promise<void> {
    await db.transaction('rw', db.syncState, db.syncIndex, async () => {
      await db.syncIndex.clear()
      await db.syncState.bulkDelete(['cursor'])
      await setState(db, 'keys', next)
      await setState(db, 'keyId', id)
      await setState(db, 'accountHasKey', true)
    })
    keys = next
    keyId = id
    failures = 0
    set({ phase: 'ready', accountHasKey: true, problem: null })
    void syncNow()
  }

  async function expireSession(): Promise<void> {
    token = null
    await db.syncState.delete('token')
    set({ problem: 'needs-login' })
  }

  /** 401 di mana pun berarti sesi habis; error tetap diteruskan ke pemanggil. */
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await expireSession()
      throw e
    }
  }

  async function afterLogin(newToken: string): Promise<void> {
    const info = await api.account(newToken)
    if (current.email && current.email !== info.email) {
      // Akun lain di perangkat yang sama: keadaan sync akun lama tidak berlaku. Diary lokal tetap.
      await clearSyncData(db)
      keys = null
      keyId = null
      set({ lastSyncAt: null })
    }
    token = newToken
    await setState(db, 'token', newToken)
    await setState(db, 'email', info.email)
    await setState(db, 'accountHasKey', info.key !== null)
    if (keys && info.key?.keyId !== keyId) await forgetKeys()
    failures = 0
    set({ email: info.email, accountHasKey: info.key !== null, usage: info.usage, phase: keys ? 'ready' : 'needs-passphrase', problem: null })
    if (keys) void syncNow()
  }

  async function makeKey(passphrase: string, reset: boolean): Promise<void> {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new PassphraseTooShortError()
    const t = needToken()
    const made = await createKey(passphrase, iterations)
    try {
      await guarded(() => api.putKey(t, made.wrappedKey, reset))
    } catch (e) {
      if (e instanceof ApiError && e.code === 'key_exists') {
        await setState(db, 'accountHasKey', true)
        set({ accountHasKey: true })
        throw new KeyExistsError()
      }
      throw e
    }
    await adoptKeys(made.keys, made.wrappedKey.keyId)
  }

  async function onSyncError(e: unknown): Promise<void> {
    if (e instanceof ApiError && e.status === 401) return expireSession()
    if (e instanceof KeyChangedError || (e instanceof ApiError && e.code === 'key_changed')) {
      await forgetKeys()
      await setState(db, 'accountHasKey', true)
      return set({ phase: 'needs-passphrase', accountHasKey: true, problem: null })
    }
    if (e instanceof ApiError && e.code === 'plan_required') return set({ problem: 'plan' })
    if (e instanceof ApiError && e.code === 'quota_exceeded') return set({ problem: 'quota' })
    if (e instanceof OutdatedError) return set({ problem: 'outdated' })
    // Jaringan, 5xx, 429 atau hal tak terduga: coba lagi nanti dengan jeda yang makin panjang.
    if (!(e instanceof ApiError) && !(e instanceof NetworkError)) console.error('sync failed:', e instanceof Error ? e.name : 'unknown error')
    set({ problem: 'retrying' })
    schedule(retryDelays[Math.min(failures, retryDelays.length - 1)]!)
    failures++
  }

  async function runOnce(): Promise<void> {
    if (!token || !keys || !keyId) return
    const session = token
    cancelTimer()
    try {
      const outcome = await syncOnce({ db, api, token, keys, keyId, now })
      // Keluar atau ganti akun selagi putaran berjalan: hasilnya bukan untuk sesi yang sekarang.
      if (token !== session) return
      failures = 0
      const at = now()
      await setState(db, 'lastSyncAt', at)
      set({ lastSyncAt: at, problem: outcome.skippedTooLarge > 0 ? 'quota' : null })
    } catch (e) {
      if (token === session) await onSyncError(e)
    }
  }

  /** Hanya satu tab yang sync pada satu waktu; tab lain melewatkan putaran ini. */
  function withLock(work: () => Promise<void>): Promise<void> {
    const locks = globalThis.navigator?.locks
    if (!locks) return work()
    return locks.request('diary-sync', { ifAvailable: true }, async (lock) => {
      if (lock) await work()
    })
  }

  /** Selesai setelah semua perubahan yang ada saat dipanggil sudah dicoba disinkronkan. */
  function syncNow(): Promise<void> {
    if (!token || !keys) return Promise.resolve()
    if (inFlight) {
      // Sedang berjalan: minta satu putaran lagi dan tunggu sampai itu juga selesai.
      again = true
      return inFlight
    }
    set({ syncing: true })
    inFlight = (async () => {
      try {
        do {
          again = false
          await withLock(runOnce)
        } while (again && token && keys)
      } finally {
        inFlight = null
        set({ syncing: false })
      }
    })()
    return inFlight
  }

  async function signOutLocally(): Promise<void> {
    cancelTimer()
    token = null
    keys = null
    keyId = null
    failures = 0
    // Tunggu putaran yang masih berjalan supaya tidak menulis lagi setelah keadaan dibersihkan.
    await inFlight?.catch(() => {})
    await clearSyncData(db)
    set(SIGNED_OUT)
  }

  const onMutated = (parts: Record<string, unknown>) => {
    const prefix = `idb://${db.name}/`
    const touched = Object.keys(parts).some((key) => key.startsWith(prefix) && !OWN_TABLES.has(key.slice(prefix.length).split('/')[0]!))
    if (touched && current.phase === 'ready' && token) schedule(debounceMs)
  }
  const onOnline = () => void syncNow()
  const onVisible = () => {
    if (globalThis.document?.visibilityState === 'visible') void syncNow()
  }

  return {
    status: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async start() {
      if (started) return
      started = true
      await load()
      Dexie.on('storagemutated', onMutated)
      globalThis.addEventListener?.('online', onOnline)
      globalThis.document?.addEventListener('visibilitychange', onVisible)
      void syncNow()
    },

    stop() {
      started = false
      cancelTimer()
      Dexie.on('storagemutated').unsubscribe(onMutated)
      globalThis.removeEventListener?.('online', onOnline)
      globalThis.document?.removeEventListener('visibilitychange', onVisible)
    },

    requestEmailCode: (email, lang) => api.emailStart(email.trim().toLowerCase(), lang),

    async verifyEmailCode(email, code) {
      await afterLogin(await api.emailVerify(email.trim().toLowerCase(), code.trim()))
    },

    async googleLoginUrl() {
      const verifier = randomToken(32)
      storage.setItem(VERIFIER_KEY, verifier)
      return api.googleStartUrl(origin, await sha256Base64Url(verifier))
    },

    async completeGoogleLogin(code) {
      const verifier = storage.getItem(VERIFIER_KEY)
      storage.removeItem(VERIFIER_KEY)
      if (!verifier) throw new Error('this browser did not start the login')
      await afterLogin(await api.exchange(code, verifier))
    },

    createPassphrase: (passphrase) => makeKey(passphrase, false),
    resetSync: (passphrase) => makeKey(passphrase, true),

    async enterPassphrase(passphrase) {
      const t = needToken()
      const info = await guarded(() => api.account(t))
      if (!info.key) {
        await setState(db, 'accountHasKey', false)
        set({ accountHasKey: false })
        throw new Error('account has no key yet')
      }
      await adoptKeys(await openKey(passphrase, info.key), info.key.keyId)
    },

    async refreshAccount() {
      if (!token) return
      try {
        const info = await api.account(token)
        await setState(db, 'accountHasKey', info.key !== null)
        set({ usage: info.usage, accountHasKey: info.key !== null })
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await expireSession()
      }
    },

    syncNow,

    async logout() {
      const t = token
      try {
        if (t) await api.logout(t)
      } catch {
        // Server tidak terjangkau atau sesi sudah habis: sesi itu akan kedaluwarsa sendiri.
      }
      await signOutLocally()
    },

    async deleteAccount() {
      const t = needToken()
      await guarded(() => api.deleteAccount(t))
      await signOutLocally()
    },
  }
}
