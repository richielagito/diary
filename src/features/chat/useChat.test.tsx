import { act, renderHook } from '@testing-library/react'
import { useEffect, useState, type ReactNode } from 'react'
import { RepoProvider, useRepos } from '../../app/RepoContext'
import type { CreateProvider } from '../../ai/provider/createProvider'
import type { AiConfig } from '../../ai/provider/types'
import type { ChatMessage } from '../../storage/ChatRepository'
import { DexieChatRepository } from '../../storage/DexieChatRepository'
import { DiaryDB } from '../../storage/db'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
import { DexieMemoryRepository } from '../../storage/DexieMemoryRepository'
import { DexieSettingsStore } from '../../storage/DexieSettingsStore'
import { DexieLetterRepository } from '../../storage/DexieLetterRepository'
import { DexieSummaryRepository } from '../../storage/DexieSummaryRepository'
import { defaultSettings } from '../../storage/SettingsStore'
import { controllable, failWith, replyWith } from '../../test/fakeProvider'
import { HISTORY_LIMIT, HISTORY_STEP, trimHistory, useChat } from './useChat'

const DATE = '2026-09-20'
const config: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5' }
let db: DiaryDB
let chats: DexieChatRepository

beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  chats = new DexieChatRepository(db)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

function setup(
  createProvider: CreateProvider,
  cfg: AiConfig | null = config,
  {
    loadPrompt = async () => ({ system: 'SYS', context: 'CTX' }),
    onReplySaved,
  }: { loadPrompt?: (latestUserText: string) => Promise<{ system: string; context: string }>; onReplySaved?: () => void } = {},
) {
  const settingsStore = new DexieSettingsStore(db, defaultSettings('id'))
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepoProvider
      diary={new DexieDiaryRepository(db)}
      settingsStore={settingsStore}
      chats={chats}
      memories={new DexieMemoryRepository(db)}
      summaries={new DexieSummaryRepository(db)}
      letters={new DexieLetterRepository(db)}
      createProvider={createProvider}
    >
      {children}
    </RepoProvider>
  )
  let clock = 1000
  return renderHook(
    () => {
      const { chats: repo } = useRepos()
      const [messages, setMessages] = useState<ChatMessage[]>([])
      useEffect(() => repo.watchByDate(DATE, setMessages), [repo])
      return { messages, ...useChat({ date: DATE, messages, config: cfg, loadPrompt, onReplySaved, now: () => clock++ }) }
    },
    { wrapper },
  )
}

const stored = () => chats.listByDate(DATE)

test('send stores user message, streams, then stores the complete reply', async () => {
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  let sent = false
  await act(async () => {
    sent = await result.current.send('  halo  ')
  })
  expect(sent).toBe(true)
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  expect(c.requests[0].system).toBe('SYS')
  expect(c.requests[0].context).toBe('CTX')
  expect(c.requests[0].cache).toBe(true)
  expect(c.requests[0].messages).toEqual([{ role: 'user', content: 'halo' }])
  act(() => c.push('Hai'))
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'streaming', partial: 'Hai' }))
  act(() => c.finish())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect((await stored()).map((m) => [m.role, m.content, m.status])).toEqual([
    ['user', 'halo', 'complete'],
    ['assistant', 'Hai', 'complete'],
  ])
})

test('at most HISTORY_LIMIT messages are sent', async () => {
  // All 'user' so history trimming (dropping a leading assistant turn) never kicks in here;
  // that behavior has its own test below. 39 stored + the new one = 40, a full window.
  for (let i = 0; i < 39; i++) {
    await chats.add({ date: DATE, role: 'user', content: `m${i}`, createdAt: i, status: 'complete' })
  }
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current.messages).toHaveLength(39))
  await act(async () => {
    await result.current.send('baru')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  const sent = c.requests[0].messages
  expect(sent).toHaveLength(HISTORY_LIMIT)
  expect(sent.at(-1)).toEqual({ role: 'user', content: 'baru' })
  act(() => c.finish())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
})

const history = (n: number, role: (i: number) => ChatMessage['role'] = () => 'user'): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, date: DATE, role: role(i), content: `m${i}`, createdAt: i, status: 'complete' }))

