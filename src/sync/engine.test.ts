import { DEFAULT_PERSONA } from '../ai/prompt/persona'
import { NetworkError, createApi, type Api } from '../account/api'
import { DexieChatRepository } from '../storage/DexieChatRepository'
import { DiaryDB } from '../storage/db'
import { DexieDiaryRepository, withDerived } from '../storage/DexieDiaryRepository'
import { DexieLetterRepository } from '../storage/DexieLetterRepository'
import { DexieMemoryRepository } from '../storage/DexieMemoryRepository'
import { DexieSettingsStore } from '../storage/DexieSettingsStore'
import { DexieSummaryRepository } from '../storage/DexieSummaryRepository'
import { defaultSettings } from '../storage/SettingsStore'
import { OutdatedError, createKey, fromBase64, open, recordId, seal, type Envelope, type SyncKeys } from './crypto'
import { KeyChangedError, syncOnce, type SyncDeps } from './engine'
import { MERGE_SEPARATOR } from './mergeEntry'
import { getState } from './state'
import { FakeServer } from './testing/fakeServer'

const EMAIL = 'a@example.com'
const DAY = '2026-10-01'

interface Session {
  token: string
  keys: SyncKeys
  keyId: string
}

let shared: { keys: SyncKeys; wrappedKey: Awaited<ReturnType<typeof createKey>>['wrappedKey'] }
beforeAll(async () => {
  shared = await createKey('frasa sandi panjang', 100_000)
})

async function account(server: FakeServer): Promise<Session> {
  const api = createApi(server.origin, server.fetch)
  await api.emailStart(EMAIL, 'id')
  const token = await api.emailVerify(EMAIL, server.lastCode(EMAIL))
  await api.putKey(token, shared.wrappedKey, false)
  return { token, keys: shared.keys, keyId: shared.wrappedKey.keyId }
}

function device(server: FakeServer, session: Session) {
  const db = new DiaryDB(`test-${crypto.randomUUID()}`)
  const clock = { now: 1000 }
  const deps: SyncDeps = { db, api: createApi(server.origin, server.fetch), ...session, now: () => clock.now }
  return {
    db,
    clock,
    deps,
    diary: new DexieDiaryRepository(db, () => clock.now),
    settings: new DexieSettingsStore(db, defaultSettings('id')),
    chats: new DexieChatRepository(db),
    memories: new DexieMemoryRepository(db),
    summaries: new DexieSummaryRepository(db),
    letters: new DexieLetterRepository(db),
    sync: () => syncOnce(deps),
  }
}

async function twoDevices() {
  const server = new FakeServer()
  const session = await account(server)
  return { server, session, a: device(server, session), b: device(server, session) }
}

/** Decrypts everything the server holds. */
async function serverEnvelopes(server: FakeServer, keys: SyncKeys): Promise<Envelope[]> {
  const out: Envelope[] = []
  for (const [id, record] of server.user(EMAIL).records) out.push(await open(keys, id, record.blob))
  return out
}

const pushCount = (server: FakeServer) => server.requests.filter((r) => r.method === 'POST' && r.path === '/sync').length

