import type { Api, PushRecord } from '../account/api'
import type { DayEntry } from '../domain/types'
import type { DiaryDB, SyncIndexRow } from '../storage/db'
import { accepts, getLocal, readLocal, syncedTables, writeLocal, type LocalRecord } from './collections'
import { OutdatedError, blobBytes, open, recordId, seal, type Envelope, type SyncKeys } from './crypto'
import { mergeEntry, type EntryBase } from './mergeEntry'
import { getState, setState } from './state'

export const MAX_BLOB_BYTES = 1024 * 1024
const MAX_PUSH_RECORDS = 100
const MAX_PUSH_BYTES = 4 * 1024 * 1024
/** Tarik lalu kirim diulang kalau server melaporkan bentrok; sisanya menunggu sync berikutnya. */
const MAX_ROUNDS = 3

/** Kunci akun di server bukan lagi kunci perangkat ini (perangkat lain melakukan reset). */
export class KeyChangedError extends Error {
  constructor() {
    super('sync key changed')
  }
}

export interface SyncDeps {
  db: DiaryDB
  api: Api
  token: string
  keys: SyncKeys
  keyId: string
  now: () => number
}

export interface SyncOutcome {
  /** Record yang diterima dan didekripsi. */
  pulled: number
  pushed: number
  /** Record lokal di atas 1 MB, tidak dikirim. */
  skippedTooLarge: number
}

const entryBase = (d: unknown): EntryBase => ({ markdown: (d as DayEntry).markdown, mood: (d as DayEntry).mood })

function baseOf(c: string, d: unknown): SyncIndexRow['base'] {
  if (d === null) return undefined
  if (c === 'entries') return entryBase(d)
  if (c === 'settings') return JSON.stringify(d)
  return undefined
}

/** True kalau record lokal bukan lagi yang diketahui ada di server. */
function differs(local: LocalRecord | null, idx: SyncIndexRow): boolean {
  if (idx.deleted) return local !== null
  if (local === null) return true
  if (idx.c === 'settings') return JSON.stringify(local.d) !== idx.base
  if (idx.c === 'entries') {
    const server = idx.base as EntryBase
    const mine = entryBase(local.d)
    return local.t !== idx.t || mine.markdown !== server.markdown || mine.mood !== server.mood
  }
  return local.t !== idx.t
}

/** Menerapkan satu record dari server. Dipanggil di dalam transaksi; tidak boleh menunggu apa pun selain Dexie. */
async function applyRemote(db: DiaryDB, id: string, rev: number, env: Envelope, now: number): Promise<void> {
  const idx = await db.syncIndex.get(id)
  if (idx?.rev === rev) return
  if (!accepts(env.c, env.k, env.d)) return
  if (idx?.sent && idx.sent.t === env.t && idx.sent.json === JSON.stringify(env.d)) {
    // Tulisan perangkat ini sendiri yang jawabannya hilang. Server sudah memegangnya: cukup catat revisinya.
    // Kalau isi lokal sudah berubah lagi sejak itu, pushAll mengirimnya sebagai edit biasa, tanpa gabung.
    await db.syncIndex.put({ id, c: env.c, k: env.k, t: env.t, rev, deleted: env.d === null, base: baseOf(env.c, env.d) })
    return
  }
  const local = await getLocal(db, env.c, env.k)
  const localChanged = idx ? differs(local, idx) : local !== null

  if (!localChanged) {
    await writeLocal(db, env.c, env.k, env.d)
  } else if (env.c === 'entries') {
    const base = idx && !idx.deleted ? (idx.base as EntryBase) : null
    const merge = mergeEntry((local?.d as DayEntry | undefined) ?? null, env.d as DayEntry | null, base, now)
    if (merge === 'remote') await writeLocal(db, env.c, env.k, env.d)
    else if (merge !== 'local') await writeLocal(db, env.c, env.k, merge.merged)
  } else if (JSON.stringify(local?.d ?? null) === JSON.stringify(env.d) || (local?.t ?? now) <= env.t) {
    // Isinya sama, atau versi server lebih baru. Pengaturan dan hapus lokal tidak punya waktu sendiri, jadi dihitung "sekarang".
    await writeLocal(db, env.c, env.k, env.d)
  }
  // Indeks selalu mencatat keadaan server. Kalau perangkat ini mempertahankan isi yang berbeda, pushAll akan mengirimnya.
  await db.syncIndex.put({ id, c: env.c, k: env.k, t: env.t, rev, deleted: env.d === null, base: baseOf(env.c, env.d) })
}

