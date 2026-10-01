import type { CreateProvider } from '../../ai/provider/createProvider'
import type { AiConfig, ChatRequest } from '../../ai/provider/types'
import { DexieChatRepository } from '../../storage/DexieChatRepository'
import { DiaryDB } from '../../storage/db'
import { DexieMemoryRepository } from '../../storage/DexieMemoryRepository'
import { DexieSettingsStore } from '../../storage/DexieSettingsStore'
import { defaultSettings } from '../../storage/SettingsStore'
import { failWith, replyWith } from '../../test/fakeProvider'
import { extractMemories } from './extractMemories'

const cfg: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'm' }
let db: DiaryDB
let chats: DexieChatRepository
let memories: DexieMemoryRepository
let settingsStore: DexieSettingsStore

beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  chats = new DexieChatRepository(db)
  memories = new DexieMemoryRepository(db)
  settingsStore = new DexieSettingsStore(db, defaultSettings('id'))
})
afterEach(async () => {
  db.close()
  await db.delete()
})

async function seedUserMessages(n: number, start = 1) {
  for (let i = 0; i < n; i++) {
    await chats.add({ date: '2026-09-20', role: 'user', content: `pesan ${i}`, createdAt: start + i * 2, status: 'complete' })
    await chats.add({ date: '2026-09-20', role: 'assistant', content: `balas ${i}`, createdAt: start + i * 2 + 1, status: 'complete' })
  }
}

const run = (createProvider: CreateProvider, minUserMessages = 3) =>
  extractMemories({ chats, memories, settingsStore, provider: createProvider(cfg), minUserMessages, now: () => 100 })

test('below the threshold nothing is sent', async () => {
  await seedUserMessages(2)
  const stream = vi.fn()
  const provider: CreateProvider = () => ({ stream })
  expect(await run(provider)).toEqual({ status: 'nothing' })
  expect(stream).not.toHaveBeenCalled()
})

test('applies model ops, protects user memories, and advances the cursor', async () => {
  const mine = await memories.add('Suka kopi', 'user', 1)
  const old = await memories.add('Kerja di Bandung', 'auto', 1)
  await seedUserMessages(3)
  const seen: ChatRequest[] = []
  const provider: CreateProvider = (c) => {
    const inner = replyWith(
      JSON.stringify({ add: ['Punya kucing bernama Mochi'], update: [{ id: old.id, text: 'Kerja di Jakarta' }], remove: [mine.id] }),
    )(c)
    return { stream: (req) => (seen.push(req), inner.stream(req)) }
  }
  expect(await run(provider)).toEqual({ status: 'ok', added: 1, updated: 1, removed: 0 })
  expect((await memories.list()).map((m) => m.text).sort()).toEqual(['Kerja di Jakarta', 'Punya kucing bernama Mochi', 'Suka kopi'])
  expect((await settingsStore.getAll()).memoryCursor).toBe(6)
  expect(seen[0].messages[0].content).toContain(`[${mine.id}] (user) Suka kopi`)
  expect(seen[0].messages[0].content).toContain('[2026-09-20] User: pesan 2')
  expect(seen[0].system).toContain('Indonesian')
  expect(seen[0].cache).toBeFalsy()
})

test('only messages after the cursor are processed', async () => {
  await seedUserMessages(3)
  await settingsStore.set('memoryCursor', 6)
  expect(await run(replyWith('{}'))).toEqual({ status: 'nothing' })
})

test('non-JSON reply changes nothing and keeps the cursor', async () => {
  await seedUserMessages(3)
  expect(await run(replyWith('maaf, saya tidak bisa'))).toEqual({ status: 'error', kind: 'format' })
  expect(await memories.list()).toEqual([])
  expect((await settingsStore.getAll()).memoryCursor).toBe(0)
})

test('provider error changes nothing and keeps the cursor', async () => {
  await seedUserMessages(3)
  expect(await run(failWith('rateLimit'))).toEqual({ status: 'error', kind: 'rateLimit' })
  expect((await settingsStore.getAll()).memoryCursor).toBe(0)
})