describe('entries', () => {
  it('carries an entry from one device to another', async () => {
    const { a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'hari ini #olahraga', mood: 4 })
    expect(await a.sync()).toMatchObject({ pushed: 1 })
    await b.sync()
    expect(await b.diary.get(DAY)).toEqual(await a.diary.get(DAY))
  })

  it('shows the server neither the text nor the date', async () => {
    const { server, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'rahasia besar', mood: 4 })
    await a.sync()
    for (const [id, record] of server.user(EMAIL).records) {
      expect(id).not.toContain('2026')
      expect(new TextDecoder().decode(fromBase64(record.blob))).not.toContain('rahasia')
    }
  })

  it('sends nothing when nothing changed', async () => {
    const { server, a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu', mood: null })
    await a.sync()
    await b.sync()
    const before = pushCount(server)
    expect(await a.sync()).toMatchObject({ pushed: 0 })
    expect(await b.sync()).toMatchObject({ pushed: 0 })
    expect(pushCount(server)).toBe(before)
  })

  it('carries an edit and a deletion', async () => {
    const { a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu', mood: 3 })
    await a.sync()
    await b.sync()
    b.clock.now = 2000
    await b.diary.save(DAY, { markdown: 'satu dua' })
    await b.sync()
    await a.sync()
    expect((await a.diary.get(DAY))!.markdown).toBe('satu dua')

    await a.diary.delete(DAY)
    await a.sync()
    await b.sync()
    expect(await b.diary.get(DAY)).toBeUndefined()
    expect((await b.sync()).pushed).toBe(0)
  })

  it('keeps a mood set on one device and text written on another', async () => {
    const { a, b } = await twoDevices()
    a.clock.now = 10
    await a.diary.save(DAY, { markdown: 'tiga ratus kata tentang rapat' })
    b.clock.now = 20
    await b.diary.save(DAY, { mood: 5 })
    await b.sync()
    a.clock.now = 30
    await a.sync()
    await b.sync()
    for (const d of [a, b]) expect(await d.diary.get(DAY)).toMatchObject({ markdown: 'tiga ratus kata tentang rapat', mood: 5 })
  })

  it('stacks both texts when two devices edited the same day', async () => {
    const { a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'awal' })
    await a.sync()
    await b.sync()
    a.clock.now = 2000
    await a.diary.save(DAY, { markdown: 'versi laptop' })
    b.clock.now = 3000
    await b.diary.save(DAY, { markdown: 'versi hp' })
    await a.sync()
    b.clock.now = 4000
    await b.sync()
    await a.sync()
    const expected = `versi hp${MERGE_SEPARATOR}versi laptop`
    expect((await a.diary.get(DAY))!.markdown).toBe(expected)
    expect((await b.diary.get(DAY))!.markdown).toBe(expected)
    expect((await a.sync()).pushed).toBe(0)
    expect((await b.sync()).pushed).toBe(0)
  })

  it('keeps both texts when a second device already wrote that day before its first sync', async () => {
    const { a, b } = await twoDevices()
    a.clock.now = 800
    await a.diary.save(DAY, { markdown: 'rapat pagi' })
    await a.sync()
    b.clock.now = 2100
    await b.diary.save(DAY, { markdown: 'capek banget' })
    await b.sync()
    await a.sync()
    for (const d of [a, b]) expect((await d.diary.get(DAY))!.markdown).toBe(`capek banget${MERGE_SEPARATOR}rapat pagi`)
  })

  it('does not double a diary that the second device got from a backup, where tags lost their backslash', async () => {
    const { a, b } = await twoDevices()
    // Same timestamps, the import newer, the original newer.
    const days = [
      { date: '2026-09-29', original: 20, imported: 20 },
      { date: '2026-09-30', original: 20, imported: 30 },
      { date: DAY, original: 30, imported: 20 },
    ]
    for (const d of days) {
      await a.db.entries.put(withDerived({ date: d.date, markdown: 'hari tenang #self\\_care', mood: 4, createdAt: 10, updatedAt: d.original }))
      await b.db.entries.put(withDerived({ date: d.date, markdown: 'hari tenang #self_care', mood: 4, createdAt: 10, updatedAt: d.imported }))
    }
    await a.sync()
    await b.sync()
    await a.sync()
    await b.sync()
    expect((await a.sync()).pushed).toBe(0)
    expect((await b.sync()).pushed).toBe(0)
    for (const d of days) {
      const text = (await a.diary.get(d.date))!.markdown
      expect(text).not.toContain('---')
      expect(text.replace('\\', '')).toBe('hari tenang #self_care')
      expect((await b.diary.get(d.date))!.markdown).toBe(text)
    }
  })

  it('lets an edit win over a deletion made elsewhere', async () => {
    const { a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'awal' })
    await a.sync()
    await b.sync()
    await a.diary.delete(DAY)
    b.clock.now = 2000
    await b.diary.save(DAY, { markdown: 'awal lalu lanjut' })
    await a.sync()
    await b.sync()
    await a.sync()
    for (const d of [a, b]) expect((await d.diary.get(DAY))!.markdown).toBe('awal lalu lanjut')
  })
})