test('the window start moves in steps, so the first sent message stays the same for 31..40 messages', () => {
  expect(HISTORY_STEP).toBe(10)
  for (let n = 31; n <= 40; n++) expect(trimHistory(history(n))[0]).toEqual({ role: 'user', content: 'm10' })
  expect(trimHistory(history(41))[0]).toEqual({ role: 'user', content: 'm20' })
})

test('the window never exceeds HISTORY_LIMIT, keeps the newest message, and always starts with a user turn', () => {
  for (let n = 1; n <= 75; n++) {
    for (const role of [() => 'user' as const, (i: number) => (i % 2 === 0 ? 'assistant' : 'user') as ChatMessage['role']]) {
      const all = history(n, role)
      const sent = trimHistory(all)
      expect(sent.length).toBeLessThanOrEqual(HISTORY_LIMIT)
      if (sent.length === 0) continue
      expect(sent[0].role).toBe('user')
      expect(sent.at(-1)!.content).toBe(all.at(-1)!.content)
    }
  }
})

test('history is trimmed so the first sent message is always from the user', async () => {
  // Alternating assistant/user starting with 'assistant' at index 0: with 31 seeded messages
  // plus the new one, the window starts at index 10, an assistant turn, before trimming.
  for (let i = 0; i < 31; i++) {
    await chats.add({ date: DATE, role: i % 2 === 0 ? 'assistant' : 'user', content: `m${i}`, createdAt: i, status: 'complete' })
  }
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current.messages).toHaveLength(31))
  await act(async () => {
    await result.current.send('baru')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  const sent = c.requests[0].messages
  expect(sent[0].role).toBe('user')
  expect(sent.at(-1)).toEqual({ role: 'user', content: 'baru' })
  act(() => c.finish())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
})

test('an empty reply is not saved', async () => {
  const { result } = setup(replyWith())
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('halo')
  })
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect((await stored()).map((m) => m.role)).toEqual(['user'])
})

test('stop keeps partial text as stopped', async () => {
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('cerita')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  act(() => c.push('setengah'))
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'streaming', partial: 'setengah' }))
  act(() => result.current.stop())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  await vi.waitFor(async () => expect((await stored()).at(-1)).toMatchObject({ role: 'assistant', content: 'setengah', status: 'stopped' }))
})

test('stop before any text saves no assistant message', async () => {
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('cerita')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  act(() => result.current.stop())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect((await stored()).map((m) => m.role)).toEqual(['user'])
})

test('error sets error state and stores nothing; retry does not duplicate the user message', async () => {
  let calls = 0
  const flaky: CreateProvider = (cfg) => (calls++ === 0 ? failWith('rateLimit')(cfg) : replyWith('pulih')(cfg))
  const { result } = setup(flaky)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('tolong')
  })
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'error', kind: 'rateLimit' }))
  expect((await stored()).map((m) => m.role)).toEqual(['user'])
  act(() => result.current.retry())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect((await stored()).map((m) => [m.role, m.content])).toEqual([
    ['user', 'tolong'],
    ['assistant', 'pulih'],
  ])
})

test('retry while idle does nothing', async () => {
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  act(() => result.current.retry())
  expect(c.requests).toHaveLength(0)
  expect(result.current.state).toEqual({ phase: 'idle' })
})

test('empty text, missing config and sending while busy are ignored', async () => {
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    expect(await result.current.send('   ')).toBe(false)
  })
  await act(async () => {
    await result.current.send('satu')
  })
  await act(async () => {
    expect(await result.current.send('dua')).toBe(false)
  })
  act(() => c.finish())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect((await stored()).filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['satu'])

  const noCfg = setup(replyWith('x'), null)
  await vi.waitFor(() => expect(noCfg.result.current).toBeTruthy())
  await act(async () => {
    expect(await noCfg.result.current.send('halo')).toBe(false)
  })
})

test('unmount during streaming aborts and keeps partial as stopped', async () => {
  const c = controllable()
  const { result, unmount } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('cerita')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  act(() => c.push('sebagian'))
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'streaming', partial: 'sebagian' }))
  unmount()
  await vi.waitFor(async () => expect((await stored()).at(-1)).toMatchObject({ content: 'sebagian', status: 'stopped' }))
})

test('non-provider errors become unknown', async () => {
  const throwing: CreateProvider = () => {
    throw new Error('boom')
  }
  const { result } = setup(throwing)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('x')
  })
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'error', kind: 'unknown' }))
})