async function pullAll({ db, api, token, keys, keyId, now }: SyncDeps): Promise<number> {
  let cursor = (await getState<number>(db, 'cursor')) ?? 0
  let count = 0
  for (;;) {
    const page = await api.pull(token, cursor)
    if (page.keyId !== keyId) throw new KeyChangedError()
    if (page.rev < cursor) {
      // Riwayat server mundur (database dipulihkan): lupakan kursor dan revisi, lalu mulai dari 0.
      await db.transaction('rw', db.syncIndex, db.syncState, async () => {
        await db.syncIndex.clear()
        await setState(db, 'cursor', 0)
      })
      cursor = 0
      continue
    }

    // ponytail: tulisan perangkat ini sendiri ikut terunduh lagi (dilewati sebelum dekripsi). Kalau boros, majukan kursor setelah kirim.
    const known = await db.syncIndex.bulkGet(page.records.map((r) => r.id))
    const opened: { id: string; rev: number; env: Envelope }[] = []
    for (const [i, record] of page.records.entries()) {
      if (known[i]?.rev === record.rev) continue
      try {
        const env = await open(keys, record.id, record.blob)
        // Percayai id, bukan isi amplop: amplop yang bukan milik id-nya bisa menimpa record lain.
        if ((await recordId(keys, env.c, env.k)) !== record.id) throw new Error('id mismatch')
        opened.push({ id: record.id, rev: record.rev, env })
      } catch (e) {
        if (e instanceof OutdatedError) throw e
        console.warn('sync: skipped a record that could not be decrypted')
      }
    }

    // Dekripsi di luar, penerapan di dalam satu transaksi: halaman diterapkan utuh bersama kursornya, atau tidak sama sekali.
    await db.transaction('rw', [...syncedTables(db), db.syncIndex, db.syncState], async () => {
      for (const r of opened) await applyRemote(db, r.id, r.rev, r.env, now())
      await setState(db, 'cursor', page.rev)
    })
    count += opened.length
    const advanced = page.rev > cursor
    cursor = page.rev
    if (!page.more || !advanced) return count
  }
}

interface Pending {
  id?: string
  c: string
  k: string
  t: number
  d: unknown
  prevRev: number
}

async function pending({ db, now }: SyncDeps): Promise<Pending[]> {
  const index = new Map((await db.syncIndex.toArray()).map((row) => [`${row.c}\n${row.k}`, row]))
  const seen = new Set<string>()
  const out: Pending[] = []
  // ponytail: memindai semua record tiap putaran. Kalau diary sangat besar terasa lambat, catat perubahan per tabel (hook Dexie).
  for (const local of await readLocal(db)) {
    const key = `${local.c}\n${local.k}`
    seen.add(key)
    const idx = index.get(key)
    if (idx && !differs(local, idx)) continue
    out.push({ id: idx?.id, c: local.c, k: local.k, t: local.t ?? now(), d: local.d, prevRev: idx?.rev ?? 0 })
  }
  for (const [key, idx] of index) {
    // Ada di server, sudah tidak ada di sini: kirim penanda hapus.
    // Pengaturan tidak pernah dihapus, jadi tidak ada penanda hapus untuknya.
    if (!seen.has(key) && !idx.deleted && idx.c !== 'settings') out.push({ id: idx.id, c: idx.c, k: idx.k, t: now(), d: null, prevRev: idx.rev })
  }
  return out
}

async function pushAll(deps: SyncDeps): Promise<{ pushed: number; conflicts: number; skipped: number }> {
  const { db, api, token, keys, keyId } = deps
  let pushed = 0
  let conflicts = 0
  let skipped = 0
  let batch: { record: PushRecord; item: Pending }[] = []
  let bytes = 0

  const flush = async () => {
    if (batch.length === 0) return
    const sent = batch
    batch = []
    bytes = 0
    // Catat dulu apa yang dikirim; kalau jawabannya hilang, tulisan ini dikenali lagi saat ditarik.
    // Record tanpa baris indeks mendapat penanda "server belum punya apa-apa" (rev 0, deleted).
    await db.transaction('rw', db.syncIndex, async () => {
      for (const { record, item } of sent) {
        const row = (await db.syncIndex.get(record.id)) ?? { id: record.id, c: item.c, k: item.k, t: 0, rev: 0, deleted: true }
        await db.syncIndex.put({ ...row, sent: { t: item.t, json: JSON.stringify(item.d) } })
      }
    })
    const res = await api.push(token, keyId, sent.map((s) => s.record))
    const revs = new Map(res.applied.map((a) => [a.id, a.rev]))
    await db.syncIndex.bulkPut(
      sent
        .filter((s) => revs.has(s.record.id))
        .map(({ record, item }) => ({
          id: record.id,
          c: item.c,
          k: item.k,
          t: item.t,
          rev: revs.get(record.id)!,
          deleted: item.d === null,
          base: baseOf(item.c, item.d),
        })),
    )
    pushed += res.applied.length
    conflicts += res.conflicts.length
  }

  for (const item of await pending(deps)) {
    const id = item.id ?? (await recordId(keys, item.c, item.k))
    const blob = await seal(keys, id, { v: 1, c: item.c, k: item.k, t: item.t, d: item.d })
    const size = blobBytes(blob)
    if (size > MAX_BLOB_BYTES) {
      skipped++
      continue
    }
    if (batch.length === MAX_PUSH_RECORDS || bytes + size > MAX_PUSH_BYTES) await flush()
    batch.push({ record: { id, blob, prevRev: item.prevRev }, item })
    bytes += size
  }
  await flush()
  return { pushed, conflicts, skipped }
}

/** Satu putaran sync: tarik, gabung, kirim. Aman dipanggil berulang dan aman kalau terputus di tengah. */
export async function syncOnce(deps: SyncDeps): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { pulled: 0, pushed: 0, skippedTooLarge: 0 }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    outcome.pulled += await pullAll(deps)
    const result = await pushAll(deps)
    outcome.pushed += result.pushed
    outcome.skippedTooLarge = result.skipped
    if (result.conflicts === 0) break
  }
  return outcome
}
