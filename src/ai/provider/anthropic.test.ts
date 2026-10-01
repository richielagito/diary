import { createAnthropicProvider } from './anthropic'
import { collect, jsonErrorResponse, sseResponse } from './sse.test-utils'
import type { AiConfig, ChatRequest, ChatTurn } from './types'

const config = (model = 'claude-opus-5'): AiConfig => ({ provider: 'anthropic', apiKey: 'sk-test', baseUrl: '', model })

function anthropicStream(texts: string[], stopReason = 'end_turn') {
  return sseResponse([
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [],
          stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
    },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
    ...texts.map((t) => ({
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
    })),
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 3 } },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ])
}

const req = () => ({ system: 'SYS', messages: [{ role: 'user' as const, content: 'halo' }], signal: new AbortController().signal })

test('streams text deltas in order and sends system, messages, key and browser header', async () => {
  const fetchMock = vi.fn(async () => anthropicStream(['Hai', ' kamu']))
  const provider = createAnthropicProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  expect(await collect(provider.stream(req()))).toBe('Hai kamu')

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(String(url)).toContain('/v1/messages')
  const headers = new Headers(init.headers)
  expect(headers.get('x-api-key')).toBe('sk-test')
  expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
  const body = JSON.parse(String(init.body))
  expect(body).toMatchObject({ model: 'claude-opus-5', max_tokens: 64000, stream: true })
  expect(body.system).toEqual([{ type: 'text', text: 'SYS' }])
  expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'halo' }] }])
})

async function sentBody(request: Partial<ChatRequest>) {
  const fetchMock = vi.fn(async () => anthropicStream(['ok']))
  await collect(createAnthropicProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 }).stream({ ...req(), ...request }))
  return JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
}

const threeTurns: ChatTurn[] = [
  { role: 'user', content: 'satu' },
  { role: 'assistant', content: 'dua' },
  { role: 'user', content: 'tiga' },
]

const breakpoints = (body: unknown) => JSON.stringify(body).split('"cache_control"').length - 1

test('without cache: true, no cache_control anywhere and context is still a separate last block', async () => {
  for (const cache of [undefined, false]) {
    const body = await sentBody({ messages: threeTurns, context: 'CTX', cache })
    expect(breakpoints(body)).toBe(0)
    expect(body.system).toEqual([{ type: 'text', text: 'SYS' }])
    expect(body.messages[2].content).toEqual([
      { type: 'text', text: 'tiga' },
      { type: 'text', text: 'CTX' },
    ])
  }
})

test('cache: true caches the system and the last user text, and adds context as a separate uncached last block', async () => {
  const body = await sentBody({ messages: threeTurns, context: 'CTX', cache: true })
  expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' })
  expect(body.messages[0].content).toEqual([{ type: 'text', text: 'satu' }])
  expect(body.messages[1].content).toEqual([{ type: 'text', text: 'dua' }])
  expect(body.messages[2].content).toEqual([
    { type: 'text', text: 'tiga', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'CTX' },
  ])
  expect(breakpoints(body)).toBe(2)
})

test('a single message without context gets the breakpoint on its only block', async () => {
  const body = await sentBody({ cache: true })
  expect(body.messages).toHaveLength(1)
  expect(body.messages[0].content).toEqual([{ type: 'text', text: 'halo', cache_control: { type: 'ephemeral' } }])
  expect(breakpoints(body)).toBe(2)
})

test('a blank context adds no block', async () => {
  const body = await sentBody({ messages: threeTurns, context: '   ', cache: true })
  expect(body.messages[2].content).toEqual([{ type: 'text', text: 'tiga', cache_control: { type: 'ephemeral' } }])
})

test('opus-5 / fable-5 models send fallbacks default with the beta header', async () => {
  for (const model of ['claude-opus-5', 'claude-fable-5-1']) {
    const fetchMock = vi.fn(async () => anthropicStream(['ok']))
    await collect(createAnthropicProvider(config(model), { fetch: fetchMock as typeof fetch, maxRetries: 0 }).stream(req()))
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body)).fallbacks).toBe('default')
    expect(new Headers(init.headers).get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
  }
})

test('other models send no fallbacks and no beta header', async () => {
  const fetchMock = vi.fn(async () => anthropicStream(['ok']))
  await collect(createAnthropicProvider(config('claude-haiku-4-5'), { fetch: fetchMock as typeof fetch, maxRetries: 0 }).stream(req()))
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
  expect(JSON.parse(String(init.body)).fallbacks).toBeUndefined()
  expect(new Headers(init.headers).get('anthropic-beta')).toBeNull()
})

test('refusal stop reason throws refusal', async () => {
  const fetchMock = vi.fn(async () => anthropicStream([], 'refusal'))
  const provider = createAnthropicProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  await expect(collect(provider.stream(req()))).rejects.toMatchObject({ kind: 'refusal' })
})

test.each([
  [401, 'auth'],
  [429, 'rateLimit'],
  [404, 'notFound'],
])('HTTP %i maps to %s', async (status, kind) => {
  const fetchMock = vi.fn(async () => jsonErrorResponse(status))
  const provider = createAnthropicProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  await expect(collect(provider.stream(req()))).rejects.toMatchObject({ kind })
})

test('fetch failure maps to network', async () => {
  const fetchMock = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  const provider = createAnthropicProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  await expect(collect(provider.stream(req()))).rejects.toMatchObject({ kind: 'network' })
})

test('abort maps to aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const fetchMock = vi.fn(async (_u: unknown, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return anthropicStream(['x'])
  })
  const provider = createAnthropicProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  await expect(collect(provider.stream({ ...req(), signal: controller.signal }))).rejects.toMatchObject({ kind: 'aborted' })
})
