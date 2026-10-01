import type { DayEntry } from '../../domain/types'
import type { Memory } from '../../storage/MemoryRepository'
import type { Summary } from '../../storage/SummaryRepository'
import { buildChatContext, CONTEXT_BUDGET } from './chatContext'

const label = (m: number) => `M${m}`
const entry = (date: string, markdown: string): DayEntry => ({ date, markdown, mood: null, tags: [], wordCount: 0, createdAt: 0, updatedAt: 0 })
const summary = (kind: 'week' | 'month', periodStart: string, text: string): Summary => ({
  id: `${kind}:${periodStart}`,
  kind,
  periodStart,
  periodEnd: periodStart,
  text,
  entryCount: 1,
  sourceUpdatedAt: 0,
  createdAt: 0,
})
const memory = (text: string): Memory => ({ id: text, text, source: 'auto', createdAt: 0, updatedAt: 0 })

test('renders every section and counts', () => {
  const ctx = buildChatContext({
    memories: [memory('Punya kucing Mochi')],
    summaries: [summary('week', '2026-09-14', 'minggu sibuk'), summary('month', '2026-08-01', 'agustus tenang')],
    recent: [entry('2026-09-27', 'kemarin')],
    relevant: [{ entry: entry('2026-05-01', 'dulu'), score: 3 }],
    moodLabel: label,
  })
  expect(ctx.memories).toBe('- Punya kucing Mochi')
  expect(ctx.summaries).toBe('### Month from 2026-08-01\nagustus tenang\n\n### Week from 2026-09-14\nminggu sibuk')
  expect(ctx.recent).toBe('### 2026-09-27\nkemarin')
  expect(ctx.relevant).toBe('### 2026-05-01\ndulu')
  expect(ctx.counts).toEqual({ memories: 1, summaries: 2, recent: 1, relevant: 1 })
})

test('keeps only the 3 latest month and 4 latest week summaries', () => {
  const weeks = ['07-06', '07-13', '07-20', '07-27', '08-03'].map((d) => summary('week', `2026-${d}`, d))
  const months = ['04', '05', '06', '07'].map((m) => summary('month', `2026-${m}-01`, m))
  const ctx = buildChatContext({ memories: [], summaries: [...weeks, ...months], recent: [], relevant: [], moodLabel: label })
  expect(ctx.counts.summaries).toBe(7)
  expect(ctx.summaries).not.toContain('Week from 2026-07-06')
  expect(ctx.summaries).not.toContain('Month from 2026-04-01')
})

test('trims to the budget in the specified order', () => {
  const big = 'x'.repeat(1500)
  const recent = Array.from({ length: 7 }, (_, i) => entry(`2026-09-2${i}`, big))
  const relevant = [3, 2].map((score, i) => ({ entry: entry(`2026-0${5 + i}-01`, big), score }))
  const weeks = Array.from({ length: 4 }, (_, i) => summary('week', `2026-08-0${i + 1}`, 'w'.repeat(2000)))
  const months = Array.from({ length: 3 }, (_, i) => summary('month', `2026-0${4 + i}-01`, 'm'.repeat(2000)))
  const ctx = buildChatContext({ memories: [], summaries: [...weeks, ...months], recent, relevant, moodLabel: label })
  const size = ctx.summaries.length + ctx.recent.length + ctx.relevant.length
  expect(size).toBeLessThanOrEqual(CONTEXT_BUDGET)
  // Relevant entries go first, then the oldest weeks; recent diary stays whole.
  expect(ctx.counts.relevant).toBe(0)
  expect(ctx.counts.recent).toBe(7)
  expect(ctx.summaries).toContain('Week from 2026-08-04')
})

test('an oversized recent entry trims through relevant, weeks, months and recent; counts match rendering', () => {
  const huge = 'x'.repeat(1500)
  const recent = Array.from({ length: 7 }, (_, i) => entry(`2026-09-2${i}`, huge))
  const relevant = [{ entry: entry('2026-05-01', huge), score: 2 }]
  const weeks = Array.from({ length: 4 }, (_, i) => summary('week', `2026-08-0${i + 1}`, 'w'.repeat(5000)))
  const months = Array.from({ length: 3 }, (_, i) => summary('month', `2026-0${4 + i}-01`, 'm'.repeat(5000)))
  const ctx = buildChatContext({ memories: [], summaries: [...weeks, ...months], recent, relevant, moodLabel: label })
  expect(ctx.summaries.length + ctx.recent.length + ctx.relevant.length).toBeLessThanOrEqual(CONTEXT_BUDGET)
  const count = (s: string) => (s.match(/^### /gm) ?? []).length
  expect(ctx.counts.summaries).toBe(count(ctx.summaries))
  expect(ctx.counts.recent).toBe(count(ctx.recent))
  expect(ctx.counts.relevant).toBe(count(ctx.relevant))
  expect(ctx.counts.relevant).toBe(0)
  expect(ctx.counts.summaries).toBeLessThan(7)
})

test('relevant trimming drops lowest score first, ties oldest first, regardless of caller order', () => {
  const big = 'x'.repeat(1500)
  const relevant = [
    { entry: entry('2026-03-01', big), score: 3 },
    { entry: entry('2026-01-01', big), score: 2 },
    { entry: entry('2026-02-01', big), score: 2 },
  ]
  const recent = Array.from({ length: 7 }, (_, i) => entry(`2026-09-2${i}`, big))
  const summaries = [summary('week', '2026-08-01', 'w'.repeat(1900)), summary('month', '2026-06-01', 'm'.repeat(1900))]
  const full = buildChatContext({ memories: [], summaries, recent, relevant, moodLabel: label })
  expect(full.counts.relevant).toBe(3)
  const more = buildChatContext({ memories: [], summaries, recent: [...recent, ...['10', '11', '12', '13'].map((d) => entry(`2026-09-${d}`, big))], relevant, moodLabel: label })
  expect(more.counts.relevant).toBe(2)
  expect(more.relevant).toContain('2026-03-01')
  expect(more.relevant).toContain('2026-02-01')
  expect(more.relevant).not.toContain('2026-01-01')
})

test('memories are never trimmed', () => {
  const memories = Array.from({ length: 100 }, (_, i) => memory(`fakta ${i} ${'z'.repeat(190)}`))
  const ctx = buildChatContext({ memories, summaries: [], recent: [], relevant: [], moodLabel: label })
  expect(ctx.counts.memories).toBe(100)
})
