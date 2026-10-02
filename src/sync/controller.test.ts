import { createApi } from '../account/api'
import { DiaryDB } from '../storage/db'
import { DexieDiaryRepository } from '../storage/DexieDiaryRepository'
import { KeyExistsError, PassphraseTooShortError, createSyncController, type SyncController } from './controller'
import { WrongPassphraseError, open, recordId, seal, sha256Base64Url, type SyncKeys } from './crypto'
import { getState } from './state'
import { FakeServer } from './testing/fakeServer'

const EMAIL = 'a@example.com'
const PASS = 'frasa sandi panjang'
const DAY = '2026-10-01'

const live: SyncController[] = []
afterEach(() => {
  for (const c of live.splice(0)) c.stop()
  vi.restoreAllMocks()
})

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

interface DeviceOptions {
  fetchImpl?: typeof fetch
  locks?: Pick<LockManager, 'request'> | null
  retryDelaysMs?: readonly number[]
  debounceMs?: number
  now?: () => number
}

function device(server: FakeServer, db = new DiaryDB(`test-${crypto.randomUUID()}`), extra: DeviceOptions = {}) {
  const storage = memoryStorage()
  const controller = createSyncController({
    db,
    api: createApi(server.origin, extra.fetchImpl ?? server.fetch),
    debounceMs: extra.debounceMs ?? 10,
    retryDelaysMs: extra.retryDelaysMs ?? [20],
    iterations: 100_000,
    origin: 'https://app.test',
    storage,
    ...(extra.locks !== undefined ? { locks: extra.locks } : {}),
    ...(extra.now ? { now: extra.now } : {}),
  })
  live.push(controller)
  return { db, controller, storage, diary: new DexieDiaryRepository(db) }
}

/** A lock manager for one "browser": requests run one after another, like navigator.locks without options. */
function fakeLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  const request = (_name: string, callback: () => Promise<unknown>) => {
    const run = tail.then(() => callback())
    tail = run.catch(() => {})
    return run
  }
  return { request } as unknown as Pick<LockManager, 'request'>
}

/** Wraps the fake server's fetch: once armed, the next GET /sync waits until release() before it is sent. Counts every call. */
function gated(server: FakeServer) {
  let armed = false
  let release = () => {}
  let calls = 0
  const fetchImpl: typeof fetch = async (input, init) => {
    calls++
    if (armed && (init?.method ?? 'GET') === 'GET' && String(input).includes('/sync?')) {
      armed = false
      await new Promise<void>((resolve) => (release = resolve))
    }
    return server.fetch(input, init)
  }
  return { fetchImpl, arm: () => (armed = true), release: () => release(), calls: () => calls }
}

async function signIn(c: SyncController, server: FakeServer, email = EMAIL) {
  await c.requestEmailCode(email, 'id')
  await c.verifyEmailCode(email, server.lastCode(email))
}

/** A started device that is signed in, has the passphrase and has finished its first sync. */
async function ready(server: FakeServer, create: boolean) {
  const d = device(server)
  await d.controller.start()
  await signIn(d.controller, server)
  if (create) await d.controller.createPassphrase(PASS)
  else await d.controller.enterPassphrase(PASS)
  await synced(d.controller)
  return d
}

const synced = (c: SyncController) =>
  vi.waitFor(() => {
    expect(c.status().syncing).toBe(false)
    expect(c.status().lastSyncAt).not.toBeNull()
  })
const quiet = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

