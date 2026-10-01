import type { DayEntry } from '../../domain/types'
import { buildDiaryContext, diaryContextRange, ENTRY_CHAR_LIMIT } from './diaryContext'

const entry = (date: string, markdown: string, mood: DayEntry['mood'] = null): DayEntry => ({
  date,
  markdown,
  mood,
  tags: [],
  wordCount: 0,
  createdAt: 0,
  updatedAt: 0,
})
const label = (m: number) => `mood${m}`

test('range covers 7 days including today', () => {
  expect(diaryContextRange('2026-09-28')).toEqual({ from: '2026-09-22', to: '2026-09-28' })
  expect(diaryContextRange('2026-03-03')).toEqual({ from: '2026-02-25', to: '2026-03-03' })
})

test('entries sorted oldest first with date and mood headings', () => {
  const out = buildDiaryContext([entry('2026-09-27', 'kemarin', 4), entry('2026-09-26', 'lusa')], label)
  expect(out).toBe('### 2026-09-26\nlusa\n\n### 2026-09-27 (mood: mood4)\nkemarin')
})

test('markdown escapes are removed', () => {
  expect(buildDiaryContext([entry('2026-09-27', 'rutin #self\\_care')], label)).toContain('#self_care')
})

test('long entries are truncated with an ellipsis', () => {
  const out = buildDiaryContext([entry('2026-09-27', 'a'.repeat(ENTRY_CHAR_LIMIT + 50))], label)
  expect(out).toBe(`### 2026-09-27\n${'a'.repeat(ENTRY_CHAR_LIMIT)}…`)
})

test('custom char limit', () => {
  expect(buildDiaryContext([entry('2026-09-27', 'abcdef')], label, 3)).toBe('### 2026-09-27\nabc…')
})

test('mood-only entry has heading only; empty list is empty string', () => {
  expect(buildDiaryContext([entry('2026-09-27', '', 2)], label)).toBe('### 2026-09-27 (mood: mood2)')
  expect(buildDiaryContext([], label)).toBe('')
})
