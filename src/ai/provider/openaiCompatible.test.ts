import { createOpenAICompatibleProvider } from './openaiCompatible'
import { collect, jsonErrorResponse, sseResponse } from './sse.test-utils'
import { ProviderError, type AiConfig, type ChatRequest, type ChatTurn } from './types'

const config = (over: Partial<AiConfig> = {}): AiConfig => ({
  provider: 'openai',
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  model: 'my-model',
  ...over,
})

const chunk = (content: string | null, finish: string | null = null) => ({
  id: 'c1',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'my-model',
  choices: [{ index: 0, delta: content === null ? {} : { content }, finish_reason: finish }],
})

const req = () => ({ system: 'SYS', messages: [{ role: 'user' as const, content: 'halo' }], signal: new AbortController().signal })

test('streams content deltas, prepends system message, uses baseURL', async () => {
  const fetchMock = vi.fn(async () =>
    sseResponse([{ data: chunk('Hai') }, { data: chunk(' kamu') }, { data: chunk(null, 'stop') }, { data: '[DONE]' }]),
  )
  const provider = createOpenAICompatibleProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  expect(await collect(provider.stream(req()))).toBe('Hai kamu')

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(String(url)).toBe('https://api.openai.com/v1/chat/completions')
  const body = JSON.parse(String(init.body))
  expect(body).toMatchObject({ model: 'my-model', stream: true })
  expect(body.messages).toEqual([
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'halo' },
  ])
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-test')
})

async function sentBody(over: Partial<AiConfig>, request: Partial<ChatRequest>) {
  const fetchMock = vi.fn(async () => sseResponse([{ data: chunk('ok', 'stop') }, { data: '[DONE]' }]))
  await collect(createOpenAICompatibleProvider(config(over), { fetch: fetchMock as typeof fetch, maxRetries: 0 }).stream({ ...req(), ...request }))
  return JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
}

const threeTurns: ChatTurn[] = [
  { role: 'user', content: 'satu' },
  { role: 'assistant', content: 'dua' },
  { role: 'user', content: 'tiga' },
]

test('openrouter without cache: true: content blocks without any cache_control', async () => {
  for (const cache of [undefined, false]) {
    const body = await sentBody({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }, { messages: threeTurns, context: 'CTX', cache })
    expect(JSON.stringify(body)).not.toContain('cache_control')
    expect(body.messages[0]).toEqual({ role: 'system', content: [{ type: 'text', text: 'SYS' }] })
    expect(body.messages[3]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'tiga' },
        { type: 'text', text: 'CTX' },
      ],
    })
  }
})

test('openrouter with cache: true: sends cache breakpoints as content blocks and the context as a separate last block', async () => {
  const body = await sentBody(
    { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' },
    { messages: threeTurns, context: 'CTX', cache: true },
  )
  expect(body.messages).toEqual([
    { role: 'system', content: [{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }] },
    { role: 'user', content: [{ type: 'text', text: 'satu' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'dua' }] },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'tiga', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'CTX' },
      ],
    },
  ])
})

test('openai: plain string content, context appended to the last message, no cache_control', async () => {
  const body = await sentBody({}, { messages: threeTurns, context: 'CTX', cache: true })
  expect(body.messages).toEqual([
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'satu' },
    { role: 'assistant', content: 'dua' },
    { role: 'user', content: 'tiga\n\nCTX' },
  ])
  expect(JSON.stringify(body)).not.toContain('cache_control')
})

test('openai: a blank context leaves the last message untouched', async () => {
  const body = await sentBody({}, { context: '  ' })
  expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'halo' })
})

test('empty api key (ollama) still works with a placeholder bearer', async () => {
  const fetchMock = vi.fn(async () => sseResponse([{ data: chunk('ok', 'stop') }, { data: '[DONE]' }]))
  const provider = createOpenAICompatibleProvider(
    config({ provider: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434/v1' }),
    { fetch: fetchMock as typeof fetch, maxRetries: 0 },
  )
  expect(await collect(provider.stream(req()))).toBe('ok')
  expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe('http://localhost:11434/v1/chat/completions')
})

test('content_filter finish reason throws refusal', async () => {
  const fetchMock = vi.fn(async () => sseResponse([{ data: chunk(null, 'content_filter') }, { data: '[DONE]' }]))
  const provider = createOpenAICompatibleProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  await expect(collect(provider.stream(req()))).rejects.toMatchObject({ kind: 'refusal' })
})

test.each([
  [401, 'auth'],
  [429, 'rateLimit'],
  [404, 'notFound'],
])('HTTP %i maps to %s', async (status, kind) => {
  const fetchMock = vi.fn(async () => jsonErrorResponse(status))
  const provider = createOpenAICompatibleProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  await expect(collect(provider.stream(req()))).rejects.toMatchObject({ kind })
})

test.each([
  ['custom', ''],
  ['custom', '   '],
  ['ollama', ''],
  ['openrouter', ''],
] as const)('%s with a blank base URL (%j) throws badRequest and never falls back to api.openai.com', (provider, baseUrl) => {
  const fetchMock = vi.fn()
  let err: unknown
  try {
    createOpenAICompatibleProvider(config({ provider, baseUrl }), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(ProviderError)
  expect(err).toMatchObject({ kind: 'badRequest' })
  expect(fetchMock).not.toHaveBeenCalled()
})

test('openai with a blank base URL uses the official endpoint', async () => {
  const fetchMock = vi.fn(async () => sseResponse([{ data: chunk('ok', 'stop') }, { data: '[DONE]' }]))
  const provider = createOpenAICompatibleProvider(config({ baseUrl: '' }), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  expect(await collect(provider.stream(req()))).toBe('ok')
  expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe('https://api.openai.com/v1/chat/completions')
})

test('fetch failure maps to network', async () => {
  const fetchMock = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  const provider = createOpenAICompatibleProvider(config(), { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  await expect(collect(provider.stream(req()))).rejects.toMatchObject({ kind: 'network' })
})

test('gemini: calls the OpenAI-compatible endpoint without x-stainless headers (Gemini CORS rejects them)', async () => {
  const fetchMock = vi.fn(async () => sseResponse([{ data: chunk('Hai') }, { data: chunk(null, 'stop') }, { data: '[DONE]' }]))
  const provider = createOpenAICompatibleProvider(
    config({ provider: 'gemini', apiKey: 'gm-test', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.8-flash' }),
    { fetch: fetchMock as typeof fetch, maxRetries: 0 },
  )
  expect(await collect(provider.stream({ ...req(), cache: true }))).toBe('Hai')
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
  const headers = new Headers(init.headers)
  expect(headers.get('authorization')).toBe('Bearer gm-test')
  expect([...headers.keys()].filter((k) => k.startsWith('x-stainless'))).toEqual([])
  // Gemini caches implicitly: plain string content, no cache_control.
  const body = JSON.parse(String(init.body))
  expect(body.messages).toEqual([
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'halo' },
  ])
})