test('a memory the user edits while extraction runs is not overwritten', async () => {
  const m = await memories.add('lama', 'auto', 1)
  await seedUserMessages(3)
  const provider: CreateProvider = () => ({
    async *stream() {
      await memories.edit(m.id, 'diedit user', 50)
      yield JSON.stringify({ add: [], update: [{ id: m.id, text: 'diubah AI' }], remove: [] })
    },
  })
  expect(await run(provider)).toEqual({ status: 'ok', added: 0, updated: 0, removed: 0 })
  expect((await memories.list())[0]).toMatchObject({ text: 'diedit user', source: 'user' })
})

test('a memory the user deletes while extraction runs is not resurrected', async () => {
  const m = await memories.add('lama', 'auto', 1)
  await seedUserMessages(3)
  const provider: CreateProvider = () => ({
    async *stream() {
      await memories.edit(m.id, '', 50)
      yield JSON.stringify({ add: [], update: [{ id: m.id, text: 'diubah AI' }], remove: [] })
    },
  })
  expect(await run(provider)).toEqual({ status: 'ok', added: 0, updated: 0, removed: 0 })
  expect(await memories.list()).toEqual([])
})

test('memory turned off while extraction runs discards the result and keeps the cursor', async () => {
  await seedUserMessages(3)
  const provider: CreateProvider = () => ({
    async *stream() {
      await settingsStore.set('aiMemoryEnabled', false)
      yield JSON.stringify({ add: ['Punya kucing'] })
    },
  })
  expect(await run(provider)).toEqual({ status: 'nothing' })
  expect(await memories.list()).toEqual([])
  expect((await settingsStore.getAll()).memoryCursor).toBe(0)
})

test('the latest 40 messages by createdAt are sent, even across dates', async () => {
  // Older date carries the later createdAt values, so date-first ordering would pick the wrong tail.
  for (let i = 0; i < 30; i++) {
    await chats.add({ date: '2026-09-10', role: 'user', content: `lama ${i}`, createdAt: 1000 + i, status: 'complete' })
  }
  for (let i = 0; i < 30; i++) {
    await chats.add({ date: '2026-09-20', role: 'user', content: `baru ${i}`, createdAt: 1 + i, status: 'complete' })
  }
  const seen: ChatRequest[] = []
  const provider: CreateProvider = (c) => {
    const inner = replyWith('{}')(c)
    return { stream: (req) => (seen.push(req), inner.stream(req)) }
  }
  expect(await run(provider)).toMatchObject({ status: 'ok' })
  const content = seen[0].messages[0].content
  expect(content).toContain('User: lama 29')
  expect(content).toContain('User: lama 0')
  expect(content).toContain('User: baru 29')
  expect(content).not.toContain('User: baru 19')
  expect(content).toContain('User: baru 20')
  expect(content.match(/\] User: /g)).toHaveLength(40)
  expect((await settingsStore.getAll()).memoryCursor).toBe(1029)
})

test('non-positive threshold with no pending messages returns nothing', async () => {
  expect(await run(replyWith('{}'), 0)).toEqual({ status: 'nothing' })
})

test('a concurrent run returns busy', async () => {
  await seedUserMessages(3)
  let release: (() => void) | null = null
  const slow: CreateProvider = () => ({
    async *stream() {
      await new Promise<void>((r) => (release = r))
      yield '{}'
    },
  })
  const first = run(slow)
  await vi.waitFor(() => expect(release).not.toBeNull())
  expect(await run(replyWith('{}'))).toEqual({ status: 'busy' })
  release!()
  await first
})

test('the cursor never moves backwards when memory is re-enabled mid-run', async () => {
  await seedUserMessages(3)
  const provider: CreateProvider = () => ({
    async *stream() {
      await settingsStore.set('memoryCursor', 1000)
      yield '{}'
    },
  })
  expect(await run(provider)).toMatchObject({ status: 'ok' })
  expect((await settingsStore.getAll()).memoryCursor).toBe(1000)
})