describe('signing in', () => {
  it('starts signed out and notifies subscribers', async () => {
    const server = new FakeServer()
    const { controller } = device(server)
    await controller.start()
    expect(controller.status()).toMatchObject({ phase: 'signed-out', email: null, problem: null, syncing: false })
    const seen: string[] = []
    const unsubscribe = controller.subscribe(() => seen.push(controller.status().phase))
    await signIn(controller, server)
    expect(seen).toContain('needs-passphrase')
    expect(controller.status()).toMatchObject({ phase: 'needs-passphrase', email: EMAIL, accountHasKey: false })
    unsubscribe()
  })

  it('creates the passphrase on the first device and uploads the diary', async () => {
    const server = new FakeServer()
    const { controller, diary } = device(server)
    await controller.start()
    await diary.save(DAY, { markdown: 'sudah ada sebelum sync' })
    await signIn(controller, server)
    await expect(controller.createPassphrase('pendek')).rejects.toBeInstanceOf(PassphraseTooShortError)
    await controller.createPassphrase(PASS)
    expect(controller.status()).toMatchObject({ phase: 'ready', accountHasKey: true })
    await synced(controller)
    expect(server.user(EMAIL).key!.iterations).toBe(100_000)
    expect(server.user(EMAIL).records.size).toBe(1)
  })

  it('asks a second device for the passphrase and rejects a wrong one', async () => {
    const server = new FakeServer()
    const first = await ready(server, true)
    await first.diary.save(DAY, { markdown: 'dari perangkat pertama' })
    await first.controller.syncNow()

    const second = device(server)
    await second.controller.start()
    await signIn(second.controller, server)
    expect(second.controller.status()).toMatchObject({ phase: 'needs-passphrase', accountHasKey: true })
    await expect(second.controller.enterPassphrase('frasa sandi salah')).rejects.toBeInstanceOf(WrongPassphraseError)
    expect(second.controller.status().phase).toBe('needs-passphrase')
    await second.controller.enterPassphrase(PASS)
    await synced(second.controller)
    expect((await second.diary.get(DAY))!.markdown).toBe('dari perangkat pertama')
  })

  it('tells a device that lost the race to create the key', async () => {
    const server = new FakeServer()
    const first = device(server)
    const second = device(server)
    await first.controller.start()
    await second.controller.start()
    await signIn(first.controller, server)
    await signIn(second.controller, server)
    await first.controller.createPassphrase(PASS)
    await expect(second.controller.createPassphrase('frasa sandi lain')).rejects.toBeInstanceOf(KeyExistsError)
    expect(second.controller.status()).toMatchObject({ phase: 'needs-passphrase', accountHasKey: true })
  })

  it('signs in with Google through a verifier kept in storage', async () => {
    const server = new FakeServer()
    const { controller, storage } = device(server)
    await controller.start()
    const url = new URL(await controller.googleLoginUrl())
    expect(url.origin + url.pathname).toBe('https://sync.test/auth/google/start')
    expect(url.searchParams.get('return')).toBe('https://app.test')
    const verifier = storage.getItem('diary.googleVerifier')!
    expect(url.searchParams.get('challenge')).toBe(await sha256Base64Url(verifier))

    await controller.completeGoogleLogin(server.issueLoginCode(EMAIL, url.searchParams.get('challenge')!))
    expect(controller.status()).toMatchObject({ phase: 'needs-passphrase', email: EMAIL })
    expect(storage.getItem('diary.googleVerifier')).toBeNull()
    await expect(controller.completeGoogleLogin('anything')).rejects.toThrow()
  })

  it('is still ready after a reload, without asking for the passphrase', async () => {
    const server = new FakeServer()
    const first = await ready(server, true)
    first.controller.stop()

    const again = device(server, first.db)
    await again.controller.start()
    expect(again.controller.status()).toMatchObject({ phase: 'ready', email: EMAIL })
    await again.diary.save(DAY, { markdown: 'setelah dibuka lagi' })
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
  })
})

