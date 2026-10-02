import Dexie from 'dexie'
import { ApiError, NetworkError, type Api } from '../account/api'
import type { DiaryDB } from '../storage/db'
import { KDF_ITERATIONS, MIN_PASSPHRASE_LENGTH, OutdatedError, createKey, openKey, randomToken, sha256Base64Url, type SyncKeys } from './crypto'
import { KeyChangedError, syncOnce } from './engine'
import { clearSyncData, setState } from './state'

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
  /** Default navigator.locks; null = tanpa kunci (satu tab saja). */
  locks?: Pick<LockManager, 'request'> | null
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
  /** Naik setiap kali token atau kunci berubah; hasil putaran dari epoch lama diabaikan. */
  let epoch = 0
  /** > 0 selama kunci diganti atau sesi dihapus: putaran dan load() tidak boleh menghidupkan keadaan lama. */
  let rekeying = 0
  const listeners = new Set<() => void>()

  const sameUsage = (a: SyncStatus['usage'], b: SyncStatus['usage']) => (a && b ? a.bytes === b.bytes && a.limit === b.limit : a === b)

  /** Objek status baru dan pemberitahuan hanya kalau ada isi yang benar-benar berubah. */
  const set = (patch: Partial<SyncStatus>) => {
    const next = { ...current, ...patch }
    const keysOfPatch = Object.keys(patch) as (keyof SyncStatus)[]
    if (!keysOfPatch.some((k) => (k === 'usage' ? !sameUsage(current.usage, next.usage) : !Object.is(current[k], next[k])))) return
    current = next
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
    const before = epoch
    // Satu pembacaan untuk semua baris supaya kunci dan keyId tidak bisa berasal dari dua keadaan berbeda.
    const rows = await db.syncState.bulkGet(['token', 'keys', 'keyId', 'email', 'accountHasKey', 'lastSyncAt'])
    // Keadaan berubah selagi membaca: hasil bacaan sudah basi.
    if (epoch !== before || rekeying > 0) return
    const [t, k, id, e, has, last] = rows.map((row) => row?.value)
    token = (t as string | undefined) ?? null
    keys = (k as SyncKeys | undefined) ?? null
    keyId = (id as string | undefined) ?? null
    const email = (e as string | undefined) ?? null
    const accountHasKey = (has as boolean | undefined) ?? false
    const lastSyncAt = (last as number | undefined) ?? null
    if (!email) return set({ ...SIGNED_OUT, syncing: current.syncing })
    set({
      email,
      accountHasKey,
      lastSyncAt,
      phase: keys ? 'ready' : 'needs-passphrase',
      // Email tersimpan tapi token tidak: sesi berakhir. Token ada lagi: needs-login tidak berlaku.
      problem: !token ? 'needs-login' : current.problem === 'needs-login' ? null : current.problem,
    })
  }

  /** Berhenti memakai kunci yang sekarang dan menunggu putaran yang masih berjalan. Dipanggil sebelum kunci diganti. */
  async function quiesce(): Promise<{ keys: SyncKeys | null; keyId: string | null }> {
    const previous = { keys, keyId }
    epoch++
    keys = null
    keyId = null
    await inFlight?.catch(() => {})
    return previous
  }

  /** Kunci tidak berlaku lagi: buang kunci, indeks dan kursor. Sesi dan diary tetap. */
  async function forgetKeys(): Promise<void> {
    epoch++
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
    epoch++
    keys = next
    keyId = id
    failures = 0
    set({ phase: 'ready', accountHasKey: true, problem: token ? null : 'needs-login' })
  }

  async function expireSession(): Promise<void> {
    epoch++
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
    epoch++
    if (current.email && current.email !== info.email) {
      // Akun lain di perangkat yang sama: keadaan sync akun lama tidak berlaku. Diary lokal tetap.
      await quiesce()
      await clearSyncData(db)
      set({ lastSyncAt: null })
    }
    token = newToken
    await db.syncState.bulkPut([
      { key: 'token', value: newToken },
      { key: 'email', value: info.email },
      { key: 'accountHasKey', value: info.key !== null },
    ])
    if (keys && info.key?.keyId !== keyId) await forgetKeys()
    failures = 0
    set({
      email: info.email,
      accountHasKey: info.key !== null,
      usage: info.usage,
      phase: keys ? 'ready' : 'needs-passphrase',
      problem: info.plan !== 'premium' ? 'plan' : null,
    })
    if (keys) void syncNow()
  }

  async function makeKey(passphrase: string, reset: boolean): Promise<void> {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new PassphraseTooShortError()
    const t = needToken()
    const made = await createKey(passphrase, iterations)
    rekeying++
    try {
      const previous = await quiesce()
      // Bagian yang mengubah keadaan bersama berjalan di bawah kunci tab, berurutan dengan putaran tab lain.
      await withLock(async () => {
        try {
          await guarded(() => api.putKey(t, made.wrappedKey, reset))
        } catch (e) {
          // Kunci lama masih kunci server.
          keys = previous.keys
          keyId = previous.keyId
          if (e instanceof ApiError && e.code === 'key_exists') {
            await setState(db, 'accountHasKey', true)
            set({ accountHasKey: true })
            throw new KeyExistsError()
          }
          if (e instanceof ApiError && e.code === 'plan_required') set({ problem: 'plan' })
          throw e
        }
        await adoptKeys(made.keys, made.wrappedKey.keyId)
      })
    } finally {
      rekeying--
      // Satu putaran selalu menyusul, berhasil atau tidak, supaya percobaan ulang yang tertunda tidak hilang.
      void syncNow()
    }
  }

  async function onSyncError(e: unknown, usedKeyId: string): Promise<void> {
    if (e instanceof ApiError && e.status === 401) return expireSession()
    if (e instanceof KeyChangedError || (e instanceof ApiError && e.code === 'key_changed')) {
      await load()
      if (keys && keyId !== usedKeyId) {
        // Tab lain sudah memakai kunci baru: simpan, jangan dihapus, dan sync lagi dengan kunci itu.
        again = true
        return
      }
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
    // Database adalah sumber kebenaran bersama antar tab.
    if (rekeying === 0) await load()
    if (rekeying > 0 || !token || !keys || !keyId) return
    const mine = epoch
    const usedKeyId = keyId
    cancelTimer()
    try {
      const outcome = await syncOnce({ db, api, token, keys, keyId, now })
      // Token atau kunci berubah selagi putaran berjalan: hasilnya bukan untuk keadaan yang sekarang.
      if (epoch !== mine) return
      failures = 0
      const at = now()
      await setState(db, 'lastSyncAt', at)
      set({ lastSyncAt: at, problem: outcome.skippedTooLarge > 0 ? 'quota' : null })
    } catch (e) {
      if (epoch === mine) await onSyncError(e, usedKeyId)
    }
  }

  /** Hanya satu tab yang sync pada satu waktu; tab lain mengantre dan jalan sesudahnya. */
  function withLock(work: () => Promise<void>): Promise<void> {
    const locks = options.locks === undefined ? globalThis.navigator?.locks : options.locks
    if (!locks) return work()
    return locks.request('diary-sync', work) as Promise<void>
  }

  /** Selesai setelah semua perubahan yang ada saat dipanggil sudah dicoba disinkronkan. */
  function syncNow(reloaded = false): Promise<void> {
    if (!token || !keys) {
      // Mungkin tab lain yang sudah masuk atau menyimpan kunci: baca database sekali sebelum menyerah.
      if (reloaded || rekeying > 0) return Promise.resolve()
      return load().catch(() => {}).then(() => syncNow(true))
    }
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
      } catch (e) {
        // Putaran tidak boleh menolak: pemanggil memakai void syncNow().
        console.error('sync failed:', e instanceof Error ? e.name : 'unknown error')
      } finally {
        inFlight = null
        set({ syncing: false })
      }
    })()
    return inFlight
  }

  async function signOutLocally(): Promise<void> {
    rekeying++
    try {
      cancelTimer()
      epoch++
      token = null
      keys = null
      keyId = null
      failures = 0
      // Tunggu putaran yang masih berjalan supaya tidak menulis lagi setelah keadaan dibersihkan.
      await inFlight?.catch(() => {})
      await withLock(() => clearSyncData(db))
      set(SIGNED_OUT)
    } finally {
      rekeying--
    }
  }

  const onMutated = (parts: Record<string, unknown>) => {
    const prefix = `idb://${db.name}/`
    const touched = Object.keys(parts).some((key) => key.startsWith(prefix) && !OWN_TABLES.has(key.slice(prefix.length).split('/')[0]!))
    // Selagi retrying, percobaan ulang yang sudah dijadwalkan yang mengunggah perubahan; debounce tidak boleh memotong jedanya.
    if (touched && current.phase === 'ready' && token && !(current.problem === 'retrying' && timer !== null)) schedule(debounceMs)
  }
  const onOnline = () => void syncNow()
  const onVisible = () => {
    if (globalThis.document?.visibilityState !== 'visible') return
    // Tampilkan apa yang dilakukan tab lain, walau tidak ada yang perlu di-sync.
    void (rekeying === 0 ? load() : Promise.resolve()).catch(() => {}).then(() => syncNow())
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
      try {
        await load()
      } catch (e) {
        started = false
        throw e
      }
      if (!started) return
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
      const opened = await openKey(passphrase, info.key)
      rekeying++
      try {
        const previous = await quiesce()
        await withLock(async () => {
          try {
            await adoptKeys(opened, info.key!.keyId)
          } catch (e) {
            keys = previous.keys
            keyId = previous.keyId
            throw e
          }
        })
      } finally {
        rekeying--
        void syncNow()
      }
    },

    async refreshAccount() {
      if (!token) return
      try {
        const info = await api.account(token)
        await setState(db, 'accountHasKey', info.key !== null)
        set({
          usage: info.usage,
          accountHasKey: info.key !== null,
          problem: info.plan !== 'premium' ? 'plan' : current.problem === 'plan' ? null : current.problem,
        })
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await expireSession()
      }
    },

    syncNow: () => syncNow(),

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
