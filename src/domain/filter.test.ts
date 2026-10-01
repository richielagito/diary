import { excerpt, searchEntries } from './filter'
import type { DayEntry } from './types'

const e = (date: string, markdown: string, tags: string[] = []): DayEntry => ({
  date,
  markdown,
  tags,
  mood: null,
  wordCount: 0,
  createdAt: 0,
  updatedAt: 0,
})
const entries = [
  e('2026-09-01', 'Ujian Kalkulus #kuliah', ['kuliah']),
  e('2026-09-03', 'Lari pagi #olahraga', ['olahraga']),
  e('2026-09-02', 'Tugas kuliah menumpuk'),
]

test('empty query returns nothing', () => {
  expect(searchEntries(entries, '   ')).toEqual([])
})
test('text search is case-insensitive, newest first', () => {
  expect(searchEntries(entries, 'KULIAH').map((x) => x.date)).toEqual(['2026-09-02', '2026-09-01'])
})
test('#tag matches tags exactly, not text', () => {
  expect(searchEntries(entries, '#kuliah').map((x) => x.date)).toEqual(['2026-09-01'])
  expect(searchEntries(entries, '#kul')).toEqual([])
})
test('all tokens must match', () => {
  expect(searchEntries(entries, '#kuliah ujian').map((x) => x.date)).toEqual(['2026-09-01'])
  expect(searchEntries(entries, '#kuliah lari')).toEqual([])
})
test('excerpt flattens and truncates', () => {
  expect(excerpt('# Judul\n\nisi **tebal**', 120)).toBe('Judul isi tebal')
  expect(excerpt('a'.repeat(200), 10)).toBe('aaaaaaaaaa…')
})
test('text search unescapes backslash-escaped markdown before matching', () => {
  const escaped = [e('2026-09-05', 'rutin self\\_care pagi')]
  expect(searchEntries(escaped, 'self_care').map((x) => x.date)).toEqual(['2026-09-05'])
})
test('excerpt unescapes backslash-escaped markdown', () => {
  const result = excerpt('self\\_care \\*penting\\*')
  expect(result).toContain('self_care')
  expect(result).toContain('*penting*')
  expect(result).not.toContain('\\')
})
test('excerpt keeps one literal backslash from an escaped pair, and still strips a real delimiter that follows it', () => {
  // Stored string: "C:" + an escaped literal backslash (`\\`, i.e. two backslash chars) + real unescaped *tebal*.
  expect(excerpt('C:\\\\*tebal*')).toBe('C:\\tebal')
})