describe('syncing', () => {
  it('syncs shortly after a local change, and does not loop', async () => {
    const server = new FakeServer()
    const a = await ready(server, true)
    const b = await ready(server, false)
    await a.diary.save(DAY, { markdown: 'otomatis' })
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
    await b.controller.syncNow()
    expect((await b.diary.get(DAY))!.markdown).toBe('otomatis')

    await quiet(150)
    const settled = server.requests.length
    await quiet(150)
    expect(server.requests.length).toBe(settled)
  })

  it('does nothing while signed out or without the passphrase', async () => {
    const server = new FakeServer()
    const { controller, diary } = device(server)
    await controller.start()
    await diary.save(DAY, { markdown: 'lokal saja' })
    await controller.syncNow()
    await signIn(controller, server)
    const before = server.requests.length
    await controller.syncNow()
    await quiet()
    expect(server.requests.length).toBe(before)
  })

  it('retries by itself after the connection comes back', async () => {
    const server = new FakeServer()
    const { controller, diary } = await ready(server, true)
    server.offline = true
    await diary.save(DAY, { markdown: 'saat offline' })
    await vi.waitFor(() => expect(controller.status().problem).toBe('retrying'))
    expect((await diary.get(DAY))!.markdown).toBe('saat offline')
    server.offline = false
    await vi.waitFor(() => expect(controller.status().problem).toBeNull())
    expect(server.user(EMAIL).records.size).toBe(1)
  })

  it('reports quota, plan and an outdated app, and keeps the diary', async () => {
    const server = new FakeServer()
    const { controller, diary, db } = await ready(server, true)

    server.quota = 5
    await diary.save(DAY, { markdown: 'terlalu banyak untuk kuota' })
    await vi.waitFor(() => expect(controller.status().problem).toBe('quota'))
    server.quota = 20 * 1024 * 1024
    await controller.syncNow()
    expect(controller.status().problem).toBeNull()

    server.user(EMAIL).plan = 'free'
    await controller.syncNow()
    expect(controller.status().problem).toBe('plan')
    server.user(EMAIL).plan = 'premium'

    // A record written by a newer app version, placed on the server directly.
    const mine = (await getState<SyncKeys>(db, 'keys'))!
    const id = await recordId(mine, 'entries', '2030-01-01')
    server.user(EMAIL).records.set(id, { blob: await seal(mine, id, { v: 2, c: 'entries', k: '2030-01-01', t: 1, d: {} }), rev: server.user(EMAIL).nextRev++ })
    await controller.syncNow()
    expect(controller.status().problem).toBe('outdated')
    expect((await diary.get(DAY))!.markdown).toBe('terlalu banyak untuk kuota')
  })

  it('flags a record that is too large to upload', async () => {
    const server = new FakeServer()
    const { controller, diary } = await ready(server, true)
    await diary.save(DAY, { markdown: 'x'.repeat(1_100_000) })
    await vi.waitFor(() => expect(controller.status().problem).toBe('quota'))
    expect(server.user(EMAIL).records.size).toBe(0)
  })
})

