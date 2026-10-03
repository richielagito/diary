import { formatRecoveryKey, generateRecoveryKey, normalizeRecoveryKey } from './recoveryKey'

describe('recovery key', () => {
  it('is 24 characters from an alphabet without look-alike letters, in groups of four', () => {
    const key = generateRecoveryKey()
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/)
  })

  it('is different every time', () => {
    const keys = new Set(Array.from({ length: 50 }, generateRecoveryKey))
    expect(keys.size).toBe(50)
  })

  it('reads back the same however it was pasted or typed', () => {
    const key = generateRecoveryKey()
    const plain = key.replace(/-/g, '')
    expect(normalizeRecoveryKey(key)).toBe(plain)
    expect(normalizeRecoveryKey(` ${key.toLowerCase().replace(/-/g, ' ')}\n`)).toBe(plain)
    expect(normalizeRecoveryKey('o0-il1')).toBe('00111')
  })

  it('formats a normalised key in groups of four', () => {
    expect(formatRecoveryKey('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN')
  })
})
