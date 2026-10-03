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

  it('stacks unrelated texts with no shared base, trimming only newlines at the separator', () => {
    expect(mergeText('versi hp\n\n', '\n\nversi laptop', '')).toBe(`versi hp${MERGE_SEPARATOR}versi laptop`)
    expect(mergeText('  hp', 'laptop  ', '')).toBe(`  hp${MERGE_SEPARATOR}laptop  `)
  })

  describe('with a shared base', () => {
    const P1 = 'Hari ini aku bangun agak siang.'
    const P2 = 'Sore harinya aku jalan kaki.'
    const base = `${P1}\n\n${P2}`

    it('keeps the shared text once and both additions, newer first, with no marker', () => {
      const hp = `${base}\n\nHari ini seru banget.`
      const laptop = `${base}\n\nHari ini sangat sedih.`
      expect(mergeText(hp, laptop, base)).toBe(`${base}\n\nHari ini seru banget.\n\nHari ini sangat sedih.`)
    })

    it('applies changes made in different places on each side', () => {
      const hp = `${P1} Kopinya enak.\n\n${P2}`
      const laptop = `${base}\n\nMalamnya hujan.`
      expect(mergeText(hp, laptop, base)).toBe(`${P1} Kopinya enak.\n\n${P2}\n\nMalamnya hujan.`)
    })

    it('honours a deletion on one side when the other side changed something else', () => {
      const hp = `${P1}\n\n${P2}\n\nTambahan.`
      const laptop = P1
      expect(mergeText(hp, laptop, base)).toBe(`${P1}\n\nTambahan.`)
    })

    it('keeps an edit of a line the other side deleted', () => {
      const hp = `${P1}\n\n${P2} Lalu pulang.`
      const laptop = `${P1}\n\nBaris lain.`
      expect(mergeText(hp, laptop, `${base}\n\nBaris lain lama.`)).toBe(`${P1}\n\n${P2} Lalu pulang.\n\nBaris lain.`)
    })

    it('adds a paragraph from one side after a line the other side edited', () => {
      expect(mergeText('awal kalimat laptop', 'awal\n\nparagraf hp', 'awal')).toBe('awal kalimat laptop\n\nparagraf hp')
      expect(mergeText('awal\n\nparagraf hp', 'awal kalimat laptop', 'awal')).toBe('awal kalimat laptop\n\nparagraf hp')
      expect(mergeText('pembuka\n\nawal', 'awal diubah', 'awal')).toBe('pembuka\n\nawal diubah')
    })

    it('keeps both versions of a line changed differently on each side, newer first', () => {
      expect(mergeText(`${P1}\n\nversi hp`, `${P1}\n\nversi laptop`, base)).toBe(`${P1}\n\nversi hp\n\nversi laptop`)
    })

    it('takes the fuller version of a line when one side only typed further', () => {
      expect(mergeText(`${P1}\n\nawal lalu lanjut`, `${P1}\n\nawal lalu`, `${P1}\n\nawal`)).toBe(`${P1}\n\nawal lalu lanjut`)
    })

    it('keeps the indentation of the older text', () => {
      expect(mergeText('baru\n\n', '\n    kode menjorok', 'awal')).toBe('baru\n\n    kode menjorok')
    })

    it('treats lines that differ only in escaping as the same line', () => {
      const hp = `#self\\_care\n\n${P2}\n\nhp`
      const laptop = `#self_care\n\n${P2}`
      expect(mergeText(hp, laptop, `#self_care\n\n${P2}`)).toBe(hp)
    })

    it('gives the same text when the merged result is merged again', () => {
      const merged = mergeText(`${base}\n\nhp`, `${base}\n\nlaptop`, base)
      expect(mergeText(merged, merged, `${base}\n\nlaptop`)).toBe(merged)
      expect(mergeText(merged, `${base}\n\nlaptop`, `${base}\n\nlaptop`)).toBe(merged)
    })
  })
})