describe('session and key changes', () => {
  it('asks to sign in again when the session ended, and resumes without the passphrase', async () => {
    const server = new FakeServer()
    const { controller, diary, db } = await ready(server, true)
    server.failNext(401, 'unauthorized')
    await controller.syncNow()
    expect(controller.status()).toMatchObject({ phase: 'ready', problem: 'needs-login', email: EMAIL })
    expect(await getState(db, 'token')).toBeUndefined()

    await diary.save(DAY, { markdown: 'ditulis saat sesi habis' })
    await signIn(controller, server)
    expect(controller.status()).toMatchObject({ phase: 'ready', problem: null })
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
  })

  it('forgets the old account when another email signs in', async () => {
    const server = new FakeServer()
    const { controller, diary, db } = await ready(server, true)
    await diary.save(DAY, { markdown: 'punya akun pertama' })
    await controller.syncNow()
    server.failNext(401, 'unauthorized')
    await controller.syncNow()

    await signIn(controller, server, 'b@example.com')
    expect(controller.status()).toMatchObject({ phase: 'needs-passphrase', email: 'b@example.com', accountHasKey: false, lastSyncAt: null })
    expect(await db.syncIndex.count()).toBe(0)
    expect((await diary.get(DAY))!.markdown).toBe('punya akun pertama')
  })

  it('asks for the passphrase again after another device resets sync', async () => {
    const server = new FakeServer()
    const a = await ready(server, true)
    const b = await ready(server, false)
    await b.diary.save(DAY, { markdown: 'di perangkat b' })
    await b.controller.syncNow()

    await a.controller.resetSync('frasa sandi baru')
    await synced(a.controller)
    const newKeyId = server.user(EMAIL).key!.keyId

    await b.diary.save('2026-10-02', { markdown: 'ditulis dengan kunci lama' })
    await b.controller.syncNow()
    expect(b.controller.status()).toMatchObject({ phase: 'needs-passphrase', accountHasKey: true, problem: null })
    // Nothing encrypted with the old key reached the server.
    expect(server.user(EMAIL).records.size).toBe(0)
    expect(server.user(EMAIL).key!.keyId).toBe(newKeyId)

    await b.controller.enterPassphrase('frasa sandi baru')
    await synced(b.controller)
    await a.controller.syncNow()
    expect((await a.diary.get('2026-10-02'))!.markdown).toBe('ditulis dengan kunci lama')
    expect((await a.diary.get(DAY))!.markdown).toBe('di perangkat b')
  })

  it('signs out without touching the diary', async () => {
    const server = new FakeServer()
    const { controller, diary, db } = await ready(server, true)
    await diary.save(DAY, { markdown: 'tetap di sini' })
    await controller.syncNow()
    await controller.logout()
    expect(controller.status()).toMatchObject({ phase: 'signed-out', email: null, lastSyncAt: null })
    expect(server.sessionCount()).toBe(0)
    expect(await db.syncState.count()).toBe(0)
    expect(await db.syncIndex.count()).toBe(0)
    expect((await diary.get(DAY))!.markdown).toBe('tetap di sini')
    expect(server.user(EMAIL).records.size).toBe(1)
  })

  it('signs out locally even when the server cannot be reached', async () => {
    const server = new FakeServer()
    const { controller } = await ready(server, true)
    server.offline = true
    await controller.logout()
    expect(controller.status().phase).toBe('signed-out')
  })

  it('deletes the account on the server and keeps the diary', async () => {
    const server = new FakeServer()
    const { controller, diary } = await ready(server, true)
    await diary.save(DAY, { markdown: 'tetap di sini' })
    await controller.syncNow()
    await controller.deleteAccount()
    expect(server.hasUser(EMAIL)).toBe(false)
    expect(controller.status().phase).toBe('signed-out')
    expect((await diary.get(DAY))!.markdown).toBe('tetap di sini')
  })

  it('keeps the account when deleting it fails', async () => {
    const server = new FakeServer()
    const { controller } = await ready(server, true)
    server.offline = true
    await expect(controller.deleteAccount()).rejects.toThrow()
    expect(controller.status().phase).toBe('ready')
  })

  it('reads the usage from the account', async () => {
    const server = new FakeServer()
    const { controller, diary } = await ready(server, true)
    await diary.save(DAY, { markdown: 'beberapa byte' })
    await controller.syncNow()
    await controller.refreshAccount()
    expect(controller.status().usage!.bytes).toBeGreaterThan(0)
    expect(controller.status().usage!.limit).toBe(20 * 1024 * 1024)
  })
})

