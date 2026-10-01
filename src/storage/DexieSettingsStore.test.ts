import { DiaryDB } from './db'
import { DexieSettingsStore } from './DexieSettingsStore'
import { defaultSettings } from './SettingsStore'

let db: DiaryDB
let store: DexieSettingsStore

beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  store = new DexieSettingsStore(db, defaultSettings('id-ID'))
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('defaults by navigator language', () => {
  expect(defaultSettings('id-ID').language).toBe('id')
  expect(defaultSettings('en-US').language).toBe('en')
  expect(defaultSettings('fr').language).toBe('en')
})

test('getAll returns defaults when empty', async () => {
  expect(await store.getAll()).toEqual(defaultSettings('id-ID'))
})

test('set overrides one key, including null', async () => {
  await store.set('theme', 'dark')
  await store.set('backupReminderDays', null)
  expect(await store.getAll()).toMatchObject({ theme: 'dark', backupReminderDays: null, language: 'id' })
})

test('watchAll emits on change', async () => {
  const themes: string[] = []
  const unsub = store.watchAll((s) => themes.push(s.theme))
  await vi.waitFor(() => expect(themes).toEqual(['system']))
  await store.set('theme', 'light')
  await vi.waitFor(() => expect(themes).toEqual(['system', 'light']))
  unsub()
})

test('ai settings default and persist as objects', async () => {
  const s = await store.getAll()
  expect(s.ai).toBeNull()
  expect(s.persona).toEqual({ style: 'hangat', name: 'Teman', customInstruction: '' })
  expect(s.aiIncludeDiary).toBe(true)
  const ai = { provider: 'anthropic' as const, apiKey: 'k', baseUrl: '', model: 'claude-opus-5' }
  await store.set('ai', ai)
  await store.set('persona', { style: 'gaul', name: 'Bro', customInstruction: 'singkat' })
  expect(await store.getAll()).toMatchObject({ ai, persona: { style: 'gaul', name: 'Bro' } })
})

test('memory and summary settings have defaults', async () => {
  expect(await store.getAll()).toMatchObject({ aiMemoryEnabled: true, aiSummariesEnabled: true, memoryCursor: 0 })
  await store.set('memoryCursor', 1234)
  expect((await store.getAll()).memoryCursor).toBe(1234)
})
