import { listModels } from './listModels'
import { jsonErrorResponse } from './sse.test-utils'
import { ProviderError, type AiConfig } from './types'

const anthropic: AiConfig = { provider: 'anthropic', apiKey: 'sk-test', baseUrl: '', model: 'claude-opus-5-5' }
const openai: AiConfig = { provider: 'openai', apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6' }

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

test('anthropic: returns sorted unique ids from the models endpoint', async () => {
  const fetchMock = vi.fn(async () => json({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }], has_more: false, first_id: 'b', last_id: 'a' }))
  expect(await listModels(anthropic, { fetch: fetchMock as typeof fetch, maxRetries: 0 })).toEqual(['a', 'b'])
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(String(url)).toContain('api.anthropic.com/v1/models')
  const headers = new Headers(init.headers)
  expect(headers.get('x-api-key')).toBe('sk-test')
  expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
})

test('anthropic: follows pagination until has_more is false', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json({ data: [{ id: 'c' }, { id: 'a' }], has_more: true, first_id: 'c', last_id: 'a' }))
    .mockResolvedValueOnce(json({ data: [{ id: 'b' }], has_more: false, first_id: 'b', last_id: 'b' }))
  expect(await listModels(anthropic, { fetch: fetchMock as typeof fetch, maxRetries: 0 })).toEqual(['a', 'b', 'c'])
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(String((fetchMock.mock.calls[1] as unknown as [string])[0])).toContain('after_id=a')
})

test('openai-compatible: returns sorted unique ids from baseUrl/models', async () => {
  const fetchMock = vi.fn(async () => json({ object: 'list', data: [{ id: 'b', object: 'model' }, { id: 'a', object: 'model' }, { id: 'a', object: 'model' }] }))
  expect(await listModels(openai, { fetch: fetchMock as typeof fetch, maxRetries: 0 })).toEqual(['a', 'b'])
  expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe('https://api.openai.com/v1/models')
})

test('caps the list at 500 ids', async () => {
  const data = Array.from({ length: 600 }, (_, i) => ({ id: `m${String(i).padStart(3, '0')}`, object: 'model' }))
  const fetchMock = vi.fn(async () => json({ object: 'list', data }))
  expect(await listModels(openai, { fetch: fetchMock as typeof fetch, maxRetries: 0 })).toHaveLength(500)
})

test.each([
  ['custom', '  '],
  ['ollama', ''],
  ['openrouter', ''],
] as const)('%s with a blank base URL rejects with badRequest and never falls back to api.openai.com', async (provider, baseUrl) => {
  const fetchMock = vi.fn()
  const err = await listModels({ ...openai, provider, baseUrl }, { fetch: fetchMock as typeof fetch, maxRetries: 0 }).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ProviderError)
  expect(err).toMatchObject({ kind: 'badRequest' })
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each([
  ['anthropic', anthropic],
  ['openai', openai],
])('%s: a 401 rejects with ProviderError auth', async (_name, config) => {
  const fetchMock = vi.fn(async () => jsonErrorResponse(401))
  const err = await listModels(config, { fetch: fetchMock as typeof fetch, maxRetries: 0 }).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ProviderError)
  expect(err).toMatchObject({ kind: 'auth' })
})

test('gemini: strips the "models/" prefix from model ids', async () => {
  const fetchMock = vi.fn(async () => json({ object: 'list', data: [{ id: 'models/gemini-3.8-flash', object: 'model' }, { id: 'models/gemini-3.1-flash-lite', object: 'model' }] }))
  const gemini: AiConfig = { provider: 'gemini', apiKey: 'gm', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.8-flash' }
  expect(await listModels(gemini, { fetch: fetchMock as typeof fetch, maxRetries: 0 })).toEqual(['gemini-3.1-flash-lite', 'gemini-3.8-flash'])
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect([...new Headers(init.headers).keys()].filter((k) => k.startsWith('x-stainless'))).toEqual([])
})