describe('fix round 1', () => {
  it('keeps the new key when sync is reset while a round is running', async () => {
    const server = new FakeServer()
    const gate = gated(server)
    const d = device(server, undefined, { fetchImpl: gate.fetchImpl })
    await d.controller.start()
    await signIn(d.controller, server)
    await d.controller.createPassphrase(PASS)
    await synced(d.controller)
    await d.diary.save(DAY, { markdown: 'satu entri' })
    await d.controller.syncNow()

    gate.arm()
    const before = gate.calls()
    const round = d.controller.syncNow()
    await vi.waitFor(() => expect(gate.calls()).toBeGreaterThan(before))
    await quiet(20)
    const reset = d.controller.resetSync('frasa sandi baru')
    // Cukup lama agar tanpa quiesce reset sudah selesai (PBKDF2 ~60 ms) sebelum putaran lama dilepas.
    await quiet(250)
    gate.release()
    await Promise.all([round, reset])
    await synced(d.controller)
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
    expect(d.controller.status()).toMatchObject({ phase: 'ready', problem: null })
    expect(await getState(d.db, 'keys')).toBeDefined()
    expect(server.user(EMAIL).key!.keyId).toBe(await getState(d.db, 'keyId'))
  })

  it('a second tab stops syncing after sign-out in the first', async () => {
    const server = new FakeServer()
    const locks = fakeLocks()
    const a = device(server, undefined, { locks })
    await a.controller.start()
    await signIn(a.controller, server)
    await a.controller.createPassphrase(PASS)
    await synced(a.controller)
    const b = device(server, a.db, { locks })
    await b.controller.start()
    await a.controller.logout()

    const mark = server.requests.length
    await b.diary.save(DAY, { markdown: 'dari tab b' })
    await b.controller.syncNow()
    await quiet()
    expect(b.controller.status().phase).toBe('signed-out')
    expect(server.requests.slice(mark).some((r) => r.method === 'POST' && r.path === '/sync')).toBe(false)
    expect(await a.db.syncState.count()).toBe(0)
  })

  it('a second tab picks up a new key instead of deleting it', async () => {
    const server = new FakeServer()
    const one = await ready(server, true)
    const locks = fakeLocks()
    const a = device(server, undefined, { locks })
    await a.controller.start()
    await signIn(a.controller, server)
    await a.controller.enterPassphrase(PASS)
    await synced(a.controller)
    const b = device(server, a.db, { locks })
    await b.controller.start()

    await one.controller.resetSync('frasa sandi baru')
    await synced(one.controller)
    await a.controller.syncNow()
    expect(a.controller.status().phase).toBe('needs-passphrase')
    await a.controller.enterPassphrase('frasa sandi baru')
    await synced(a.controller)
    await b.controller.syncNow()
    expect(a.controller.status()).toMatchObject({ phase: 'ready', problem: null })
    expect(b.controller.status()).toMatchObject({ phase: 'ready', problem: null })
    expect(await getState(a.db, 'keys')).toBeDefined()
    expect(await getState(a.db, 'keyId')).toBe(server.user(EMAIL).key!.keyId)
  })

  it('typing while the server is unreachable does not shorten the wait before the next retry', async () => {
    const server = new FakeServer()
    const gate = gated(server)
    const d = device(server, undefined, { fetchImpl: gate.fetchImpl, retryDelaysMs: [10_000], debounceMs: 10 })
    await d.controller.start()
    await signIn(d.controller, server)
    await d.controller.createPassphrase(PASS)
    await synced(d.controller)
    server.offline = true
    await d.diary.save(DAY, { markdown: 'offline' })
    await vi.waitFor(() => expect(d.controller.status().problem).toBe('retrying'))
    const calls = gate.calls()
    for (const day of ['2026-10-02', '2026-10-03', '2026-10-04']) {
      await quiet(50)
      await d.diary.save(day, { markdown: 'ketik' })
    }
    await quiet(150)
    expect(gate.calls()).toBe(calls)
  })

  it('reports an inactive plan before asking for a passphrase', async () => {
    const server = new FakeServer()
    const first = device(server)
    await first.controller.start()
    await signIn(first.controller, server)
    server.user(EMAIL).plan = 'free'
    const second = device(server)
    await second.controller.start()
    await signIn(second.controller, server)
    expect(second.controller.status()).toMatchObject({ phase: 'needs-passphrase', problem: 'plan' })
    await expect(second.controller.createPassphrase(PASS)).rejects.toThrow()
    expect(second.controller.status().problem).toBe('plan')
    server.user(EMAIL).plan = 'premium'
    await second.controller.refreshAccount()
    expect(second.controller.status().problem).toBeNull()
  })

  it('stop during start leaves no listener behind', async () => {
    const server = new FakeServer()
    const first = await ready(server, true)
    first.controller.stop()
    const again = device(server, first.db)
    const starting = again.controller.start()
    again.controller.stop()
    await starting
    const before = server.requests.length
    await again.diary.save(DAY, { markdown: 'tidak boleh sync' })
    await quiet(100)
    expect(server.requests.length).toBe(before)
  })

  it('survives a reload while signed out by a 401', async () => {
    const server = new FakeServer()
    const first = await ready(server, true)
    server.failNext(401, 'unauthorized')
    await first.controller.syncNow()
    expect(first.controller.status().problem).toBe('needs-login')
    first.controller.stop()
    const again = device(server, first.db)
    await again.controller.start()
    expect(again.controller.status()).toMatchObject({ phase: 'ready', problem: 'needs-login', email: EMAIL })
  })
})