test('a failure saving the user message reports a storage error and does not lock up sending', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  const addSpy = vi.spyOn(chats, 'add').mockRejectedValueOnce(new Error('quota exceeded'))

  let sent = true
  await act(async () => {
    sent = await result.current.send('halo')
  })
  expect(sent).toBe(false)
  expect(result.current.state).toEqual({ phase: 'error', kind: 'storage' })
  expect(await stored()).toEqual([])

  addSpy.mockRestore()
  await act(async () => {
    sent = await result.current.send('halo lagi')
  })
  expect(sent).toBe(true)
  // The first send never reached the provider, so this is its first request.
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  act(() => c.finish())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect((await stored()).map((m) => m.content)).toEqual(['halo lagi'])

  errorSpy.mockRestore()
})

test('a failure saving the assistant reply keeps the text available for retry, without re-calling the provider', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('cerita')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))

  const addSpy = vi.spyOn(chats, 'add').mockRejectedValueOnce(new Error('quota exceeded'))
  act(() => c.push('jawaban'))
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'streaming', partial: 'jawaban' }))
  act(() => c.finish())
  await vi.waitFor(() =>
    expect(result.current.state).toEqual({ phase: 'error', kind: 'storage', unsaved: { content: 'jawaban', status: 'complete' } }),
  )
  expect((await stored()).map((m) => m.role)).toEqual(['user'])

  addSpy.mockRestore()
  act(() => result.current.retry())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect(c.requests).toHaveLength(1)
  expect((await stored()).map((m) => [m.role, m.content, m.status])).toEqual([
    ['user', 'cerita', 'complete'],
    ['assistant', 'jawaban', 'complete'],
  ])

  errorSpy.mockRestore()
})

test('a failure saving an aborted reply reports a storage error instead of staying stuck streaming', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('cerita')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  act(() => c.push('separuh'))
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'streaming', partial: 'separuh' }))

  const addSpy = vi.spyOn(chats, 'add').mockRejectedValueOnce(new Error('quota exceeded'))
  act(() => result.current.stop())
  await vi.waitFor(() =>
    expect(result.current.state).toEqual({ phase: 'error', kind: 'storage', unsaved: { content: 'separuh', status: 'stopped' } }),
  )

  addSpy.mockRestore()
  errorSpy.mockRestore()
})

test('sending a new message first saves a pending unsaved reply, in order, then proceeds', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('cerita')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))

  const addSpy = vi.spyOn(chats, 'add').mockRejectedValueOnce(new Error('quota exceeded'))
  act(() => c.push('jawaban'))
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'streaming', partial: 'jawaban' }))
  act(() => c.finish())
  await vi.waitFor(() =>
    expect(result.current.state).toEqual({ phase: 'error', kind: 'storage', unsaved: { content: 'jawaban', status: 'complete' } }),
  )
  expect((await stored()).map((m) => m.role)).toEqual(['user'])

  addSpy.mockRestore()
  let sent = false
  await act(async () => {
    sent = await result.current.send('baru')
  })
  expect(sent).toBe(true)
  // The pending reply is saved before the new user message, preserving conversation order.
  expect((await stored()).map((m) => [m.role, m.content, m.status])).toEqual([
    ['user', 'cerita', 'complete'],
    ['assistant', 'jawaban', 'complete'],
    ['user', 'baru', 'complete'],
  ])

  await vi.waitFor(() => expect(c.requests).toHaveLength(2))
  // The saved reply is part of the history sent with the new message, before it.
  expect(c.requests[1].messages).toEqual([
    { role: 'user', content: 'cerita' },
    { role: 'assistant', content: 'jawaban' },
    { role: 'user', content: 'baru' },
  ])
  act(() => c.finish())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))

  errorSpy.mockRestore()
})

