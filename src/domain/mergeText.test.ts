import { MERGE_SEPARATOR, mergeText } from './mergeText'

describe('mergeText', () => {
  it('returns the text when both are equal', () => {
    expect(mergeText('sama', 'sama', 'lama')).toBe('sama')
  })

  it('takes the newer when only the newer changed', () => {
    expect(mergeText('baru', 'awal', 'awal')).toBe('baru')
  })

  it('takes the older when only the older changed', () => {
    expect(mergeText('awal', 'baru', 'awal')).toBe('baru')
  })

  it('takes the older when the newer is blank', () => {
    expect(mergeText('  \n', 'ada isi', 'awal')).toBe('ada isi')
  })

  it('takes the newer when the older is blank', () => {
    expect(mergeText('ada isi', '', 'awal')).toBe('ada isi')
  })

  it('takes the newer when it contains the older', () => {
    expect(mergeText('awal\n\nparagraf baru', 'awal', '')).toBe('awal\n\nparagraf baru')
  })

  it('takes the older when it contains the newer', () => {
    expect(mergeText('awal', 'awal\n\nparagraf baru', '')).toBe('awal\n\nparagraf baru')
  })

  it('treats texts that differ only in Markdown escaping as the same, and returns the newer unchanged', () => {
    expect(mergeText('hari tenang #self_care', 'hari tenang #self\\_care', '')).toBe('hari tenang #self_care')
    expect(mergeText('hari tenang #self\\_care', 'hari tenang #self_care', '')).toBe('hari tenang #self\\_care')
  })

  it('ignores escaping when deciding that only one side changed', () => {
    expect(mergeText('a #x\\_y', 'a #x_y lalu tambah', 'a #x_y')).toBe('a #x_y lalu tambah')
    expect(mergeText('a #x_y lalu tambah', 'a #x\\_y', 'a #x_y')).toBe('a #x_y lalu tambah')
  })

  it('keeps an edit that only changes the escaping when the other side left the text alone', () => {
    expect(mergeText('\\*penting\\*', '*penting*', '\\*penting\\*')).toBe('*penting*')
    expect(mergeText('*penting*', '\\*penting\\*', '\\*penting\\*')).toBe('*penting*')
    expect(mergeText('awal', 'awal\n', 'awal')).toBe('awal\n')
  })

  it('stacks a short note that only appears inside a word of the other text', () => {
    expect(mergeText('ok', 'tadi ke toko buku', '')).toBe(`ok${MERGE_SEPARATOR}tadi ke toko buku`)
    expect(mergeText('tadi ke toko buku', 'ok', '')).toBe(`tadi ke toko buku${MERGE_SEPARATOR}ok`)
  })

  it('takes the fuller text when the other is the start of it, even mid-line', () => {
    expect(mergeText('awal lalu lanjut', 'awal', '')).toBe('awal lalu lanjut')
    expect(mergeText('awal', 'awal lalu lanjut', '')).toBe('awal lalu lanjut')
  })

  it('takes the fuller text when the other is a whole paragraph of it', () => {
    expect(mergeText('satu\n\ndua\n\ntiga', 'dua', '')).toBe('satu\n\ndua\n\ntiga')
    expect(mergeText('dua\n\ntiga', 'satu\n\ndua\n\ntiga\n\nempat', '')).toBe('satu\n\ndua\n\ntiga\n\nempat')
  })

  it('returns the original of the fuller text when containment only holds without the escaping', () => {
    expect(mergeText('hari #self\\_care\n\ntambahan', 'hari #self_care', '')).toBe('hari #self\\_care\n\ntambahan')
  })

  it('stacks unrelated texts, trimming only newlines at the separator', () => {
    expect(mergeText('versi hp\n\n', '\n\nversi laptop', 'awal')).toBe(`versi hp${MERGE_SEPARATOR}versi laptop`)
    expect(mergeText('  hp', 'laptop  ', 'awal')).toBe(`  hp${MERGE_SEPARATOR}laptop  `)
  })
})
