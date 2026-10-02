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

  it('uses 600,000 iterations by default and refuses unreasonable counts', async () => {
    expect(KDF_ITERATIONS).toBe(600_000)
    const { wrappedKey } = await createKey(PASS, FAST)
    for (const iterations of [1000, 99_999, 10_000_001]) {
      const attempt = openKey(PASS, { ...wrappedKey, iterations })
      await expect(attempt).rejects.toThrow()
      await expect(attempt).rejects.not.toBeInstanceOf(WrongPassphraseError)
    }
  })

  it('treats Unicode-equivalent passphrases as the same', async () => {
    const { wrappedKey } = await createKey('café di pagi hari', FAST)
    await expect(openKey('café di pagi hari', wrappedKey)).resolves.toBeDefined()
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
