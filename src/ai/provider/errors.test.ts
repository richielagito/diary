import { mapSdkError } from './errors'
import { ProviderError } from './types'

class APIError extends Error {
  status?: number
  constructor(status?: number) {
    super('api')
    this.status = status
  }
}
class APIUserAbortError extends APIError {}
class APIConnectionError extends APIError {}
const sdk = { APIError, APIUserAbortError, APIConnectionError }

test.each([
  [401, 'auth'],
  [403, 'auth'],
  [429, 'rateLimit'],
  [404, 'notFound'],
  [500, 'unknown'],
  [400, 'badRequest'],
  [422, 'badRequest'],
])('status %i maps to %s', (status, kind) => {
  expect(mapSdkError(new APIError(status), sdk).kind).toBe(kind)
})

test('abort errors map to aborted (checked before APIError)', () => {
  expect(mapSdkError(new APIUserAbortError(), sdk).kind).toBe('aborted')
  expect(mapSdkError(new DOMException('x', 'AbortError'), sdk).kind).toBe('aborted')
})

test('connection errors and fetch TypeErrors map to network', () => {
  expect(mapSdkError(new APIConnectionError(), sdk).kind).toBe('network')
  expect(mapSdkError(new TypeError('Failed to fetch'), sdk).kind).toBe('network')
})

test('existing ProviderError passes through', () => {
  const e = new ProviderError('refusal')
  expect(mapSdkError(e, sdk)).toBe(e)
})

test('anything else is unknown', () => {
  expect(mapSdkError(new Error('boom'), sdk).kind).toBe('unknown')
  expect(mapSdkError('weird', sdk).kind).toBe('unknown')
})