describe('other data', () => {
  it('carries chats, memories, summaries and letters, and their deletion', async () => {
    const { a, b } = await twoDevices()
    await a.chats.add({ date: DAY, role: 'user', content: 'halo', createdAt: 1, status: 'complete' })
    await a.memories.add('suka kopi', 'user', 5)
    await a.summaries.put({ id: 'month:2026-09', kind: 'month', periodStart: '2026-09-01', periodEnd: '2026-09-30', text: 'ringkasan', entryCount: 3, sourceUpdatedAt: 1, createdAt: 2 })
    await a.letters.put({ periodId: '2026-09', text: 'surat', fingerprint: 'f', createdAt: 3 })
    await a.sync()
    await b.sync()
    expect(await b.chats.listAll()).toEqual(await a.chats.listAll())
    expect(await b.memories.list()).toEqual(await a.memories.list())
    expect(await b.summaries.list()).toEqual(await a.summaries.list())
    expect(await b.letters.get('2026-09')).toEqual(await a.letters.get('2026-09'))

    await a.chats.deleteByDate(DAY)
    await a.memories.clear()
    await a.sync()
    await b.sync()
    expect(await b.chats.listAll()).toEqual([])
    expect(await b.memories.list()).toEqual([])
  })

  it('syncs settings per key, including the AI key, and never the device-only ones', async () => {
    const { server, session, a, b } = await twoDevices()
    const ai = { provider: 'anthropic' as const, apiKey: 'sk-rahasia', baseUrl: '', model: 'm', fastModel: '' }
    await a.settings.set('theme', 'dark')
    await a.settings.set('ai', ai)
    await a.settings.set('lastExportAt', 55)
    await a.settings.set('persistGranted', true)
    await b.settings.set('persona', { ...DEFAULT_PERSONA, name: 'Bima' })
    await a.sync()
    await b.sync()
    await a.sync()
    for (const d of [a, b]) {
      expect(await d.settings.getAll()).toMatchObject({ theme: 'dark', ai, persona: { name: 'Bima' } })
    }
    expect(await b.settings.getAll()).toMatchObject({ lastExportAt: null, persistGranted: null })

    const envelopes = await serverEnvelopes(server, session.keys)
    expect(envelopes.map((e) => e.k).sort()).toEqual(['ai', 'persona', 'theme'])
    for (const record of server.user(EMAIL).records.values()) {
      expect(new TextDecoder().decode(fromBase64(record.blob))).not.toContain('sk-rahasia')
    }
  })

  it('lets the device that syncs last decide a setting changed on both', async () => {
    const { a, b } = await twoDevices()
    await a.settings.set('theme', 'dark')
    await a.sync()
    await b.settings.set('theme', 'light')
    b.clock.now = 2000
    await b.sync()
    await a.sync()
    expect((await a.settings.getAll()).theme).toBe('light')
    expect((await b.settings.getAll()).theme).toBe('light')
  })

  it('carries a setting whose value is null', async () => {
    const { a, b } = await twoDevices()
    await b.settings.set('backupReminderDays', 30)
    await b.sync()
    await a.sync()
    await a.settings.set('backupReminderDays', null)
    await a.sync()
    await b.sync()
    expect((await b.settings.getAll()).backupReminderDays).toBeNull()
  })
})