/** Pauses the next read of the stored keys (after the rows are read, before the caller sees them). */
function tornRead(db: DiaryDB) {
  let armed = false
  let paused = false
  let release: () => void = () => {}
  const table = db.syncState
  const get = table.get.bind(table) as (...args: unknown[]) => Promise<unknown>
  const bulkGet = table.bulkGet.bind(table) as (...args: unknown[]) => Promise<unknown>
  const pause = async (result: unknown) => {
    if (armed) {
      armed = false
      paused = true
      await new Promise<void>((resolve) => (release = resolve))
    }
    return result
  }
  vi.spyOn(table, 'get').mockImplementation(((...args: unknown[]) => get(...args).then((r) => (args[0] === 'keys' ? pause(r) : r))) as never)
  vi.spyOn(table, 'bulkGet').mockImplementation(((...args: unknown[]) => bulkGet(...args).then(pause)) as never)
  return { arm: () => (armed = true), paused: () => paused, release: () => release() }
}

describe('fix round 2', () => {
  it('runs a round after a failed rekey so a pending retry is never lost', async () => {
    const server = new FakeServer()
    let holdPut: Promise<void> = Promise.resolve()
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === 'PUT') await holdPut
      return server.fetch(input, init)
    }
    const d = device(server, undefined, { fetchImpl, retryDelaysMs: [150] })
    await d.controller.start()
    await signIn(d.controller, server)
    await d.controller.createPassphrase(PASS)
    await synced(d.controller)
    server.offline = true
    await d.diary.save(DAY, { markdown: 'saat offline' })
    await vi.waitFor(() => expect(d.controller.status().problem).toBe('retrying'))

    let releasePut = () => {}
    holdPut = new Promise<void>((resolve) => (releasePut = resolve))
    const rejected = expect(d.controller.resetSync('frasa sandi baru')).rejects.toThrow()
    await quiet(400) // the retry timer fires while the key is being replaced
    releasePut()
    await rejected
    server.offline = false
    await d.diary.save('2026-10-02', { markdown: 'sesudah' })
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(2))
    await vi.waitFor(() => expect(d.controller.status().problem).toBeNull())
  })

  it('never seals with the old key when another tab changes the key during a round', async () => {
    const server = new FakeServer()
    const one = await ready(server, true)
    const locks = fakeLocks()
    const a = device(server, undefined, { locks })
    await a.controller.start()
    await signIn(a.controller, server)
    await a.controller.enterPassphrase(PASS)
    await synced(a.controller)
    const b = device(server, a.db, { locks })
    await b.controller.start()
    await a.diary.save(DAY, { markdown: 'sebelum reset' })
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
    await quiet(100)
    await one.controller.resetSync('frasa sandi baru')
    await synced(one.controller)

    const torn = tornRead(a.db)
    torn.arm()
    const round = b.controller.syncNow()
    await vi.waitFor(() => expect(torn.paused()).toBe(true))
    const entering = a.controller.enterPassphrase('frasa sandi baru')
    // Without a lock the key change finishes now; with one it waits for this round (the race only bounds the wait).
    await Promise.race([entering, quiet(500)])
    torn.release()
    await Promise.all([round, entering])
    await a.controller.syncNow()
    await b.controller.syncNow()

    const fresh = (await getState<SyncKeys>(a.db, 'keys'))!
    for (const [id, record] of server.user(EMAIL).records) await open(fresh, id, record.blob)
    expect(a.controller.status()).toMatchObject({ phase: 'ready', problem: null })
    expect(b.controller.status()).toMatchObject({ phase: 'ready', problem: null })
    expect(await getState(a.db, 'keyId')).toBe(server.user(EMAIL).key!.keyId)
  })

  it('keeps a key stored by one tab when another tab fails late with a key change', async () => {
    const server = new FakeServer()
    const one = await ready(server, true)
    const locks = fakeLocks()
    const a = device(server, undefined, { locks })
    await a.controller.start()
    await signIn(a.controller, server)
    await a.controller.enterPassphrase(PASS)
    await synced(a.controller)
    const gate = gated(server)
    const b = device(server, a.db, { locks, fetchImpl: gate.fetchImpl })
    await b.controller.start()
    await one.controller.resetSync('frasa sandi baru')
    await synced(one.controller)

    gate.arm()
    const before = gate.calls()
    const round = b.controller.syncNow()
    await vi.waitFor(() => expect(gate.calls()).toBeGreaterThan(before))
    const entering = a.controller.enterPassphrase('frasa sandi baru')
    await Promise.race([entering, quiet(400)])
    gate.release()
    await Promise.all([round, entering])
    await a.controller.syncNow()
    await b.controller.syncNow()

    expect(await getState(a.db, 'keys')).toBeDefined()
    expect(await getState(a.db, 'keyId')).toBe(server.user(EMAIL).key!.keyId)
    expect(a.controller.status()).toMatchObject({ phase: 'ready', problem: null })
    expect(b.controller.status()).toMatchObject({ phase: 'ready', problem: null })
  })

  it('does not publish a new status when a reload finds nothing changed', async () => {
    const server = new FakeServer()
    const out = device(server)
    await out.controller.start()
    const before = out.controller.status()
    let calls = 0
    out.controller.subscribe(() => calls++)
    document.dispatchEvent(new Event('visibilitychange'))
    await quiet(50)
    expect(out.controller.status()).toBe(before)
    expect(calls).toBe(0)

    const d = device(server, undefined, { now: () => 1 })
    await d.controller.start()
    await signIn(d.controller, server)
    await d.controller.createPassphrase(PASS)
    await synced(d.controller)
    await quiet()
    let notified = 0
    d.controller.subscribe(() => notified++)
    await d.controller.syncNow()
    // Only syncing going true and false: the reload at the start of the round changes nothing.
    expect(notified).toBe(2)
    expect(d.controller.status().lastSyncAt).toBe(1)
  })
})

