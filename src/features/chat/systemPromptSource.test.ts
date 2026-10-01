import { DiaryDB } from '../../storage/db'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
import { DexieMemoryRepository } from '../../storage/DexieMemoryRepository'
import { DexieSummaryRepository } from '../../storage/DexieSummaryRepository'
import { defaultSettings, type Settings } from '../../storage/SettingsStore'
import { loadChatPrompt } from './systemPromptSource'

let db: DiaryDB
let diary: DexieDiaryRepository
let memories: DexieMemoryRepository
let summaries: DexieSummaryRepository
const moodLabel = (m: number) => `M${m}`

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 20, 10))
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  diary = new DexieDiaryRepository(db)
  memories = new DexieMemoryRepository(db)
  summaries = new DexieSummaryRepository(db)
  await diary.save('2026-09-18', { markdown: 'dua hari lalu', mood: 4 })
  await diary.save('2026-09-20', { markdown: 'hari ini' })
  await diary.save('2026-06-01', { markdown: 'Ujian kalkulus bikin pusing, dosen galak' })
  await diary.save('2026-09-01', { markdown: 'tidak relevan' })
  await memories.add('Punya kucing Mochi', 'auto', 1)
  await summaries.put({ id: 'week:2026-09-07', kind: 'week', periodStart: '2026-09-07', periodEnd: '2026-09-13', text: 'minggu sibuk', entryCount: 1, sourceUpdatedAt: 1, createdAt: 1 })
  await summaries.put({ id: 'week:2026-09-21', kind: 'week', periodStart: '2026-09-21', periodEnd: '2026-09-27', text: 'masa depan', entryCount: 1, sourceUpdatedAt: 1, createdAt: 1 })
})
afterEach(async () => {
  vi.useRealTimers()
  db.close()
  await db.delete()
})

const load = (settings: Settings, latestUserText = 'besok ujian kalkulus lagi, dosen galak') =>
  loadChatPrompt({ diary, memories, summaries, settings, moodLabel, date: '2026-09-20', latestUserText })

test('includes memories, earlier summaries, recent entries and relevant older entries', async () => {
  const { system, context, counts } = await load(defaultSettings('id'))
  expect(counts).toEqual({ memories: 1, summaries: 1, recent: 2, relevant: 1 })
  expect(system).toContain('- Punya kucing Mochi')
  expect(system).toContain('minggu sibuk')
  expect(system).not.toContain('masa depan')
  expect(system).toContain('### 2026-09-18 (mood: M4)\ndua hari lalu')
  expect(system).not.toContain('Ujian kalkulus bikin pusing')
  expect(context).toContain('Ujian kalkulus bikin pusing')
  expect(system + context).not.toContain('tidak relevan')
  expect(system).toContain('Today is 2026-09-20.')
})

test('toggles remove their sections', async () => {
  const noMemory = await load({ ...defaultSettings('id'), aiMemoryEnabled: false })
  expect(noMemory.counts.memories).toBe(0)
  expect(noMemory.system).not.toContain('Punya kucing Mochi')

  const noSummaries = await load({ ...defaultSettings('id'), aiSummariesEnabled: false })
  expect(noSummaries.counts.summaries).toBe(0)

  const noDiary = await load({ ...defaultSettings('id'), aiIncludeDiary: false })
  expect(noDiary.counts).toEqual({ memories: 1, summaries: 0, recent: 0, relevant: 0 })
})

test('no latest user text means no relevant entries', async () => {
  expect((await load(defaultSettings('id'), '')).counts.relevant).toBe(0)
})

test('summaries outside the completed-period window are not sent', async () => {
  const base = { entryCount: 1, sourceUpdatedAt: 1, createdAt: 1 }
  await summaries.put({ ...base, id: 'week:2026-05-04', kind: 'week', periodStart: '2026-05-04', periodEnd: '2026-05-10', text: 'minggu kuno' })
  await summaries.put({ ...base, id: 'month:2026-02', kind: 'month', periodStart: '2026-02-01', periodEnd: '2026-02-28', text: 'februari kuno' })
  await summaries.put({ ...base, id: 'month:2026-08', kind: 'month', periodStart: '2026-08-01', periodEnd: '2026-08-31', text: 'agustus tenang' })
  const { system, counts } = await load(defaultSettings('id'))
  expect(counts.summaries).toBe(2)
  expect(system).toContain('minggu sibuk')
  expect(system).toContain('agustus tenang')
  expect(system).not.toContain('minggu kuno')
  expect(system).not.toContain('februari kuno')
})

test('a past conversation keeps its own diary window and tells the real today', async () => {
  vi.setSystemTime(new Date(2026, 8, 28, 10))
  const { system, counts } = await load(defaultSettings('id'), '')
  expect(counts.recent).toBe(2)
  expect(system).toContain('### 2026-09-18 (mood: M4)\ndua hari lalu')
  expect(system).toContain('This conversation belongs to 2026-09-20. Today is 2026-09-28.')
})

test('system is byte-identical across different latest user texts; only context changes', async () => {
  const a = await load(defaultSettings('id'), 'besok ujian kalkulus lagi, dosen galak')
  const b = await load(defaultSettings('id'), 'halo apa kabar')
  expect(a.system).toBe(b.system)
  expect(a.context).not.toBe('')
  expect(b.context).toBe('')
})
