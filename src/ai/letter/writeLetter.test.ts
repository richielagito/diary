import { DiaryDB } from '../../storage/db'
import { DexieLetterRepository } from '../../storage/DexieLetterRepository'
import { computeStats } from '../../stats/computeStats'
import { controllable, failWith, replyWith } from '../../test/fakeProvider'
import { DEFAULT_PERSONA } from '../prompt/persona'
import type { AiConfig } from '../provider/types'
import { buildLetterInput, type LetterInput } from './letterInput'
import { cachedLetter, letterFingerprint, writeLetter } from './writeLetter'

const ai: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5-5' }
const stats = computeStats(
  [{ date: '2026-09-01', markdown: 'x', mood: 4, tags: [], wordCount: 3, createdAt: 1, updatedAt: 1 }],
  { kind: 'year', year: 2026 },
  '2026-09-10',
)
const input: LetterInput = buildLetterInput({ stats, language: 'id', persona: DEFAULT_PERSONA, memories: [], summaries: [], memoryEnabled: false, summariesEnabled: false })

let db: DiaryDB
let letters: DexieLetterRepository
beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  letters = new DexieLetterRepository(db)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

const run = (createProvider: ReturnType<typeof replyWith>, signal = new AbortController().signal, i = input) =>
  writeLetter({ input: i, ai, provider: createProvider(ai), letters, signal, now: () => 42 })

test('stores and returns the trimmed letter, then caches as fresh', async () => {
  expect(await run(replyWith(' Halo ', 'kamu\n'))).toBe('Halo kamu')
  expect(await letters.get('2026')).toMatchObject({ periodId: '2026', text: 'Halo kamu', createdAt: 42, fingerprint: letterFingerprint(input, ai) })
  expect(await cachedLetter(letters, input, ai)).toEqual({ text: 'Halo kamu', fresh: true })
})

test('cachedLetter is null without a letter and stale when the input changed', async () => {
  expect(await cachedLetter(letters, input, ai)).toBeNull()
  await run(replyWith('Halo'))
  expect(await cachedLetter(letters, { ...input, daysWritten: input.daysWritten + 1 }, ai)).toEqual({ text: 'Halo', fresh: false })
  expect(await cachedLetter(letters, input, { ...ai, model: 'other' })).toEqual({ text: 'Halo', fresh: false })
})

test('a provider failure rejects and keeps the previous letter', async () => {
  await run(replyWith('Lama'))
  await expect(run(failWith('rateLimit'))).rejects.toMatchObject({ kind: 'rateLimit' })
  expect((await letters.get('2026'))?.text).toBe('Lama')
})

test('abort stores nothing', async () => {
  const c = controllable()
  const ctrl = new AbortController()
  const p = writeLetter({ input, ai, provider: c.createProvider(ai), letters, signal: ctrl.signal })
  c.push('Sebagian')
  ctrl.abort()
  await expect(p).rejects.toMatchObject({ kind: 'aborted' })
  expect(await letters.get('2026')).toBeUndefined()
})

test('abort after completion stores nothing', async () => {
  const ctrl = new AbortController()
  const provider = {
    async *stream() {
      yield 'Selesai'
      ctrl.abort()
    },
  }
  await expect(writeLetter({ input, ai, provider, letters, signal: ctrl.signal })).rejects.toMatchObject({ kind: 'aborted' })
  expect(await letters.get('2026')).toBeUndefined()
})

test('a non-ProviderError abort is mapped to aborted', async () => {
  const ctrl = new AbortController()
  const provider = {
    // eslint-disable-next-line require-yield
    async *stream(): AsyncGenerator<string> {
      ctrl.abort()
      throw new DOMException('x', 'AbortError')
    },
  }
  await expect(writeLetter({ input, ai, provider, letters, signal: ctrl.signal })).rejects.toMatchObject({ kind: 'aborted' })
})

test('a whitespace-only reply is an unknown error and stores nothing', async () => {
  await expect(run(replyWith('  ', '\n'))).rejects.toMatchObject({ kind: 'unknown' })
  expect(await letters.get('2026')).toBeUndefined()
})

test('the fingerprint ignores key order', () => {
  const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(input).reverse()))) as LetterInput
  expect(letterFingerprint(reordered, ai)).toBe(letterFingerprint(input, ai))
  expect(letterFingerprint(input, ai)).toMatch(/^[0-9a-f]{8}$/)
})
