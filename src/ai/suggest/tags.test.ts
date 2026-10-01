import { extractTags } from '../../domain/tags'
import { sanitizeTags, topTags } from './tags'

test('every sanitized tag round-trips through extractTags', () => {
  const tags = sanitizeTags(['#Kerja', 'sekolah_2', 'a-b', 'Été'], [])
  expect(tags.length).toBeGreaterThan(0)
  for (const t of tags) expect(extractTags('#' + t)).toEqual([t])
})

test('sanitizeTags cleans, dedupes, drops existing and caps at three', () => {
  expect(sanitizeTags(['#Kerja', 'kerja', 'keluarga', '123', 'a b', 'x'.repeat(31), 5, 'olahraga', 'musik'], ['keluarga'])).toEqual([
    'kerja',
    'olahraga',
    'musik',
  ])
})

test('sanitizeTags honours a custom max', () => {
  expect(sanitizeTags(['a1', 'b1', 'c1', 'd1', 'e1', 'f1'], [], 5)).toEqual(['a1', 'b1', 'c1', 'd1', 'e1'])
})

test('sanitizeTags returns [] for non-array input', () => {
  expect(sanitizeTags('kerja', [])).toEqual([])
  expect(sanitizeTags(null, [])).toEqual([])
  expect(sanitizeTags({ a: 1 }, [])).toEqual([])
})

test('topTags orders by count then alphabetically and respects the limit', () => {
  const entries = [{ tags: ['b', 'a'] }, { tags: ['b', 'c'] }, { tags: ['c', 'd'] }, { tags: ['b'] }]
  expect(topTags(entries)).toEqual(['b', 'c', 'a', 'd'])
  expect(topTags(entries, 2)).toEqual(['b', 'c'])
})
