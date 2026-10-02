import { EMAIL_CODE_LENGTH } from '../../account/api'
import { blobBytes, sha256Base64Url, type WrappedKey } from '../crypto'

export interface FakeResponse {
  status: number
  body?: unknown
}

export interface FakeUser {
  email: string
  plan: string
  key: WrappedKey | null
  nextRev: number
  records: Map<string, { blob: string; rev: number }>
}

const MB = 1024 * 1024
const fail = (status: number, code: string): FakeResponse => ({ status, body: { error: code } })

/**
 * In-memory stand-in for the sync server, for unit tests and Playwright. It follows docs/sync-protocol.md:
 * the same routes, status codes and conditional-write rules, without rate limits or persistence.
 */
export class FakeServer {
  readonly origin = 'https://sync.test'
  /** When true, `fetch` rejects the way a dropped connection does. */
  offline = false
  pageSize = 500
  quota = 20 * MB
  /** Every request seen, oldest first. */
  readonly requests: { method: string; path: string }[] = []

  private readonly users = new Map<string, FakeUser>()
  private readonly sessions = new Map<string, string>()
  private readonly emailCodes = new Map<string, string>()
  private readonly loginCodes = new Map<string, { email: string; challenge: string }>()
  private readonly queued: FakeResponse[] = []
  private counter = 0

  /** The next request is answered with this error instead of being handled. */
  failNext(status: number, code: string): void {
    this.queued.push(fail(status, code))
  }

  lastCode(email: string): string {
    const code = this.emailCodes.get(email)
    if (!code) throw new Error(`no code was sent to ${email}`)
    return code
  }

  /** The code the Google callback would hand back to the app in `#login=`. */
  issueLoginCode(email: string, challenge: string): string {
    const code = `login-${++this.counter}`
    this.loginCodes.set(code, { email, challenge })
    return code
  }

  user(email: string): FakeUser {
    const user = this.users.get(email)
    if (!user) throw new Error(`no account for ${email}`)
    return user
  }

  hasUser(email: string): boolean {
    return this.users.has(email)
  }

  sessionCount(): number {
    return this.sessions.size
  }

  /** A database restored from an old backup: the records and the revision counter go back to the start. */
  rewind(email: string): void {
    const user = this.user(email)
    user.records.clear()
    user.nextRev = 1
  }

