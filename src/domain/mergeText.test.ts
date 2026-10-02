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

  it('stacks unrelated texts, trimming only newlines at the separator', () => {
    expect(mergeText('versi hp\n\n', '\n\nversi laptop', 'awal')).toBe(`versi hp${MERGE_SEPARATOR}versi laptop`)
    expect(mergeText('  hp', 'laptop  ', 'awal')).toBe(`  hp${MERGE_SEPARATOR}laptop  `)
  })
})
