import type { DayEntry } from '../../domain/types'
import { keywords, pickRelevant } from './relevance'

const e = (date: string, markdown: string): DayEntry => ({ date, markdown, mood: null, tags: [], wordCount: 0, createdAt: 0, updatedAt: 0 })

test('keywords: lowercase, min 4 letters, no stopwords, unescaped', () => {
  expect([...keywords('Aku sedang BELAJAR untuk ujian kalkulus di #self\\_care yang berat banget')].sort()).toEqual([
    'belajar',
    'berat',
    'care',
    'kalkulus',
    'self',
    'ujian',
  ])
})

test('pickRelevant scores by shared keywords, min score, limit, ties by newest', () => {
  const entries = [
    e('2026-06-01', 'Ujian kalkulus bikin pusing'),
    e('2026-07-01', 'Ujian kalkulus lagi, dosen galak'),
    e('2026-05-01', 'Liburan ke pantai'),
    e('2026-04-01', 'Kalkulus saja'),
  ]
  const picked = pickRelevant(entries, 'besok ujian kalkulus, dosen galak banget')
  expect(picked.map((p) => [p.entry.date, p.score])).toEqual([
    ['2026-07-01', 4],
    ['2026-06-01', 2],
  ])
  expect(pickRelevant(entries, 'halo')).toEqual([])
  expect(pickRelevant(entries, 'ujian kalkulus dosen galak', 1)).toHaveLength(1)
})