/** A started, signed-in device with the passphrase, whose first sync is done. */
async function prepared(server: FakeServer, extra: DeviceOptions) {
  const d = device(server, undefined, extra)
  await d.controller.start()
  await signIn(d.controller, server)
  await d.controller.createPassphrase(PASS)
  await synced(d.controller)
  return d
}

const hide = () => vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

describe('when the page is hidden or closed', () => {
  it('starts a pending round at once when the document becomes hidden', async () => {
    const server = new FakeServer()
    const d = await prepared(server, { debounceMs: 10_000 })
    await d.diary.save(DAY, { markdown: 'ditulis lalu layar dikunci' })
    await quiet(50)
    expect(server.user(EMAIL).records.size).toBe(0)
    hide()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
  })

  it('starts a pending round at once on pagehide', async () => {
    const server = new FakeServer()
    const d = await prepared(server, { debounceMs: 10_000 })
    await d.diary.save(DAY, { markdown: 'ditulis lalu tab ditutup' })
    await quiet(50)
    window.dispatchEvent(new Event('pagehide'))
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
  })

  it('makes no request when the page is hidden with nothing pending', async () => {
    const server = new FakeServer()
    await prepared(server, { debounceMs: 10_000 })
    const before = server.requests.length
    hide()
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    await quiet()
    expect(server.requests.length).toBe(before)
  })

  it('does not wait for the pause when something is saved while the page is already hidden', async () => {
    const server = new FakeServer()
    const d = await prepared(server, { debounceMs: 10_000 })
    hide()
    document.dispatchEvent(new Event('visibilitychange'))
    // The editor saves its last keystrokes on the same event, so the change lands after the page was hidden.
    await d.diary.save(DAY, { markdown: 'tersimpan setelah layar dikunci' })
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
  })

  it('does not cut a retry wait short, and listens to nothing after stop', async () => {
    const server = new FakeServer()
    const d = await prepared(server, { debounceMs: 10_000, retryDelaysMs: [10_000] })
    server.offline = true
    await d.diary.save(DAY, { markdown: 'saat offline' })
    await d.controller.syncNow()
    expect(d.controller.status().problem).toBe('retrying')
    server.offline = false
    const before = server.requests.length
    window.dispatchEvent(new Event('pagehide'))
    await quiet()
    expect(server.requests.length).toBe(before)

    await d.controller.syncNow()
    await d.diary.save('2026-10-02', { markdown: 'menunggu jeda' })
    await quiet(50)
    d.controller.stop()
    const stopped = server.requests.length
    window.dispatchEvent(new Event('pagehide'))
    hide()
    document.dispatchEvent(new Event('visibilitychange'))
    await quiet()
    expect(server.requests.length).toBe(stopped)
  })
})

