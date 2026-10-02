import { createKey, sha256Base64Url } from '../sync/crypto'
import { FakeServer } from '../sync/testing/fakeServer'
import { ApiError, EMAIL_CODE_LENGTH, NetworkError, createApi } from './api'

const EMAIL = 'a@example.com'
const blob = (text: string) => btoa(text)

async function signedIn(server = new FakeServer()) {
  const api = createApi(server.origin, server.fetch)
  await api.emailStart(EMAIL, 'id')
  const token = await api.emailVerify(EMAIL, server.lastCode(EMAIL))
  return { server, api, token }
}

async function withKey() {
  const s = await signedIn()
  const { wrappedKey } = await createKey('frasa sandi panjang', 100_000)
  await s.api.putKey(s.token, wrappedKey, false)
  return { ...s, wrappedKey, keyId: wrappedKey.keyId }
}

describe('timeouts', () => {
  it('passes an abort signal to fetch', async () => {
    if (typeof AbortSignal.timeout !== 'function') return
    const seen: RequestInit[] = []
    const api = createApi('https://api.test', async (_input, init) => {
      seen.push(init!)
      return new Response(null, { status: 204 })
    })
    await api.logout('tok')
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal)
  })

  it('turns a timed out request into a NetworkError', async () => {
    const api = createApi('https://api.test', async () => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    await expect(api.account('tok')).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('requests', () => {
  it('sends JSON with a content type, and the token as a bearer header', async () => {
    const seen: { url: string; init: RequestInit }[] = []
    const api = createApi('https://api.test/', async (input, init) => {
      seen.push({ url: String(input), init: init! })
      return new Response(JSON.stringify({ applied: [], conflicts: [] }), { status: 200 })
    })
    await api.push('tok', 'key-1', [{ id: 'a', blob: 'AAAA', prevRev: 0 }])
    expect(seen[0]!.url).toBe('https://api.test/sync')
    expect(seen[0]!.init.method).toBe('POST')
    const headers = new Headers(seen[0]!.init.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(JSON.parse(seen[0]!.init.body as string)).toEqual({ keyId: 'key-1', records: [{ id: 'a', blob: 'AAAA', prevRev: 0 }] })
  })

  it('sends no body and no content type on a GET', async () => {
    const seen: RequestInit[] = []
    const api = createApi('https://api.test', async (_input, init) => {
      seen.push(init!)
      return new Response(JSON.stringify({ keyId: null, records: [], rev: 0, more: false }), { status: 200 })
    })
    await api.pull('tok', 12)
    expect(seen[0]!.body).toBeUndefined()
    expect(new Headers(seen[0]!.headers).has('Content-Type')).toBe(false)
  })

  it('builds the Google start URL', () => {
    const api = createApi('https://api.test')
    const url = new URL(api.googleStartUrl('https://app.test', 'c'.repeat(43)))
    expect(url.origin + url.pathname).toBe('https://api.test/auth/google/start')
    expect(url.searchParams.get('return')).toBe('https://app.test')
    expect(url.searchParams.get('challenge')).toBe('c'.repeat(43))
  })

  it('turns server errors into ApiError and a dropped connection into NetworkError', async () => {
    const { server, api, token } = await signedIn()
    await expect(api.emailVerify(EMAIL, '000000')).rejects.toMatchObject({ status: 400, code: 'invalid_code' })
    await expect(api.account('nope')).rejects.toBeInstanceOf(ApiError)
    server.failNext(503, 'internal')
    await expect(api.account(token)).rejects.toMatchObject({ status: 503, code: 'internal' })

    const html = createApi('https://api.test', async () => new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(html.account('t')).rejects.toMatchObject({ status: 502, code: 'unknown' })

    server.offline = true
    await expect(api.account(token)).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('answers of the wrong shape', () => {
  const answering = (body: unknown, status = 200) =>
    createApi('https://api.test', async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
  const bad = { status: 502, code: 'bad_response' }
  const key = { keyId: 'k', salt: 's', wrapped: 'w', iterations: 600_000 }
  const account = { email: EMAIL, plan: 'premium', key, usage: { bytes: 1, limit: 2 } }
  const pull = { keyId: 'k', records: [{ id: 'a', blob: 'AAAA', rev: 1 }], rev: 1, more: false }
  const push = { applied: [{ id: 'a', rev: 1 }], conflicts: ['b'] }

  it('accepts well-formed answers', async () => {
    expect(await answering({ token: 't' }).emailVerify(EMAIL, '123456')).toBe('t')
    expect(await answering({ token: 't' }).exchange('code', 'verifier')).toBe('t')
    expect(await answering(account).account('t')).toEqual(account)
    expect(await answering({ ...account, key: null }).account('t')).toMatchObject({ key: null })
    expect(await answering(pull).pull('t', 0)).toEqual(pull)
    expect(await answering({ ...pull, keyId: null, records: [], rev: 0 }).pull('t', 0)).toMatchObject({ keyId: null, rev: 0 })
    expect(await answering(push).push('t', 'k', [])).toEqual(push)
  })

  it('refuses a sign-in answer without a usable token', async () => {
    for (const body of [{}, { token: '' }, { token: 5 }, null, []]) {
      await expect(answering(body).emailVerify(EMAIL, '123456')).rejects.toMatchObject(bad)
      await expect(answering(body).exchange('code', 'verifier')).rejects.toMatchObject(bad)
    }
  })

  it('refuses a malformed account answer', async () => {
    const wrong = [
      {},
      { ...account, email: undefined },
      { ...account, plan: 1 },
      { ...account, key: undefined },
      { ...account, key: 'k' },
      { ...account, key: { ...key, keyId: 1 } },
      { ...account, key: { ...key, salt: undefined } },
      { ...account, key: { ...key, wrapped: null } },
      { ...account, key: { ...key, iterations: '600000' } },
      { ...account, usage: undefined },
      { ...account, usage: { bytes: '1', limit: 2 } },
      { ...account, usage: { bytes: 1 } },
    ]
    for (const body of wrong) await expect(answering(body).account('t')).rejects.toMatchObject(bad)
  })

  it('refuses a malformed pull answer', async () => {
    const wrong = [
      {},
      { ...pull, keyId: undefined },
      { ...pull, keyId: 7 },
      { ...pull, records: undefined },
      { ...pull, records: {} },
      { ...pull, records: [{ id: 'a', rev: 1 }] },
      { ...pull, records: [{ id: 1, blob: 'AAAA', rev: 1 }] },
      { ...pull, records: [{ id: 'a', blob: 'AAAA', rev: '1' }] },
      { ...pull, records: [null] },
      { ...pull, rev: undefined },
      { ...pull, rev: -1 },
      { ...pull, rev: 1.5 },
      { ...pull, more: undefined },
      { ...pull, more: 'no' },
    ]
    for (const body of wrong) await expect(answering(body).pull('t', 0)).rejects.toMatchObject(bad)
  })

  it('refuses a malformed push answer', async () => {
    const wrong = [
      {},
      { ...push, applied: undefined },
      { ...push, applied: [{ id: 'a' }] },
      { ...push, applied: [{ id: 1, rev: 1 }] },
      { ...push, applied: ['a'] },
      { ...push, conflicts: undefined },
      { ...push, conflicts: [1] },
      { ...push, conflicts: 'a' },
    ]
    for (const body of wrong) await expect(answering(body).push('t', 'k', [])).rejects.toMatchObject(bad)
  })

  it('refuses a success whose body is not JSON, or that has no body where one is needed', async () => {
    await expect(answering('<html>ok</html>').pull('t', 0)).rejects.toMatchObject(bad)
    await expect(answering('').account('t')).rejects.toMatchObject(bad)
    const empty = createApi('https://api.test', async () => new Response(null, { status: 204 }))
    await expect(empty.pull('t', 0)).rejects.toMatchObject(bad)
  })

  it('does not look at the body of a call that returns nothing', async () => {
    await expect(answering('ok').logout('t')).resolves.toBeUndefined()
    await expect(answering({ anything: 1 }).putKey('t', key, false)).resolves.toBeUndefined()
  })
})

describe('against the fake server', () => {
  it('signs in by email code and reads the account', async () => {
    const { server, api, token } = await signedIn()
    expect(server.lastCode).toBeDefined()
    expect(EMAIL_CODE_LENGTH).toBe(6)
    expect(await api.account(token)).toEqual({ email: EMAIL, plan: 'premium', key: null, usage: { bytes: 0, limit: 20 * 1024 * 1024 } })
    await api.logout(token)
    await expect(api.account(token)).rejects.toMatchObject({ status: 401 })
  })

  it('accepts an email code once', async () => {
    const { server, api } = await signedIn()
    await api.emailStart(EMAIL, 'id')
    const code = server.lastCode(EMAIL)
    expect(code).toMatch(/^\d{6}$/)
    await api.emailVerify(EMAIL, code)
    await expect(api.emailVerify(EMAIL, code)).rejects.toMatchObject({ code: 'invalid_code' })
  })

  it('exchanges a Google login code only with the matching verifier', async () => {
    const server = new FakeServer()
    const api = createApi(server.origin, server.fetch)
    const challenge = await sha256Base64Url('verifier-1')
    await expect(api.exchange(server.issueLoginCode(EMAIL, challenge), 'wrong')).rejects.toMatchObject({ code: 'invalid_code' })
    const code = server.issueLoginCode(EMAIL, challenge)
    const token = await api.exchange(code, 'verifier-1')
    expect((await api.account(token)).email).toBe(EMAIL)
    await expect(api.exchange(code, 'verifier-1')).rejects.toMatchObject({ code: 'invalid_code' })
  })

  it('stores a key once, and replaces it only on reset with a new id', async () => {
    const { api, token, wrappedKey } = await withKey()
    expect((await api.account(token)).key).toEqual(wrappedKey)
    const other = (await createKey('frasa lain panjang', 100_000)).wrappedKey
    await expect(api.putKey(token, other, false)).rejects.toMatchObject({ status: 409, code: 'key_exists' })
    await expect(api.putKey(token, wrappedKey, true)).rejects.toMatchObject({ status: 400 })
    await api.putKey(token, other, true)
    expect((await api.account(token)).key!.keyId).toBe(other.keyId)
  })

  it('writes a record only when prevRev matches', async () => {
    const { api, token, keyId } = await withKey()
    expect(await api.push(token, keyId, [{ id: 'a', blob: blob('v1'), prevRev: 0 }])).toEqual({ applied: [{ id: 'a', rev: 1 }], conflicts: [] })
    expect(await api.push(token, keyId, [{ id: 'a', blob: blob('v2'), prevRev: 0 }])).toEqual({ applied: [], conflicts: ['a'] })
    expect(await api.push(token, keyId, [{ id: 'a', blob: blob('v2'), prevRev: 1 }])).toEqual({ applied: [{ id: 'a', rev: 2 }], conflicts: [] })
    expect(await api.pull(token, 0)).toEqual({ keyId, records: [{ id: 'a', blob: blob('v2'), rev: 2 }], rev: 2, more: false })
    expect(await api.pull(token, 2)).toEqual({ keyId, records: [], rev: 2, more: false })
  })

  it('refuses a push made with another key, and wipes records on reset', async () => {
    const { api, token, keyId } = await withKey()
    await api.push(token, keyId, [{ id: 'a', blob: blob('v1'), prevRev: 0 }])
    await expect(api.push(token, 'other-key', [{ id: 'b', blob: blob('x'), prevRev: 0 }])).rejects.toMatchObject({ status: 409, code: 'key_changed' })
    const fresh = (await createKey('frasa lain panjang', 100_000)).wrappedKey
    await api.putKey(token, fresh, true)
    expect(await api.pull(token, 0)).toEqual({ keyId: fresh.keyId, records: [], rev: 1, more: false })
  })

  it('reports a cursor that is ahead of the server', async () => {
    const { server, api, token, keyId } = await withKey()
    await api.push(token, keyId, [{ id: 'a', blob: blob('v1'), prevRev: 0 }])
    server.rewind(EMAIL)
    expect(await api.pull(token, 1)).toEqual({ keyId, records: [], rev: 0, more: false })
  })

  it('pages a pull', async () => {
    const { server, api, token, keyId } = await withKey()
    await api.push(token, keyId, ['a', 'b', 'c'].map((id) => ({ id, blob: blob(id), prevRev: 0 })))
    server.pageSize = 2
    const first = await api.pull(token, 0)
    expect(first.records.map((r) => r.id)).toEqual(['a', 'b'])
    expect(first).toMatchObject({ rev: 2, more: true })
    expect(await api.pull(token, first.rev)).toMatchObject({ records: [{ id: 'c', rev: 3 }], rev: 3, more: false })
  })

  it('enforces the plan, the quota and the record size', async () => {
    const { server, api, token, keyId } = await withKey()
    server.quota = 10
    await expect(api.push(token, keyId, [{ id: 'a', blob: blob('x'.repeat(30)), prevRev: 0 }])).rejects.toMatchObject({ status: 413, code: 'quota_exceeded' })
    server.quota = 20 * 1024 * 1024
    await expect(api.push(token, keyId, [{ id: 'a', blob: blob('x'.repeat(1024 * 1024 + 1)), prevRev: 0 }])).rejects.toMatchObject({ code: 'record_too_large' })
    server.user(EMAIL).plan = 'free'
    await expect(api.pull(token, 0)).rejects.toMatchObject({ status: 403, code: 'plan_required' })
  })

  it('deletes the account', async () => {
    const { server, api, token } = await withKey()
    await api.deleteAccount(token)
    expect(server.hasUser(EMAIL)).toBe(false)
    await expect(api.account(token)).rejects.toMatchObject({ status: 401 })
  })

  it('rejects a body sent without a JSON content type', async () => {
    const server = new FakeServer()
    const res = await server.handle('POST', `${server.origin}/auth/email/start`, {}, JSON.stringify({ email: EMAIL }))
    expect(res).toEqual({ status: 400, body: { error: 'bad_request' } })
  })
})