test('sending a new message while the pending reply still fails to save keeps the error and sends nothing', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const c = controllable()
  const { result } = setup(c.createProvider)
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('cerita')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))

  const addSpy = vi.spyOn(chats, 'add').mockRejectedValue(new Error('quota exceeded'))
  act(() => c.push('jawaban'))
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'streaming', partial: 'jawaban' }))
  act(() => c.finish())
  await vi.waitFor(() =>
    expect(result.current.state).toEqual({ phase: 'error', kind: 'storage', unsaved: { content: 'jawaban', status: 'complete' } }),
  )

  let sent = true
  await act(async () => {
    sent = await result.current.send('baru')
  })
  expect(sent).toBe(false)
  expect(result.current.state).toEqual({ phase: 'error', kind: 'storage', unsaved: { content: 'jawaban', status: 'complete' } })
  expect((await stored()).map((m) => m.role)).toEqual(['user'])
  expect(c.requests).toHaveLength(1)

  addSpy.mockRestore()
  errorSpy.mockRestore()
})

test('loadPrompt receives the latest user text and onReplySaved fires only for complete replies', async () => {
  const seenTexts: string[] = []
  const onReplySaved = vi.fn()
  const c = controllable()
  const { result } = setup(c.createProvider, config, {
    loadPrompt: async (t: string) => (seenTexts.push(t), { system: 'SYS', context: 'CTX' }),
    onReplySaved,
  })
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('pertama')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  act(() => c.push('ok'))
  act(() => c.finish())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect(seenTexts).toEqual(['pertama'])
  expect(onReplySaved).toHaveBeenCalledTimes(1)

  await act(async () => {
    await result.current.send('kedua')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(2))
  act(() => c.push('sebagian'))
  act(() => result.current.stop())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect(onReplySaved).toHaveBeenCalledTimes(1)
})

test('an onReplySaved that throws is logged and does not turn a saved reply into a storage error', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const boom = new Error('upkeep failed')
  const c = controllable()
  const { result } = setup(c.createProvider, config, {
    onReplySaved: () => {
      throw boom
    },
  })
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('halo')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  act(() => c.push('jawaban'))
  act(() => c.finish())
  await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(boom))
  expect(result.current.state).toEqual({ phase: 'idle' })
  expect((await stored()).map((m) => [m.role, m.content, m.status])).toEqual([
    ['user', 'halo', 'complete'],
    ['assistant', 'jawaban', 'complete'],
  ])
  errorSpy.mockRestore()
})

test('onReplySaved does not fire for a provider error or a failed save, and fires once retry saves the reply', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const onReplySaved = vi.fn()
  const c = controllable()
  const { result } = setup(c.createProvider, config, { onReplySaved })
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('halo')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  act(() => c.fail('auth'))
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'error', kind: 'auth' }))
  expect(onReplySaved).not.toHaveBeenCalled()

  act(() => result.current.retry())
  await vi.waitFor(() => expect(c.requests).toHaveLength(2))
  const addSpy = vi.spyOn(chats, 'add').mockRejectedValueOnce(new Error('quota exceeded'))
  act(() => c.push('jawaban'))
  act(() => c.finish())
  await vi.waitFor(() =>
    expect(result.current.state).toEqual({ phase: 'error', kind: 'storage', unsaved: { content: 'jawaban', status: 'complete' } }),
  )
  expect(onReplySaved).not.toHaveBeenCalled()

  addSpy.mockRestore()
  act(() => result.current.retry())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  expect(onReplySaved).toHaveBeenCalledTimes(1)
  errorSpy.mockRestore()
})

test('sending a new message fires onReplySaved for the pending reply it saves first', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const onReplySaved = vi.fn()
  const c = controllable()
  const { result } = setup(c.createProvider, config, { onReplySaved })
  await vi.waitFor(() => expect(result.current).toBeTruthy())
  await act(async () => {
    await result.current.send('cerita')
  })
  await vi.waitFor(() => expect(c.requests).toHaveLength(1))
  const addSpy = vi.spyOn(chats, 'add').mockRejectedValueOnce(new Error('quota exceeded'))
  act(() => c.push('jawaban'))
  act(() => c.finish())
  await vi.waitFor(() =>
    expect(result.current.state).toEqual({ phase: 'error', kind: 'storage', unsaved: { content: 'jawaban', status: 'complete' } }),
  )
  addSpy.mockRestore()

  await act(async () => {
    await result.current.send('baru')
  })
  expect(onReplySaved).toHaveBeenCalledTimes(1)
  await vi.waitFor(() => expect(c.requests).toHaveLength(2))
  act(() => c.finish())
  await vi.waitFor(() => expect(result.current.state).toEqual({ phase: 'idle' }))
  errorSpy.mockRestore()
})
