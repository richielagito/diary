import type { ChatRequest } from '../provider/types'
import type { ChatProvider } from '../provider/types'
import { ProviderError } from '../provider/types'
import { DiaryDB } from '../../storage/db'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
import { DexieSummaryRepository } from '../../storage/DexieSummaryRepository'
import { isStale, maintainSummaries } from './maintainSummaries'

let db: DiaryDB
let diary: DexieDiaryRepository
let summaries: DexieSummaryRepository
let requests: ChatRequest[]
const provider = (reply = 'Ringkasan.'): ChatProvider => ({
  async *stream(req) {
    requests.push(req)
    yield reply
  },
})
const deps = (p: ChatProvider, limit = 2) => ({
  diary,
  summaries,
  provider: p,
  language: 'id' as const,
  moodLabel: (m: number) => `M${m}`,
  today: '2026-09-28',
  limit,
  now: () => 500,
})

beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  diary = new DexieDiaryRepository(db, () => 10)
  summaries = new DexieSummaryRepository(db)
  requests = []
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('isStale rules', () => {
  const e = { date: '2026-09-15', markdown: 'x', mood: null, tags: [], wordCount: 1, createdAt: 1, updatedAt: 10 }
  const s = { id: 'w', kind: 'week' as const, periodStart: '', periodEnd: '', text: '', entryCount: 1, sourceUpdatedAt: 10, createdAt: 1 }
  expect(isStale(undefined, [e])).toBe(true)
  expect(isStale(s, [e])).toBe(false)
  expect(isStale(s, [e, { ...e, date: '2026-09-16' }])).toBe(true)
  expect(isStale(s, [{ ...e, updatedAt: 11 }])).toBe(true)
  // An overwrite with older content (e.g. an import) also changes the source.
  expect(isStale(s, [{ ...e, updatedAt: 5 }])).toBe(true)
})

test('stored summaries outside the completed-period window are removed', async () => {
  const base = { text: 'x', entryCount: 1, sourceUpdatedAt: 1, createdAt: 1 }
  await summaries.put({ ...base, id: 'week:2026-05-04', kind: 'week', periodStart: '2026-05-04', periodEnd: '2026-05-10' })
  await summaries.put({ ...base, id: 'month:2026-02', kind: 'month', periodStart: '2026-02-01', periodEnd: '2026-02-28' })
  await diary.save('2026-09-22', { markdown: 'a' })
  await maintainSummaries(deps(provider()))
  expect((await summaries.list()).map((s) => s.id)).toEqual(['week:2026-09-21'])
})

test('creates at most `limit` summaries, newest period first, skipping empty periods', async () => {
  await diary.save('2026-09-22', { markdown: 'minggu lalu' }) // week:2026-09-21
  await diary.save('2026-09-15', { markdown: 'dua minggu lalu' }) // week:2026-09-14
  await diary.save('2026-08-10', { markdown: 'agustus' }) // month:2026-08 & week:2026-08-10
  expect(await maintainSummaries(deps(provider()))).toBe(2)
  expect((await summaries.list()).map((s) => s.id).sort()).toEqual(['week:2026-09-14', 'week:2026-09-21'])
  expect(await summaries.get('week:2026-09-21')).toMatchObject({
    kind: 'week',
    periodStart: '2026-09-21',
    periodEnd: '2026-09-27',
    text: 'Ringkasan.',
    entryCount: 1,
    sourceUpdatedAt: 10,
    createdAt: 500,
  })
  expect(requests[0].messages[0].content).toContain('Week from 2026-09-21 to 2026-09-27')
  expect(requests[0].messages[0].content).toContain('minggu lalu')
  expect(requests[0].cache).toBeFalsy()
})

test('fresh summaries are skipped; edited entries make them stale again', async () => {
  await diary.save('2026-09-22', { markdown: 'a' })
  await maintainSummaries(deps(provider()))
  requests = []
  expect(await maintainSummaries(deps(provider()))).toBe(0)
  expect(requests).toHaveLength(0)
  diary = new DexieDiaryRepository(db, () => 20)
  await diary.save('2026-09-22', { markdown: 'a diubah' })
  expect(await maintainSummaries(deps(provider('Baru.')))).toBe(1)
  expect((await summaries.get('week:2026-09-21'))?.text).toBe('Baru.')
})

test('a summary whose period no longer has entries is removed', async () => {
  await summaries.put({ id: 'week:2026-09-21', kind: 'week', periodStart: '2026-09-21', periodEnd: '2026-09-27', text: 'x', entryCount: 1, sourceUpdatedAt: 1, createdAt: 1 })
  await maintainSummaries(deps(provider()))
  expect(await summaries.get('week:2026-09-21')).toBeUndefined()
})

test('provider error stops without writing; empty reply is not stored', async () => {
  await diary.save('2026-09-22', { markdown: 'a' })
  const failing: ChatProvider = {
    // eslint-disable-next-line require-yield
    async *stream() {
      throw new ProviderError('network')
    },
  }
  expect(await maintainSummaries(deps(failing))).toBe(0)
  expect(await maintainSummaries(deps(provider('   ')))).toBe(0)
  expect(await summaries.list()).toEqual([])
})

test('a concurrent run returns 0', async () => {
  await diary.save('2026-09-22', { markdown: 'a' })
  let release: (() => void) | null = null
  const slow: ChatProvider = {
    async *stream() {
      await new Promise<void>((r) => (release = r))
      yield 'x'
    },
  }
  const first = maintainSummaries(deps(slow))
  await vi.waitFor(() => expect(release).not.toBeNull())
  expect(await maintainSummaries(deps(provider()))).toBe(0)
  release!()
  await first
})
