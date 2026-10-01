import { extractTags } from './tags'

describe('extractTags', () => {
  test('finds inline tags, lowercased, unique, sorted', () => {
    expect(extractTags('Hari ini #Kuliah lalu #olahraga dan #kuliah lagi')).toEqual(['kuliah', 'olahraga'])
  })
  test('headings are not tags', () => {
    expect(extractTags('# Judul\n## Sub judul\n### Tiga')).toEqual([])
  })
  test('tag at line start without space is a tag', () => {
    expect(extractTags('#mood-baik\nisi')).toEqual(['mood-baik'])
  })
  test('ignores inline code and fenced code', () => {
    expect(extractTags('pakai `#notatag` dan\n```\n#juga-bukan\n```\n#iya')).toEqual(['iya'])
  })
  test('ignores URL anchors and html entities', () => {
    expect(extractTags('lihat https://x.com/page#bagian dan &#123; ok')).toEqual([])
  })
  test('pure numbers are not tags', () => {
    expect(extractTags('issue #123 selesai')).toEqual([])
  })
  test('unicode letters, underscore and dash allowed', () => {
    expect(extractTags('#café #ōsaka #self_care #a-b')).toEqual(['a-b', 'café', 'self_care', 'ōsaka'])
  })
  test('tag after punctuation', () => {
    expect(extractTags('(#libur), #kerja.')).toEqual(['kerja', 'libur'])
  })
  test('unescapes markdown escapes inside a tag body', () => {
    expect(extractTags('hari ini #kuliah dan #self\\_care')).toEqual(['kuliah', 'self_care'])
  })
  test('escaped hash at line start is still a tag', () => {
    expect(extractTags('\\#kuliah di awal baris')).toEqual(['kuliah'])
  })
})
