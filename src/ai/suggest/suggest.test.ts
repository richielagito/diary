import type { CreateProvider } from '../provider/createProvider'
import type { AiConfig, ChatRequest } from '../provider/types'
import type { ChatMessage } from '../../storage/ChatRepository'
import { failWith, replyWith } from '../../test/fakeProvider'
import { draftDiaryFromChat, parseSuggestion, suggestTags } from './suggest'

const cfg: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'm' }

function recording(reply: string) {
  const seen: ChatRequest[] = []
  const createProvider: CreateProvider = (c) => {
    const inner = replyWith(reply)(c)
    return { stream: (req) => (seen.push(req), inner.stream(req)) }
  }
  return { seen, provider: createProvider(cfg) }
}

const msg = (i: number): ChatMessage => ({
  id: String(i),
  date: '2026-09-20',
  role: i % 2 ? 'assistant' : 'user',
  content: `isi ${i}`,
  createdAt: i,
  status: 'complete',
})

describe('parseSuggestion', () => {
  test('accepts a valid object', () => {
    expect(parseSuggestion({ mood: 4, tags: ['kerja'] }, [])).toEqual({ mood: 4, tags: ['kerja'] })
  })
  test('invalid mood and tags fall back', () => {
    expect(parseSuggestion({ mood: 9, tags: 'x' }, [])).toEqual({ mood: null, tags: [] })
  })
  test('a string mood is not accepted', () => {
    expect(parseSuggestion({ mood: '4', tags: [] }, [])?.mood).toBeNull()
  })
  test('non-objects give null', () => {
    expect(parseSuggestion(null, [])).toBeNull()
    expect(parseSuggestion([1], [])).toBeNull()
  })
})

describe('suggestTags', () => {
  const base = { markdown: 'Hari ini capek sekali', language: 'id' as const, knownTags: ['kerja'], existingTags: [] as string[] }

  test('ok: extracts JSON from prose and builds a tag-only prompt', async () => {
    const { seen, provider } = recording('Ini: {"tags":["Sekolah"]}')
    expect(await suggestTags(provider, base)).toEqual({ status: 'ok', tags: ['sekolah'] })
    expect(seen[0].system).toContain('Indonesian')
    expect(seen[0].system).not.toMatch(/mood/i)
    expect(seen[0].messages[0].content).toContain('Hari ini capek sekali')
    expect(seen[0].messages[0].content).toContain('Known tags: kerja')
    expect(seen[0].cache).toBeFalsy()
  })

  test('keeps up to 5 tags and removes those already on the entry', async () => {
    const { provider } = recording('{"tags":["kerja","a1","b1","c1","d1","e1","f1"]}')
    expect(await suggestTags(provider, { ...base, existingTags: ['kerja'] })).toEqual({
      status: 'ok',
      tags: ['a1', 'b1', 'c1', 'd1', 'e1'],
    })
  })

  test('non-JSON reply is a format error', async () => {
    const { provider } = recording('maaf tidak bisa')
    expect(await suggestTags(provider, base)).toEqual({ status: 'error', kind: 'format' })
  })

  test('tags that are not an array is a format error', async () => {
    const { provider } = recording('{"tags":"kerja"}')
    expect(await suggestTags(provider, base)).toEqual({ status: 'error', kind: 'format' })
  })

  test('provider errors keep their kind', async () => {
    expect(await suggestTags(failWith('auth')(cfg), base)).toEqual({ status: 'error', kind: 'auth' })
  })
})

describe('draftDiaryFromChat', () => {
  const base = { language: 'en' as const, knownTags: [] as string[], existingTags: [] as string[] }

  test('ok: trims, collapses newlines and lists the conversation', async () => {
    const { seen, provider } = recording(JSON.stringify({ text: '  Halo\n\n\n\nDunia  ', mood: 3, tags: ['Teman'] }))
    const result = await draftDiaryFromChat(provider, { ...base, messages: [msg(0), msg(1)] })
    expect(result).toEqual({ status: 'ok', text: 'Halo\n\nDunia', mood: 3, tags: ['teman'] })
    expect(seen[0].system).toContain('English')
    expect(seen[0].messages[0].content).toContain('User: isi 0')
    expect(seen[0].messages[0].content).toContain('Companion: isi 1')
    expect(seen[0].messages[0].content).toContain('Known tags: (none)')
    expect(seen[0].cache).toBeFalsy()
  })

  test('only the last 40 of 45 messages are sent', async () => {
    const { seen, provider } = recording('{"text":"x","mood":null,"tags":[]}')
    await draftDiaryFromChat(provider, { ...base, messages: Array.from({ length: 45 }, (_, i) => msg(i)) })
    const content = seen[0].messages[0].content
    expect(content).not.toContain('isi 4\n')
    expect(content).toContain('isi 5')
    expect(content).toContain('isi 44')
  })

  test('empty or blank text is a format error', async () => {
    for (const text of ['', '   \n']) {
      const { provider } = recording(JSON.stringify({ text, mood: 3, tags: [] }))
      expect(await draftDiaryFromChat(provider, { ...base, messages: [msg(0)] })).toEqual({ status: 'error', kind: 'format' })
    }
  })

  test('normalises CRLF before collapsing newlines', async () => {
    const { provider } = recording(JSON.stringify({ text: 'Satu\r\n\r\n\r\nDua\r\nTiga', mood: null, tags: [] }))
    const result = await draftDiaryFromChat(provider, { ...base, messages: [msg(0)] })
    expect(result.status === 'ok' && result.text).toBe('Satu\n\nDua\nTiga')
  })

  test('text over 2000 chars is cut', async () => {
    const { provider } = recording(JSON.stringify({ text: 'a'.repeat(2500), mood: null, tags: [] }))
    const result = await draftDiaryFromChat(provider, { ...base, messages: [msg(0)] })
    expect(result.status === 'ok' && result.text.length).toBe(2000)
  })

  test('cutting at 2000 never splits an emoji', async () => {
    const { provider } = recording(JSON.stringify({ text: 'a'.repeat(1999) + '😀' + 'b', mood: null, tags: [] }))
    const result = await draftDiaryFromChat(provider, { ...base, messages: [msg(0)] })
    expect(result.status === 'ok' && result.text).toBe('a'.repeat(1999) + '😀')
  })

  test('a message cut in the prompt never splits an emoji', async () => {
    const { seen, provider } = recording('{"text":"x","mood":null,"tags":[]}')
    const long = { ...msg(0), content: 'a'.repeat(999) + '😀😀' }
    await draftDiaryFromChat(provider, { ...base, messages: [long] })
    expect(seen[0].messages[0].content).toContain(`User: ${'a'.repeat(999)}😀…`)
  })
})