describe('answers the client cannot use', () => {
  it('runs another round by itself when a round ends with conflicts', async () => {
    const server = new FakeServer()
    let refusals = 3
    let posts = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === 'POST' && String(input).endsWith('/sync')) {
        posts++
        if (refusals > 0) {
          refusals--
          const ids = (JSON.parse(init.body as string) as { records: { id: string }[] }).records.map((r) => r.id)
          return new Response(JSON.stringify({ applied: [], conflicts: ids }), { status: 200 })
        }
      }
      return server.fetch(input, init)
    }
    const d = await prepared(server, { fetchImpl, debounceMs: 10_000, retryDelaysMs: [20] })
    await d.diary.save(DAY, { markdown: 'bentrok tiga kali' })
    await d.controller.syncNow()
    // One round: three attempts, all refused. It is not a problem to show, and not a finished job either.
    expect(posts).toBe(3)
    expect(server.user(EMAIL).records.size).toBe(0)
    expect(d.controller.status().problem).toBeNull()
    await vi.waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
    expect(d.controller.status().problem).toBeNull()
    await quiet(150)
    expect(posts).toBe(4)
  })

  it('keeps the keys and retries when the sync answer has the wrong shape', async () => {
    const server = new FakeServer()
    let broken = false
    const fetchImpl: typeof fetch = async (input, init) => {
      if (broken && (init?.method ?? 'GET') === 'GET' && String(input).includes('/sync?')) return new Response('{}', { status: 200 })
      return server.fetch(input, init)
    }
    const d = await prepared(server, { fetchImpl, retryDelaysMs: [10_000] })
    broken = true
    await d.controller.syncNow()
    expect(d.controller.status()).toMatchObject({ phase: 'ready', problem: 'retrying' })
    expect(await getState(d.db, 'keys')).toBeDefined()
    expect(await getState(d.db, 'keyId')).toBe(server.user(EMAIL).key!.keyId)
  })

  it('asks for an update, and does not retry, when the server refuses the request itself', async () => {
    const server = new FakeServer()
    const d = await prepared(server, { retryDelaysMs: [20] })
    server.failNext(400, 'bad_request')
    await d.controller.syncNow()
    expect(d.controller.status()).toMatchObject({ phase: 'ready', problem: 'outdated' })
    const before = server.requests.length
    await quiet(150)
    expect(server.requests.length).toBe(before)
    // The next round is a normal one.
    await d.controller.syncNow()
    expect(d.controller.status().problem).toBeNull()
  })

  it('still retries when the server asks to slow down', async () => {
    const server = new FakeServer()
    const d = await prepared(server, { retryDelaysMs: [20] })
    server.failNext(429, 'rate_limited')
    await d.controller.syncNow()
    expect(d.controller.status().problem).toBe('retrying')
    await vi.waitFor(() => expect(d.controller.status().problem).toBeNull())
  })
})
