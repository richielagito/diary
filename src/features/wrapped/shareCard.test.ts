import type { DayEntry, Mood } from '../../domain/types'
import { computeStats, type HeatCell } from '../../stats/computeStats'
import { drawShareCard, drawHeatmap, type Ctx2D, type ShareCardData, type SharePalette } from './shareCard'

const palette: SharePalette = {
  bg: '#fff',
  surface: '#eee',
  text: '#000',
  muted: '#666',
  border: '#ccc',
  mood: { 1: '#1', 2: '#2', 3: '#3', 4: '#4', 5: '#5', none: '#0' },
}

/** Context palsu: mencatat pemanggilan method dan penulisan properti ('set:<nama>'). `own` menimpa anggota tertentu. */
function fakeCtx(own: Record<string, unknown> = {}) {
  const calls: [string, unknown[]][] = []
  const target: Record<string, unknown> = { ...own }
  const ctx = new Proxy(target, {
    get: (t, name: string) => (name in t ? t[name] : (...args: unknown[]) => void calls.push([name, args])),
    set: (t, name: string, v) => {
      t[name] = v
      calls.push([`set:${name}`, [v]])
      return true
    },
  }) as unknown as Ctx2D
  return { ctx, calls }
}

const base = { tags: [], wordCount: 10, createdAt: 0, updatedAt: 0 }
const entries: DayEntry[] = [
  { ...base, date: '2026-10-01', markdown: 'RAHASIA-123 #olahraga', mood: 5, tags: ['olahraga'] },
  { ...base, date: '2026-10-02', markdown: 'lari #olahraga', mood: 4, tags: ['olahraga'] },
  { ...base, date: '2026-10-05', markdown: 'halo', mood: null },
]

function dataFor(): ShareCardData {
  const stats = computeStats(entries, { kind: 'year', year: 2026 }, '2026-10-10')
  return {
    periodLabel: '2026',
    subtitle: '(sejauh ini)',
    stats: [
      { label: 'Hari menulis', value: '3' },
      { label: 'Kata', value: '1.234' },
      { label: 'Streak terpanjang', value: '2 hari' },
    ],
    distribution: stats.mood.distribution as Record<Mood, number>,
    heatmap: stats.heatmap,
    weeks: stats.weeks,
    topTags: ['olahraga'],
    appName: 'Diary',
  }
}

test('draws label and stat values, never diary text', () => {
  const { ctx, calls } = fakeCtx()
  drawShareCard(ctx, dataFor(), palette)
  const texts = calls.filter(([n]) => n === 'fillText').map(([, a]) => String(a[0]))
  expect(texts).toContain('2026')
  expect(texts).toContain('1.234')
  expect(texts).toContain('#olahraga')
  expect(texts.join('|')).not.toContain('RAHASIA-123')
})

test('the heatmap draws one rect per in-range cell', () => {
  const data = dataFor()
  const { ctx, calls } = fakeCtx()
  const n = drawHeatmap(ctx, data, palette, 80, 1200, 920)
  const inRange = data.heatmap.filter((c) => c.inRange).length
  expect(n).toBe(inRange)
  expect(calls.filter(([name]) => name === 'roundRect')).toHaveLength(inRange)
})

test('the tag line is clamped to the content width', () => {
  const { ctx, calls } = fakeCtx()
  drawShareCard(ctx, { ...dataFor(), topTags: ['satu', 'dua', 'tiga'] }, palette)
  const tags = calls.find(([n, a]) => n === 'fillText' && String(a[0]).startsWith('#satu'))!
  expect(tags[1]).toEqual(['#satu  #dua  #tiga', 80, 1840, 920])
  // Teks lain tetap tanpa maxWidth
  const label = calls.find(([n, a]) => n === 'fillText' && a[0] === '2026')!
  expect(label[1]).toHaveLength(3)
})

test('falls back to rect where roundRect is missing', () => {
  const data = dataFor()
  const { ctx, calls } = fakeCtx({ roundRect: undefined })
  expect(() => drawShareCard(ctx, data, palette)).not.toThrow()
  const bars = Object.values(data.distribution).filter((n) => n > 0).length
  expect(calls.filter(([n]) => n === 'rect')).toHaveLength(data.heatmap.filter((c) => c.inRange).length + bars)
})

test('word levels use the same opacity as the on-screen heatmap', () => {
  const cell = (day: number, level: 1 | 2 | 3 | 4): HeatCell => ({
    date: `2026-10-0${day}`,
    inRange: true,
    future: false,
    entry: { mood: 4, words: 1, level },
  })
  const data = { ...dataFor(), heatmap: [cell(1, 1), cell(2, 2), cell(3, 3), cell(4, 4)], weeks: 1 }
  const { ctx, calls } = fakeCtx()
  drawHeatmap(ctx, data, palette, 0, 0, 920)
  const alphas = calls.filter(([n]) => n === 'set:globalAlpha').map(([, a]) => a[0])
  // Tiap sel: alpha level, lalu kembali ke 1
  expect(alphas).toEqual([0.5, 1, 0.68, 1, 0.84, 1, 1, 1])
})
