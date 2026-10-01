import { parseEntry, serializeEntry } from './frontmatter'
import type { EntryInput } from './types'

const NOW = Date.parse('2026-10-01T00:00:00Z')
const entry: EntryInput = {
  date: '2026-09-27',
  markdown: 'Isi diary #kuliah\n\n---\n\nbagian dua',
  mood: 4,
  createdAt: Date.parse('2026-09-27T01:12:00Z'),
  updatedAt: Date.parse('2026-09-27T14:40:00Z'),
}

test('serialize produces frontmatter then body', () => {
  expect(serializeEntry(entry)).toBe(
    '---\ndate: 2026-09-27\nmood: 4\ncreated: 2026-09-27T08:12:00+07:00\nupdated: 2026-09-27T21:40:00+07:00\n---\n' +
      'Isi diary #kuliah\n\n---\n\nbagian dua\n',
  )
})

test('null mood serialized as null', () => {
  expect(serializeEntry({ ...entry, mood: null })).toContain('\nmood: null\n')
})

test('round trip keeps entry identical (body with horizontal rule)', () => {
  const r = parseEntry('entries/2026/2026-09-27.md', serializeEntry(entry), NOW)
  expect(r).toEqual({ ok: true, entry })
})

test('handles CRLF and BOM', () => {
  const text = '\uFEFF' + serializeEntry(entry).replace(/\n/g, '\r\n')
  const r = parseEntry('2026-09-27.md', text, NOW)
  expect(r).toEqual({ ok: true, entry })
})

test('no frontmatter: date from file name, mood null, timestamps = now', () => {
  expect(parseEntry('2026-09-27.md', 'cuma teks', NOW)).toEqual({
    ok: true,
    entry: { date: '2026-09-27', markdown: 'cuma teks', mood: null, createdAt: NOW, updatedAt: NOW },
  })
})

test('unclosed frontmatter rejected', () => {
  const r = parseEntry('2026-09-27.md', '---\nbukan frontmatter', NOW)
  expect(r).toEqual({ ok: false, fileName: '2026-09-27.md', reason: 'badFrontmatter' })
})

test('impossible date rejected', () => {
  expect(parseEntry('2026-02-30.md', 'x', NOW)).toEqual({ ok: false, fileName: '2026-02-30.md', reason: 'invalidDate' })
})

test('non-date file name without frontmatter rejected', () => {
  expect(parseEntry('catatan.md', 'x', NOW)).toMatchObject({ ok: false, reason: 'invalidDate' })
})

test('mood out of range rejected', () => {
  const text = '---\ndate: 2026-09-27\nmood: 9\n---\nx'
  expect(parseEntry('2026-09-27.md', text, NOW)).toMatchObject({ ok: false, reason: 'invalidMood' })
})

test('empty body and null mood rejected as empty', () => {
  expect(parseEntry('2026-09-27.md', '---\ndate: 2026-09-27\nmood: null\n---\n  \n', NOW)).toMatchObject({
    ok: false,
    reason: 'empty',
  })
})

test('mood-only entry accepted', () => {
  const r = parseEntry('2026-09-27.md', '---\ndate: 2026-09-27\nmood: 2\n---\n', NOW)
  expect(r).toMatchObject({ ok: true, entry: { markdown: '', mood: 2 } })
})

test('unparseable timestamps fall back to now', () => {
  const r = parseEntry('2026-09-27.md', '---\ndate: 2026-09-27\ncreated: kemarin\n---\nx', NOW)
  expect(r).toMatchObject({ ok: true, entry: { createdAt: NOW, updatedAt: NOW } })
})
