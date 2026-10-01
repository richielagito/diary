import { wordCount } from './wordCount'

describe('wordCount', () => {
  test('empty and whitespace', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('  \n\t ')).toBe(0)
  })
  test('plain words', () => {
    expect(wordCount('Hari ini aku senang sekali')).toBe(5)
  })
  test('strips markdown syntax', () => {
    const md = '# Judul hari\n\n- **satu** item\n1. dua\n- [x] tugas selesai\n> kutipan _miring_\n\n---\n'
    // Judul hari satu item dua tugas selesai kutipan miring
    expect(wordCount(md)).toBe(9)
  })
  test('link counts text only, not url', () => {
    expect(wordCount('baca [artikel bagus](https://example.com/a-b-c) ya')).toBe(4)
  })
  test('fence markers not counted, code words counted', () => {
    expect(wordCount('```ts\nconst x\n```')).toBe(2)
  })
})
