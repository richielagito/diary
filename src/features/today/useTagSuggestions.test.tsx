import { act, waitFor } from '@testing-library/react'
import type { CreateProvider } from '../../ai/provider/createProvider'
import type { AiConfig } from '../../ai/provider/types'
import { failWith, replyWith } from '../../test/fakeProvider'
import { renderWithRepos, type Seed } from '../../test/renderApp'
import { useTagSuggestions } from './useTagSuggestions'

const ai: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5-5' }
const entries: Seed['entries'] = [
  { date: '2026-09-01', markdown: 'rapat #kampus #kafe' },
  { date: '2026-09-02', markdown: 'lagi #kampus' },
]

type Hook = ReturnType<typeof useTagSuggestions>

async function setup(seed: Seed, inner?: CreateProvider) {
  const md = { current: 'hari ini #ka' }
  const models: string[] = []
  const createProvider: CreateProvider = (config) => {
    models.push(config.model)
    return (inner ?? replyWith('{"tags":["kantor","kampus"]}'))(config)
  }
  const hook: { current: Hook | null } = { current: null }
  function Probe() {
    hook.current = useTagSuggestions(() => md.current)
    return null
  }
  await renderWithRepos(<Probe />, { entries, ...seed }, { createProvider })
  // Known tags are loaded once they are suggested.
  await waitFor(() => expect(hook.current!.version).toBeGreaterThan(0))
  return { md, models, hook: hook as { current: Hook } }
}

afterEach(() => vi.restoreAllMocks())

test('suggests known tags without AI', async () => {
  const { hook } = await setup({})
  expect(hook.current.getSuggestions('')).toEqual(['kampus', 'kafe'])
  expect(hook.current.getSuggestions('kaf')).toEqual(['kafe'])
})

test('asks the fast model once and throttles until 300 more characters', async () => {
  const { hook, md, models } = await setup({ settings: { ai } })
  const before = hook.current.version
  await act(async () => hook.current.onTrigger())
  await waitFor(() => expect(hook.current.version).toBeGreaterThan(before))
  expect(models).toEqual(['claude-haiku-4-5'])
  // AI tags first, local after; tags already in the entry are skipped.
  expect(hook.current.getSuggestions('ka')).toEqual(['kantor', 'kampus', 'kafe'])

  await act(async () => hook.current.onTrigger())
  md.current += 'x'.repeat(299)
  await act(async () => hook.current.onTrigger())
  expect(models).toHaveLength(1)

  md.current += 'x'
  const v = hook.current.version
  await act(async () => hook.current.onTrigger())
  expect(models).toHaveLength(2)
  await waitFor(() => expect(hook.current.version).toBeGreaterThan(v))
})

function recordingPrompts() {
  const prompts: string[] = []
  const createProvider: CreateProvider = (config) => ({
    stream: (req) => {
      prompts.push(req.messages.map((m) => m.content).join('\n'))
      return replyWith('{"tags":["kantor"]}')(config).stream(req)
    },
  })
  return { prompts, createProvider }
}

test.each([
  [true, 'Known tags: kampus, kafe'],
  [false, 'Known tags: (none)'],
])('with aiIncludeDiary %s, the AI gets %s; the local chips keep the known tags', async (aiIncludeDiary, expected) => {
  const { prompts, createProvider } = recordingPrompts()
  const { hook } = await setup({ settings: { ai, aiIncludeDiary } }, createProvider)
  const before = hook.current.version
  await act(async () => hook.current.onTrigger())
  await waitFor(() => expect(hook.current.version).toBeGreaterThan(before))
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain(expected)
  if (!aiIncludeDiary) expect(prompts[0]).not.toMatch(/kampus|kafe/)
  expect(hook.current.getSuggestions('ka')).toEqual(['kantor', 'kampus', 'kafe'])
})

test('does not ask while a request is in flight', async () => {
  let release!: () => void
  const slow: CreateProvider = () => ({
    async *stream() {
      await new Promise<void>((r) => (release = r))
      yield '{"tags":["kantor"]}'
    },
  })
  const { hook, md, models } = await setup({ settings: { ai } }, slow)
  await act(async () => hook.current.onTrigger())
  md.current += 'x'.repeat(400)
  await act(async () => hook.current.onTrigger())
  expect(models).toHaveLength(1)
  const v = hook.current.version
  await act(async () => release())
  await waitFor(() => expect(hook.current.version).toBeGreaterThan(v))
})

test('does not ask when tag suggestions are off, but still suggests local tags', async () => {
  const { hook, models } = await setup({ settings: { ai, aiTagSuggest: false } })
  await act(async () => hook.current.onTrigger())
  expect(models).toEqual([])
  expect(hook.current.getSuggestions('k')).toEqual(['kampus', 'kafe'])
})

test('does not ask when no AI is configured', async () => {
  const { hook, models } = await setup({})
  await act(async () => hook.current.onTrigger())
  expect(models).toEqual([])
})

test('a provider error is only logged and local tags remain', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { hook, models } = await setup({ settings: { ai } }, failWith('network'))
  await act(async () => hook.current.onTrigger())
  await waitFor(() => expect(error).toHaveBeenCalled())
  expect(models).toHaveLength(1)
  expect(hook.current.getSuggestions('k')).toEqual(['kampus', 'kafe'])
})

test('a throwing provider factory is only logged', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const throwing: CreateProvider = () => {
    throw new Error('bad config')
  }
  const { hook } = await setup({ settings: { ai } }, throwing)
  await act(async () => hook.current.onTrigger())
  await waitFor(() => expect(error).toHaveBeenCalledWith(expect.any(Error)))
  expect(hook.current.getSuggestions('k')).toEqual(['kampus', 'kafe'])
})
