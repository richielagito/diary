import { parseJsonObject } from './json'

test('parses a bare object', () => {
  expect(parseJsonObject('{"add":["a"]}')).toEqual({ add: ['a'] })
})
test('finds the first object inside prose and code fences', () => {
  expect(parseJsonObject('Berikut hasilnya:\n```json\n{"a": 1, "b": {"c": 2}}\n```\nSelesai.')).toEqual({ a: 1, b: { c: 2 } })
})
test('ignores braces inside strings', () => {
  expect(parseJsonObject('{"text": "pakai {kurung} dan \\"kutip\\""}')).toEqual({ text: 'pakai {kurung} dan "kutip"' })
})
test('skips a stray opening brace before the real object', () => {
  expect(parseJsonObject('Catatan { belum selesai. Jawaban: {"add":["a"]}')).toEqual({ add: ['a'] })
})
test.each(['', 'tidak ada json', '{"a": ', '[1,2]', '{invalid}'])('returns null for %j', (text) => {
  expect(parseJsonObject(text)).toBeNull()
})
