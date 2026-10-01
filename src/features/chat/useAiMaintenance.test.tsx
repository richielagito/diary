import { screen, waitFor } from '@testing-library/react'
import type { CreateProvider } from '../../ai/provider/createProvider'
import type { AiConfig, ChatRequest } from '../../ai/provider/types'
import { renderApp, renderWithRepos } from '../../test/renderApp'
import { useAiMaintenance } from './useAiMaintenance'

const ai: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5' }

function routedProvider(requests: ChatRequest[]): CreateProvider {
  return () => ({
    async *stream(req) {
      requests.push(req)
      if (req.system.includes('maintain a short list of facts')) yield JSON.stringify({ add: ['Punya kucing bernama Mochi'] })
      else if (req.system.includes('summarize a period')) yield 'Ringkasan minggu.'
      else yield 'balasan'
    },
  })
}

// Only the summary tests freeze the clock: frozen time would give every chat message the same createdAt.
const freezeDate = () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 28, 10))
}
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const isSummary = (r: ChatRequest) => r.system.includes('summarize a period')
const isExtraction = (r: ChatRequest) => r.system.includes('maintain a short list of facts')
const isChat = (r: ChatRequest) => !isSummary(r) && !isExtraction(r)

/** Send one message and wait until its chat request is observed and the reply is saved and shown. */
async function sendAndAwaitChat(user: Awaited<ReturnType<typeof renderApp>>['user'], requests: ChatRequest[], text: string) {
  const input = await screen.findByRole('textbox', { name: 'Pesan' })
  const before = requests.filter(isChat).length
  await user.type(input, `${text}{Enter}`)
  // The input is disabled while a reply streams; wait until it is usable again before typing the next message.
  await waitFor(() => {
    expect(requests.filter(isChat)).toHaveLength(before + 1)
    expect(screen.getAllByText('balasan')).toHaveLength(before + 1)
    expect(input).toBeEnabled()
  })
}

test('opening Curhat builds a missing summary for a finished week with entries', async () => {
  freezeDate()
  const requests: ChatRequest[] = []
  const { summaries } = await renderApp('/chat', { settings: { ai }, entries: [{ date: '2026-09-22', markdown: 'minggu lalu' }] }, { createProvider: routedProvider(requests) })
  await waitFor(async () => expect((await summaries.get('week:2026-09-21'))?.text).toBe('Ringkasan minggu.'))
})

test('a provider factory that throws on open is logged and does not crash the chat page', async () => {
  freezeDate()
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const boom = new Error('bad config')
  const throwing: CreateProvider = () => {
    throw boom
  }
  await renderApp('/chat', { settings: { ai }, entries: [{ date: '2026-09-22', markdown: 'minggu lalu' }] }, { createProvider: throwing })
  await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(boom))
  expect(screen.getByRole('textbox', { name: 'Pesan' })).toBeInTheDocument()
})

test('a provider factory that throws when a reply is saved is logged, not thrown', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const boom = new Error('bad config')
  const throwing: CreateProvider = () => {
    throw boom
  }
  let onReplySaved: () => void = () => {}
  function Probe() {
    onReplySaved = useAiMaintenance().onReplySaved
    return <p>siap</p>
  }
  await renderWithRepos(<Probe />, { settings: { ai, aiSummariesEnabled: false } }, { createProvider: throwing })
  await screen.findByText('siap')
  expect(() => onReplySaved()).not.toThrow()
  await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(boom))
})

// Summary upkeep starts when the page opens, so a chat request sent afterwards is the positive control:
// once it is observed, a summary request would have been observed too.
test('no summaries when disabled', async () => {
  freezeDate()
  const requests: ChatRequest[] = []
  const { user } = await renderApp('/chat', { settings: { ai, aiSummariesEnabled: false }, entries: [{ date: '2026-09-22', markdown: 'x' }] }, { createProvider: routedProvider(requests) })
  await sendAndAwaitChat(user, requests, 'halo')
  expect(requests.filter(isSummary)).toHaveLength(0)
})

