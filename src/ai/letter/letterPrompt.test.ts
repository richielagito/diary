import type { DayEntry, Mood } from '../../domain/types'
import type { Memory } from '../../storage/MemoryRepository'
import type { Summary } from '../../storage/SummaryRepository'
import { computeStats } from '../../stats/computeStats'
import { DEFAULT_PERSONA } from '../prompt/persona'
import { buildLetterInput } from './letterInput'
import { buildLetterSystemPrompt, buildLetterUserPrompt } from './letterPrompt'

const SECRET = 'RAHASIA-123'
const entry = (date: string, mood: Mood | null, tags: string[] = []): DayEntry => ({
  date,
  markdown: `# ${SECRET}\nhari ini ${SECRET} #${tags[0] ?? 'x'}`,
  mood,
  tags,
  wordCount: 10,
  createdAt: 1,
  updatedAt: 1,
})
const entries = [entry('2026-09-01', 4, ['kerja']), entry('2026-09-02', 2, ['kerja']), entry('2026-09-03', 5, ['lari'])]
const stats = computeStats(entries, { kind: 'month', year: 2026, month: 9 }, '2026-09-10')
const memory = (text: string): Memory => ({ id: text, text, source: 'auto', createdAt: 1, updatedAt: 1 })
const summary = (id: string, kind: Summary['kind'], periodStart: string, text: string): Summary => ({
  id,
  kind,
  periodStart,
  periodEnd: periodStart,
  text,
  entryCount: 1,
  sourceUpdatedAt: 1,
  createdAt: 1,
})
const base = {
  stats,
  language: 'id' as const,
  persona: DEFAULT_PERSONA,
  memories: [memory('Punya kucing Mochi')],
  summaries: [summary('month:2026-09', 'month', '2026-09-01', 'Bulan yang sibuk')],
  memoryEnabled: true,
  summariesEnabled: true,
}
const both = (input: ReturnType<typeof buildLetterInput>) => buildLetterSystemPrompt(input) + '\n' + buildLetterUserPrompt(input)

test('the input never carries entry markdown', () => {
  const text = both(buildLetterInput(base))
  expect(text).not.toContain(SECRET)
  expect(JSON.stringify(buildLetterInput(base))).not.toContain(SECRET)
})

test('input carries stats, rounded values and period info', () => {
  const input = buildLetterInput(base)
  expect(input).toMatchObject({ periodId: '2026-09', kind: 'month', isCurrent: true, daysWritten: 3, elapsedDays: 10, totalWords: 30 })
  expect(input.mood.average).toBeCloseTo(3.67, 5)
  expect(input.tags.top[0]).toEqual({ tag: 'kerja', days: 2 })
})

test('memoryEnabled false drops memories, summariesEnabled false drops summaries', () => {
  const on = both(buildLetterInput(base))
  expect(on).toContain('Punya kucing Mochi')
  expect(on).toContain('Bulan yang sibuk')
  const off = buildLetterInput({ ...base, memoryEnabled: false, summariesEnabled: false })
  expect(off.memories).toEqual([])
  expect(off.summaries).toEqual([])
  const text = both(off)
  expect(text).not.toContain('Punya kucing Mochi')
  expect(text).not.toContain('Bulan yang sibuk')
  expect(text).not.toContain('Memories:')
  expect(text).not.toContain('Monthly summaries:')
})

test('week summaries and month summaries outside the period are excluded', () => {
  const input = buildLetterInput({
    ...base,
    summaries: [
      summary('week:2026-09-07', 'week', '2026-09-07', 'Minggu ini'),
      summary('month:2026-08', 'month', '2026-08-01', 'Agustus lalu'),
      summary('month:2026-09', 'month', '2026-09-01', 'September ini'),
    ],
  })
  expect(input.summaries).toEqual([{ label: 'September', text: 'September ini' }])
})

test('year period keeps month summaries in order', () => {
  const yearStats = computeStats(entries, { kind: 'year', year: 2026 }, '2026-09-10')
  const input = buildLetterInput({
    ...base,
    stats: yearStats,
    summaries: [
      summary('month:2026-09', 'month', '2026-09-01', 'B'),
      summary('month:2026-03', 'month', '2026-03-01', 'A'),
      summary('month:2025-12', 'month', '2025-12-01', 'lama'),
    ],
  })
  expect(input.summaries.map((s) => s.text)).toEqual(['A', 'B'])
})

test('system prompt names the persona and language', () => {
  const id = buildLetterSystemPrompt(buildLetterInput({ ...base, persona: { style: 'gaul', name: 'Mochi', customInstruction: 'panggil aku kak' } }))
  expect(id).toContain('You are Mochi')
  expect(id).toContain('panggil aku kak')
  expect(id).toContain('Write in Indonesian')
  const en = buildLetterSystemPrompt(buildLetterInput({ ...base, language: 'en' }))
  expect(en).toContain('Write in English')
})
