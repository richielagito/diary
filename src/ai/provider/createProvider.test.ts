import { createProvider } from './createProvider'
import { collect, jsonErrorResponse, sseResponse } from './sse.test-utils'
import { testConnection } from './testConnection'
import type { ChatProvider } from './types'
import { ProviderError } from './types'

test('anthropic config routes to the anthropic endpoint, others to baseUrl', async () => {
  const fetchMock = vi.fn(async () => jsonErrorResponse(401))
  const deps = { fetch: fetchMock as typeof fetch, maxRetries: 0 }
  const signal = new AbortController().signal
  const req = { system: 's', messages: [{ role: 'user' as const, content: 'x' }], signal }

  await expect(collect(createProvider({ provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5' }, deps).stream(req))).rejects.toThrow()
  expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain('api.anthropic.com')

  await expect(collect(createProvider({ provider: 'openrouter', apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' }, deps).stream(req))).rejects.toThrow()
  expect(String((fetchMock.mock.calls[1] as unknown as [string])[0])).toBe('https://openrouter.ai/api/v1/chat/completions')
})

test('testConnection ok when stream completes', async () => {
  const fetchMock = vi.fn(async () =>
    sseResponse([
      { data: { id: 'c', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: 'stop' }] } },
      { data: '[DONE]' },
    ]),
  )
  const provider = createProvider({ provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'm' }, { fetch: fetchMock as typeof fetch, maxRetries: 0 })
  expect(await testConnection(provider)).toEqual({ ok: true })
})

test('testConnection reports error kind', async () => {
  const failing: ChatProvider = {
    // eslint-disable-next-line require-yield
    async *stream() {
      throw new ProviderError('auth')
    },
  }
  expect(await testConnection(failing)).toEqual({ ok: false, kind: 'auth' })
})