  fetch: typeof fetch = async (input, init) => {
    if (this.offline) throw new TypeError('Failed to fetch')
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, name) => {
      headers[name] = value
    })
    const res = await this.handle(init?.method ?? 'GET', url, headers, typeof init?.body === 'string' ? init.body : null)
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /** `headers` must use lower-case names. */
  async handle(method: string, url: string, headers: Record<string, string>, bodyText: string | null): Promise<FakeResponse> {
    const { pathname, searchParams } = new URL(url)
    this.requests.push({ method, path: pathname })
    const queued = this.queued.shift()
    if (queued) return queued

    let body: Record<string, unknown> = {}
    if (bodyText !== null) {
      if (!(headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return fail(400, 'bad_request')
      try {
        body = JSON.parse(bodyText) as Record<string, unknown>
      } catch {
        return fail(400, 'bad_request')
      }
    }

    const route = `${method} ${pathname}`
    if (route === 'POST /auth/email/start') {
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!email.includes('@')) return fail(400, 'bad_request')
      this.emailCodes.set(email, String(++this.counter).padStart(EMAIL_CODE_LENGTH, '0'))
      return { status: 204 }
    }
    if (route === 'POST /auth/email/verify') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const code = this.emailCodes.get(email)
      if (!code || code !== body.code) return fail(400, 'invalid_code')
      this.emailCodes.delete(email)
      return { status: 200, body: { token: this.signIn(email) } }
    }
    if (route === 'POST /auth/exchange') {
      const pending = this.loginCodes.get(String(body.code))
      this.loginCodes.delete(String(body.code))
      if (!pending || pending.challenge !== (await sha256Base64Url(String(body.verifier)))) return fail(400, 'invalid_code')
      return { status: 200, body: { token: this.signIn(pending.email) } }
    }

    const token = (headers.authorization ?? '').replace(/^Bearer /, '')
    const email = this.sessions.get(token)
    const user = email ? this.users.get(email) : undefined
    if (!user) return fail(401, 'unauthorized')

    if (route === 'POST /auth/logout') {
      this.sessions.delete(token)
      return { status: 204 }
    }
    if (route === 'GET /account') {
      return { status: 200, body: { email: user.email, plan: user.plan, key: user.key, usage: { bytes: this.bytes(user), limit: this.quota } } }
    }
    if (route === 'DELETE /account') {
      this.users.delete(user.email)
      for (const [t, e] of this.sessions) if (e === user.email) this.sessions.delete(t)
      return { status: 204 }
    }
    if (user.plan !== 'premium') return fail(403, 'plan_required')
    if (route === 'PUT /account/key') {
      const key: WrappedKey = {
        keyId: String(body.keyId),
        salt: String(body.salt),
        wrapped: String(body.wrapped),
        iterations: Number(body.iterations),
      }
      if (body.reset === true) {
        if (key.keyId === user.key?.keyId) return fail(400, 'bad_request')
        user.records.clear()
      } else if (user.key) return fail(409, 'key_exists')
      user.key = key
      return { status: 204 }
    }
    if (route === 'GET /sync') return { status: 200, body: this.pull(user, Number(searchParams.get('since') ?? '0')) }
    if (route === 'POST /sync') return this.push(user, body)
    return fail(404, 'not_found')
  }

  private signIn(email: string): string {
    if (!this.users.has(email)) this.users.set(email, { email, plan: 'premium', key: null, nextRev: 1, records: new Map() })
    const token = `token-${++this.counter}`
    this.sessions.set(token, email)
    return token
  }

  private bytes(user: FakeUser): number {
    let total = 0
    for (const record of user.records.values()) total += blobBytes(record.blob)
    return total
  }

  private pull(user: FakeUser, since: number) {
    const keyId = user.key?.keyId ?? null
    const newest = user.nextRev - 1
    if (since > newest) return { keyId, records: [], rev: newest, more: false }
    const all = [...user.records]
      .map(([id, record]) => ({ id, ...record }))
      .filter((record) => record.rev > since)
      .sort((a, b) => a.rev - b.rev)
    const records = all.slice(0, this.pageSize)
    const more = all.length > records.length
    return { keyId, records, rev: more ? records[records.length - 1]!.rev : newest, more }
  }

  private push(user: FakeUser, body: Record<string, unknown>): FakeResponse {
    const list = body.records as { id: string; blob: string; prevRev: number }[] | undefined
    if (!Array.isArray(list) || list.length === 0 || list.length > 100) return fail(400, 'bad_request')
    if (!user.key || body.keyId !== user.key.keyId) return fail(409, 'key_changed')
    if (list.some((r) => blobBytes(r.blob) > MB)) return fail(413, 'record_too_large')
    if (list.reduce((sum, r) => sum + blobBytes(r.blob), 0) > 4 * MB) return fail(413, 'request_too_large')
    const growth = list.reduce((sum, r) => sum + blobBytes(r.blob) - blobBytes(user.records.get(r.id)?.blob ?? ''), 0)
    if (growth > 0 && this.bytes(user) + growth > this.quota) return fail(413, 'quota_exceeded')

    const applied: { id: string; rev: number }[] = []
    const conflicts: string[] = []
    for (const record of list) {
      if ((user.records.get(record.id)?.rev ?? 0) !== record.prevRev) {
        conflicts.push(record.id)
        continue
      }
      const rev = user.nextRev++
      user.records.set(record.id, { blob: record.blob, rev })
      applied.push({ id: record.id, rev })
    }
    return { status: 200, body: { applied, conflicts } }
  }
}
