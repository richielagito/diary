import {
  KDF_ITERATIONS,
  OutdatedError,
  WrongPassphraseError,
  blobBytes,
  createKey,
  fromBase64,
  fromBase64Url,
  open,
  openKey,
  recordId,
  seal,
  sha256Base64Url,
  toBase64,
  toBase64Url,
} from './crypto'

const FAST = 100_000
const PASS = 'frasa sandi panjang'

describe('key wrapping', () => {
  it('opens with the right passphrase and rejects a wrong one', async () => {
    const { wrappedKey, keys } = await createKey(PASS, FAST)
    expect(wrappedKey.iterations).toBe(FAST)
    expect(wrappedKey.keyId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(wrappedKey.salt).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(wrappedKey.wrapped).toMatch(/^[A-Za-z0-9_-]{80}$/)

    const again = await openKey(PASS, wrappedKey)
    const id = await recordId(keys, 'entries', '2026-10-01')
    expect(await recordId(again, 'entries', '2026-10-01')).toBe(id)
    const envelope = { v: 1, c: 'entries', k: '2026-10-01', t: 5, d: { a: 1 } }
    expect(await open(again, id, await seal(keys, id, envelope))).toEqual(envelope)

    await expect(openKey('frasa sandi salah', wrappedKey)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('never exposes key material', async () => {
    const { keys } = await createKey(PASS, FAST)
    expect(keys.enc.extractable).toBe(false)
    expect(keys.id.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', keys.enc)).rejects.toThrow()
  })

  it('makes a different key, salt and id every time', async () => {
    const a = await createKey(PASS, FAST)
    const b = await createKey(PASS, FAST)
    expect(a.wrappedKey.keyId).not.toBe(b.wrappedKey.keyId)
    expect(a.wrappedKey.salt).not.toBe(b.wrappedKey.salt)
    expect(await recordId(a.keys, 'entries', 'x')).not.toBe(await recordId(b.keys, 'entries', 'x'))
  })

  it('uses 100,000 iterations by default and refuses unreasonable counts', async () => {
    expect(KDF_ITERATIONS).toBe(100_000)
    const { wrappedKey } = await createKey(PASS, FAST)
    for (const iterations of [1000, 99_999, 10_000_001]) {
      const attempt = openKey(PASS, { ...wrappedKey, iterations })
      await expect(attempt).rejects.toThrow()
      await expect(attempt).rejects.not.toBeInstanceOf(WrongPassphraseError)
    }
  })

  it('treats Unicode-equivalent passphrases as the same', async () => {
    // Written as escapes on purpose (a formatter could unify raw characters): e-acute as one code point, then as "e"
    // followed by a combining accent.
    const { wrappedKey } = await createKey('caf\u00e9 di pagi hari', FAST)
    await expect(openKey('cafe\u0301 di pagi hari', wrappedKey)).resolves.toBeDefined()
  })
})

// IF THIS TEST FAILS, DO NOT "FIX" THE CONSTANTS. They were produced once by this code and stand for the data every
// existing user already has on the server. A failure means that a change to the passphrase normalisation, the key
// derivation (PBKDF2 parameters, HKDF labels), the record id formula (collection + "\n" + key) or the blob layout would
// make existing users' data unreadable. Such a change must not ship without a migration.
describe('format pinned by known answers', () => {
  // Created once with createKey('kata sandi caf\u00e9 \ufb01nal', 100_000): e-acute as one code point, "fi" as a ligature.
  const WRAPPED = {
    keyId: 'JcgSwKwc-KVevdvyFv_F2A',
    salt: 'JAmWMdQ6jfK8o32ujhlLQw',
    wrapped: 'iA8jEM27zz92iHwDcUVgB6FmkS_PLuJPmpe1rVUfPiUe1QzxeEN6bZCgkZMw8AO-1LKY_IkRjABBXk6m',
    iterations: 100_000,
  }
  const RECORD_ID = '-0fOqNkZu2KHZD3GA35Y5Q'
  const BLOB =
    'NeQmPA0G7yKPem4BAW5Mo+NtRTsQ5Q5jox93jNkF6DyzHRLH9rJuba3QN+fYw5PxkMIGzDbMrIGNjvF1o3UGUP4kCLkSF0di4ceUjd1vROIUWib1buNyiA6+auP4FbjBWqDjbovxwathR0BxZwB5A/XlmUQ3QUG7O8hp5ssxCJcXIXT5mWsVJ7vzl6UKkyRucMSj2P6NT1lwPXBDbQ=='
  const ENVELOPE = {
    v: 1,
    c: 'entries',
    k: '2026-10-01',
    t: 1790812800000,
    d: { date: '2026-10-01', markdown: 'hari tenang #self\\_care', mood: 4 },
  }

  it('opens a stored key, derives the same record id and reads a stored blob', async () => {
    // Typed differently from how the key was created: "e" plus a combining accent, still with the ligature. Only NFKC
    // turns both spellings into the same bytes (NFC keeps the ligature, no normalisation keeps the combining accent).
    const keys = await openKey('kata sandi cafe\u0301 \ufb01nal', WRAPPED)
    expect(await recordId(keys, 'entries', '2026-10-01')).toBe(RECORD_ID)
    expect(await open(keys, RECORD_ID, BLOB)).toEqual(ENVELOPE)
  })
})

describe('records', () => {
  it('derives stable opaque ids', async () => {
    const { keys } = await createKey(PASS, FAST)
    const id = await recordId(keys, 'entries', '2026-10-01')
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(id).not.toContain('2026')
    expect(await recordId(keys, 'entries', '2026-10-01')).toBe(id)
    expect(await recordId(keys, 'entries', '2026-10-02')).not.toBe(id)
    expect(await recordId(keys, 'memories', '2026-10-01')).not.toBe(id)
  })

  it('seals to a different blob every time and hides the plaintext', async () => {
    const { keys } = await createKey(PASS, FAST)
    const id = await recordId(keys, 'entries', '2026-10-01')
    const envelope = { v: 1, c: 'entries', k: '2026-10-01', t: 5, d: { markdown: 'rahasia besar' } }
    const one = await seal(keys, id, envelope)
    const two = await seal(keys, id, envelope)
    expect(one).not.toBe(two)
    expect(one).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    expect(new TextDecoder().decode(fromBase64(one))).not.toContain('rahasia')
    expect(await open(keys, id, two)).toEqual(envelope)
  })

  it('fails when the blob is changed or moved to another id', async () => {
    const { keys } = await createKey(PASS, FAST)
    const id = await recordId(keys, 'entries', '2026-10-01')
    const other = await recordId(keys, 'entries', '2026-10-02')
    const blob = await seal(keys, id, { v: 1, c: 'entries', k: '2026-10-01', t: 5, d: null })
    const bytes = fromBase64(blob)
    bytes[bytes.length - 1] ^= 1
    await expect(open(keys, id, toBase64(bytes))).rejects.toThrow()
    await expect(open(keys, other, blob)).rejects.toThrow()
    await expect(open((await createKey(PASS, FAST)).keys, id, blob)).rejects.toThrow()
  })

  it('rejects an envelope written by a newer version', async () => {
    const { keys } = await createKey(PASS, FAST)
    const id = await recordId(keys, 'entries', '2026-10-01')
    const blob = await seal(keys, id, { v: 2, c: 'entries', k: '2026-10-01', t: 5, d: {} })
    await expect(open(keys, id, blob)).rejects.toBeInstanceOf(OutdatedError)
  })
})

describe('encoding', () => {
  it('round-trips base64 of any length', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100_000]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 31) % 256)
      expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes])
      expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes])
      expect(blobBytes(toBase64(bytes))).toBe(n)
    }
    expect(toBase64Url(new Uint8Array([251, 255]))).toBe('-_8')
  })

  it('hashes to base64url', async () => {
    expect(await sha256Base64Url('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
  })
})
