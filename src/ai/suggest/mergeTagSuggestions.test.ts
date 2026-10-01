import { mergeTagSuggestions } from './mergeTagSuggestions'

test('AI tags come first, then local; filtered by prefix, existing and duplicates', () => {
  expect(mergeTagSuggestions('ka', ['kantor', 'keluarga', 'kampus'], ['kampus', 'kafe'], ['kafe'])).toEqual(['kantor', 'kampus'])
})

test('an empty prefix returns the first three unique tags', () => {
  expect(mergeTagSuggestions('', ['a1', 'b1'], ['b1', 'c1', 'd1'], [])).toEqual(['a1', 'b1', 'c1'])
})

test('a tag equal to the prefix is excluded', () => {
  expect(mergeTagSuggestions('kerja', ['kerja', 'kerjaan'], ['kerja'], [])).toEqual(['kerjaan'])
})

test('the prefix match is case-insensitive', () => {
  expect(mergeTagSuggestions('KA', ['kantor'], [], [])).toEqual(['kantor'])
})

test('respects a custom max', () => {
  expect(mergeTagSuggestions('k', ['ka', 'kb', 'kc'], [], [], 2)).toEqual(['ka', 'kb'])
})