test('no summaries when the diary is not included', async () => {
  freezeDate()
  const requests: ChatRequest[] = []
  const { user, summaries } = await renderApp('/chat', { settings: { ai, aiIncludeDiary: false }, entries: [{ date: '2026-09-22', markdown: 'x' }] }, { createProvider: routedProvider(requests) })
  await sendAndAwaitChat(user, requests, 'halo')
  expect(requests.filter(isSummary)).toHaveLength(0)
  expect(await summaries.list()).toEqual([])
})

test('memories are extracted after the third user message gets a reply', async () => {
  const requests: ChatRequest[] = []
  const { memories, user } = await renderApp('/chat', { settings: { ai } }, { createProvider: routedProvider(requests) })
  for (const text of ['satu', 'dua', 'tiga']) await sendAndAwaitChat(user, requests, text)
  await waitFor(async () => expect((await memories.list()).map((m) => m.text)).toEqual(['Punya kucing bernama Mochi']))
  expect(requests.filter(isExtraction)).toHaveLength(1)
})

// Extraction starts when the third reply is saved, so the fourth chat request is the positive control:
// once it is observed, an extraction request would have been observed too.
test('no extraction when memory is disabled', async () => {
  const requests: ChatRequest[] = []
  const { user, memories } = await renderApp('/chat', { settings: { ai, aiMemoryEnabled: false } }, { createProvider: routedProvider(requests) })
  for (const text of ['satu', 'dua', 'tiga', 'empat']) await sendAndAwaitChat(user, requests, text)
  expect(requests.filter(isExtraction)).toHaveLength(0)
  expect(await memories.list()).toEqual([])
})

/** Like routedProvider, but also records the model each request was made with. */
function modelRecordingProvider(requests: ChatRequest[], models: Map<ChatRequest, string>): CreateProvider {
  const route = routedProvider(requests)
  return (config) => {
    const provider = route(config)
    return {
      stream(req) {
        models.set(req, config.model)
        return provider.stream(req)
      },
    }
  }
}

const modelsOf = (requests: ChatRequest[], models: Map<ChatRequest, string>, pred: (r: ChatRequest) => boolean) =>
  requests.filter(pred).map((r) => models.get(r))

test('summaries are made with the fast model', async () => {
  freezeDate()
  const requests: ChatRequest[] = []
  const models = new Map<ChatRequest, string>()
  const { summaries } = await renderApp('/chat', { settings: { ai }, entries: [{ date: '2026-09-22', markdown: 'minggu lalu' }] }, { createProvider: modelRecordingProvider(requests, models) })
  await waitFor(async () => expect(await summaries.get('week:2026-09-21')).toBeDefined())
  expect(modelsOf(requests, models, isSummary)).toEqual(['claude-haiku-4-5'])
})

test('memory extraction uses the fast model while the chat keeps the main model', async () => {
  const requests: ChatRequest[] = []
  const models = new Map<ChatRequest, string>()
  const { memories, user } = await renderApp('/chat', { settings: { ai } }, { createProvider: modelRecordingProvider(requests, models) })
  for (const text of ['satu', 'dua', 'tiga']) await sendAndAwaitChat(user, requests, text)
  await waitFor(async () => expect(await memories.list()).toHaveLength(1))
  expect(modelsOf(requests, models, isExtraction)).toEqual(['claude-haiku-4-5'])
  expect(modelsOf(requests, models, isChat)).toEqual(['claude-opus-5', 'claude-opus-5', 'claude-opus-5'])
})

test('a broken fast model stays silent: logged only, and the chat keeps working', async () => {
  freezeDate()
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const requests: ChatRequest[] = []
  const chatOk = routedProvider(requests)
  const boom = new Error('fast model misconfigured')
  const fastBroken: CreateProvider = (config) => {
    if (config.model === 'claude-haiku-4-5') throw boom
    return chatOk(config)
  }
  const { user } = await renderApp('/chat', { settings: { ai }, entries: [{ date: '2026-09-22', markdown: 'minggu lalu' }] }, { createProvider: fastBroken })
  await sendAndAwaitChat(user, requests, 'halo')
  await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(boom))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