describe('trouble', () => {
  it('recovers when the response to a push is lost', async () => {
    const { server, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu', mood: 3 })
    await a.chats.add({ date: DAY, role: 'user', content: 'halo', createdAt: 1, status: 'complete' })
    const real = a.deps.api
    const lossy: Api = {
      ...real,
      push: async (token, keyId, records) => {
        await real.push(token, keyId, records)
        throw new NetworkError()
      },
    }
    await expect(syncOnce({ ...a.deps, api: lossy })).rejects.toBeInstanceOf(NetworkError)
    expect(await a.sync()).toMatchObject({ pushed: 0 })
    expect(server.user(EMAIL).records.size).toBe(2)
    expect((await a.diary.get(DAY))!.markdown).toBe('satu')
    expect(await a.chats.listAll()).toHaveLength(1)
  })

  it('merges and retries when another device wrote between its pull and its push', async () => {
    const { a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'awal' })
    await a.sync()
    await b.sync()
    a.clock.now = 2000
    await a.diary.save(DAY, { markdown: 'versi laptop' })
    b.clock.now = 3000
    await b.diary.save(DAY, { markdown: 'versi hp' })

    const real = b.deps.api
    let raced = false
    const racing: Api = {
      ...real,
      pull: async (token, since) => {
        const page = await real.pull(token, since)
        if (!raced) {
          raced = true
          await a.sync()
        }
        return page
      },
    }
    b.clock.now = 4000
    await syncOnce({ ...b.deps, api: racing })
    await a.sync()
    const expected = `versi hp${MERGE_SEPARATOR}versi laptop`
    expect((await a.diary.get(DAY))!.markdown).toBe(expected)
    expect((await b.diary.get(DAY))!.markdown).toBe(expected)
  })

  it('uploads nothing when the key changed', async () => {
    const { server, session, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu' })
    const fresh = await createKey('frasa lain panjang', 100_000)
    await a.deps.api.putKey(session.token, fresh.wrappedKey, true)
    await expect(a.sync()).rejects.toBeInstanceOf(KeyChangedError)
    expect(server.user(EMAIL).records.size).toBe(0)
    expect((await a.diary.get(DAY))!.markdown).toBe('satu')
  })

  it('starts over when the server history went backwards', async () => {
    const { server, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu' })
    await a.diary.save('2026-10-02', { markdown: 'dua' })
    await a.sync()
    // The cursor moves on a pull, so the second sync is the one that passes this device's own two writes.
    await a.sync()
    expect(await getState<number>(a.db, 'cursor')).toBe(2)
    server.rewind(EMAIL)
    await a.sync()
    expect(server.user(EMAIL).records.size).toBe(2)
    expect((await a.diary.get(DAY))!.markdown).toBe('satu')
  })

  it('reads every page of a long pull', async () => {
    const { server, a, b } = await twoDevices()
    for (let day = 1; day <= 5; day++) await a.diary.save(`2026-10-0${day}`, { markdown: `hari ${day}` })
    await a.sync()
    server.pageSize = 2
    await b.sync()
    expect(await b.diary.list()).toHaveLength(5)
  })

  it('sends more than 100 records in several requests', async () => {
    const { server, a, b } = await twoDevices()
    for (let i = 0; i < 205; i++) await a.chats.add({ date: DAY, role: 'user', content: `pesan ${i}`, createdAt: i, status: 'complete' })
    const before = pushCount(server)
    expect(await a.sync()).toMatchObject({ pushed: 205 })
    expect(pushCount(server) - before).toBe(3)
    await b.sync()
    expect(await b.chats.listAll()).toHaveLength(205)
  })

  it('skips a record over 1 MB and syncs the rest', async () => {
    const { server, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'x'.repeat(1_100_000) })
    await a.diary.save('2026-10-02', { markdown: 'kecil' })
    expect(await a.sync()).toMatchObject({ pushed: 1, skippedTooLarge: 1 })
    expect(server.user(EMAIL).records.size).toBe(1)
  })

  it('stops on a record written by a newer app version', async () => {
    const { session, a } = await twoDevices()
    const id = await recordId(session.keys, 'entries', '2030-01-01')
    const blob = await seal(session.keys, id, { v: 2, c: 'entries', k: '2030-01-01', t: 1, d: {} })
    await a.deps.api.push(session.token, session.keyId, [{ id, blob, prevRev: 0 }])
    await expect(a.sync()).rejects.toBeInstanceOf(OutdatedError)
  })

  it('ignores records it cannot store', async () => {
    const { session, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'tetap' })
    const odd: Envelope[] = [
      { v: 1, c: 'masa-depan', k: 'x', t: 1, d: { apa: 'saja' } },
      { v: 1, c: 'settings', k: 'persistGranted', t: 1, d: { value: true } },
      { v: 1, c: 'entries', k: DAY, t: 9_999_999, d: { date: 'lain', markdown: 5 } },
      { v: 1, c: 'memories', k: 'm1', t: 1, d: 'bukan objek' },
    ]
    const records = []
    for (const envelope of odd) {
      const id = await recordId(session.keys, envelope.c, envelope.k)
      records.push({ id, blob: await seal(session.keys, id, envelope), prevRev: 0 })
    }
    await a.deps.api.push(session.token, session.keyId, records)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await a.sync()
    warn.mockRestore()
    expect((await a.diary.get(DAY))!.markdown).toBe('tetap')
    expect((await a.settings.getAll()).persistGranted).toBeNull()
    expect(await a.memories.list()).toEqual([])
  })

  it('does not stack text when a push response is lost and the user keeps writing', async () => {
    const { server, a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu' })
    await a.sync()
    a.clock.now = 2000
    await a.diary.save(DAY, { markdown: 'satu dua' })
    const real = a.deps.api
    const lossy: Api = { ...real, push: async (token, keyId, records) => { await real.push(token, keyId, records); throw new NetworkError() } }
    await expect(syncOnce({ ...a.deps, api: lossy })).rejects.toBeInstanceOf(NetworkError)
    a.clock.now = 3000
    await a.diary.save(DAY, { markdown: 'satu dua tiga' })
    expect(await a.sync()).toMatchObject({ pushed: 1 })
    expect((await a.diary.get(DAY))!.markdown).toBe('satu dua tiga')
    await b.sync()
    expect((await b.diary.get(DAY))!.markdown).toBe('satu dua tiga')
    expect(server.user(EMAIL).records.size).toBe(1)
  })

  it('does not stack text when the very first push response is lost', async () => {
    const { a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu' })
    await a.settings.set('theme', 'dark')
    const real = a.deps.api
    const lossy: Api = { ...real, push: async (token, keyId, records) => { await real.push(token, keyId, records); throw new NetworkError() } }
    await expect(syncOnce({ ...a.deps, api: lossy })).rejects.toBeInstanceOf(NetworkError)
    a.clock.now = 2000
    await a.diary.save(DAY, { markdown: 'satu dua' })
    await a.settings.set('theme', 'light')
    await a.sync()
    await b.sync()
    for (const d of [a, b]) {
      expect((await d.diary.get(DAY))!.markdown).toBe('satu dua')
      expect((await d.settings.getAll()).theme).toBe('light')
    }
  })

  it('still uploads after a push that never reached the server', async () => {
    const { server, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu' })
    server.offline = true
    await expect(a.sync()).rejects.toBeInstanceOf(NetworkError)
    server.offline = false
    expect(await a.sync()).toMatchObject({ pushed: 1 })
    expect(server.user(EMAIL).records.size).toBe(1)
  })

  it('still uploads after a push that failed before reaching the server', async () => {
    const { server, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu' })
    const broken: Api = { ...a.deps.api, push: async () => { throw new NetworkError() } }
    await expect(syncOnce({ ...a.deps, api: broken })).rejects.toBeInstanceOf(NetworkError)
    expect(await a.sync()).toMatchObject({ pushed: 1 })
    expect(server.user(EMAIL).records.size).toBe(1)
    expect((await a.diary.get(DAY))!.markdown).toBe('satu')
  })

  it('takes the fuller text when a device that lost its sync state only held an older version', async () => {
    const { server, a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'awal' })
    await a.sync()
    await b.sync()
    a.clock.now = 2000
    await a.diary.save(DAY, { markdown: 'awal\n\nparagraf baru' })
    await a.sync()
    // b lost its index and cursor (re-login or key change) while still holding the old version.
    await b.db.syncIndex.clear()
    await b.db.syncState.delete('cursor')
    await b.sync()
    expect((await b.diary.get(DAY))!.markdown).toBe('awal\n\nparagraf baru')
    expect((await a.sync()).pushed).toBe(0)
    expect(server.user(EMAIL).records.size).toBe(1)
  })

  it('ignores a record whose envelope does not belong under its id', async () => {
    const { session, a } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'tetap' })
    const evil = withDerived({ date: DAY, markdown: 'jahat', mood: null, createdAt: 1, updatedAt: 9_999_999 })
    const id = await recordId(session.keys, 'entries', '2030-01-01')
    const blob = await seal(session.keys, id, { v: 1, c: 'entries', k: DAY, t: 9_999_999, d: evil })
    await a.deps.api.push(session.token, session.keyId, [{ id, blob, prevRev: 0 }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await a.sync()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
    expect((await a.diary.get(DAY))!.markdown).toBe('tetap')
  })

  it('never deletes a setting because of a deletion marker', async () => {
    const { session, a } = await twoDevices()
    await a.settings.set('theme', 'dark')
    const id = await recordId(session.keys, 'settings', 'theme')
    const blob = await seal(session.keys, id, { v: 1, c: 'settings', k: 'theme', t: 9_999_999, d: null })
    await a.deps.api.push(session.token, session.keyId, [{ id, blob, prevRev: 0 }])
    await a.sync()
    expect((await a.settings.getAll()).theme).toBe('dark')
  })

  it('skips a record it cannot decrypt and keeps going', async () => {
    const { session, a, b } = await twoDevices()
    await a.diary.save(DAY, { markdown: 'satu' })
    await a.sync()
    await a.deps.api.push(session.token, session.keyId, [{ id: 'rusak', blob: btoa('bukan ciphertext yang sah'), prevRev: 0 }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await b.sync()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).not.toContain('bukan')
    warn.mockRestore()
    expect((await b.diary.get(DAY))!.markdown).toBe('satu')
  })
})
