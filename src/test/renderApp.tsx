import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import type { CreateProvider } from '../ai/provider/createProvider'
import type { ListModels } from '../ai/provider/listModels'
import { AppRoutes } from '../app/App'
import { RepoProvider } from '../app/RepoContext'
import { SyncProvider } from '../app/SyncContext'
import type { DateKey, Mood } from '../domain/types'
import type { NewChatMessage } from '../storage/ChatRepository'
import { DexieChatRepository } from '../storage/DexieChatRepository'
import { DiaryDB } from '../storage/db'
import { DexieDiaryRepository } from '../storage/DexieDiaryRepository'
import { DexieLetterRepository } from '../storage/DexieLetterRepository'
import { DexieMemoryRepository } from '../storage/DexieMemoryRepository'
import { DexieSettingsStore } from '../storage/DexieSettingsStore'
import { DexieSummaryRepository } from '../storage/DexieSummaryRepository'
import type { LetterRecord } from '../storage/LetterRepository'
import { defaultSettings, type Settings } from '../storage/SettingsStore'
import type { Summary } from '../storage/SummaryRepository'
import type { SyncController } from '../sync/controller'

const noProvider: CreateProvider = () => {
  throw new Error('no provider in test')
}

const noListModels: ListModels = () => Promise.reject(new Error('no model list in test'))

export interface RenderOptions {
  createProvider?: CreateProvider
  listModels?: ListModels
  /** Membuat controller sync untuk DB test ini. Tanpa ini aplikasi dirender tanpa akun, seperti build tanpa server. */
  sync?: (db: DiaryDB) => SyncController
}

export interface Seed {
  entries?: { date: DateKey; markdown?: string; mood?: Mood | null }[]
  settings?: Partial<Settings>
  chats?: NewChatMessage[]
  memories?: { text: string; source: 'auto' | 'user' }[]
  summaries?: Summary[]
  letters?: LetterRecord[]
}

/** Render seluruh app di MemoryRouter dengan DB baru yang terisolasi. Seed ditulis sebelum render. */
export async function renderApp(path = '/', seed: Seed = {}, options: RenderOptions = {}) {
  const db = new DiaryDB(`test-${crypto.randomUUID()}`)
  const diary = new DexieDiaryRepository(db)
  const settingsStore = new DexieSettingsStore(db, defaultSettings('id'))
  const chats = new DexieChatRepository(db)
  const memories = new DexieMemoryRepository(db)
  const summaries = new DexieSummaryRepository(db)
  const letters = new DexieLetterRepository(db)
  for (const e of seed.entries ?? []) await diary.save(e.date, { markdown: e.markdown, mood: e.mood })
  for (const [k, v] of Object.entries(seed.settings ?? {})) {
    await settingsStore.set(k as keyof Settings, v as never)
  }
  for (const m of seed.chats ?? []) await chats.add(m)
  for (const [i, m] of (seed.memories ?? []).entries()) await memories.add(m.text, m.source, 1 + i)
  for (const s of seed.summaries ?? []) await summaries.put(s)
  for (const l of seed.letters ?? []) await letters.put(l)
  const sync = options.sync?.(db) ?? null
  await sync?.start()
  const user = userEvent.setup()
  const view = render(
    <SyncProvider controller={sync}>
      <RepoProvider
        diary={diary}
        settingsStore={settingsStore}
        chats={chats}
        memories={memories}
        summaries={summaries}
        letters={letters}
        createProvider={options.createProvider ?? noProvider}
        listModels={options.listModels ?? noListModels}
      >
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </RepoProvider>
    </SyncProvider>,
  )
  return {
    db,
    diary,
    settingsStore,
    chats,
    memories,
    summaries,
    letters,
    user,
    sync,
    unmount: view.unmount,
  }
}

/** Render satu komponen di dalam RepoProvider dengan DB baru yang terisolasi. */
export async function renderWithRepos(ui: ReactElement, seed: Seed = {}, options: RenderOptions = {}) {
  const db = new DiaryDB(`test-${crypto.randomUUID()}`)
  const diary = new DexieDiaryRepository(db)
  const settingsStore = new DexieSettingsStore(db, defaultSettings('id'))
  const chats = new DexieChatRepository(db)
  const memories = new DexieMemoryRepository(db)
  const summaries = new DexieSummaryRepository(db)
  const letters = new DexieLetterRepository(db)
  for (const e of seed.entries ?? []) await diary.save(e.date, { markdown: e.markdown, mood: e.mood })
  for (const [k, v] of Object.entries(seed.settings ?? {})) {
    await settingsStore.set(k as keyof Settings, v as never)
  }
  for (const m of seed.chats ?? []) await chats.add(m)
  for (const [i, m] of (seed.memories ?? []).entries()) await memories.add(m.text, m.source, 1 + i)
  for (const s of seed.summaries ?? []) await summaries.put(s)
  for (const l of seed.letters ?? []) await letters.put(l)
  const sync = options.sync?.(db) ?? null
  await sync?.start()
  const user = userEvent.setup()
  const view = render(
    <SyncProvider controller={sync}>
      <RepoProvider
        diary={diary}
        settingsStore={settingsStore}
        chats={chats}
        memories={memories}
        summaries={summaries}
        letters={letters}
        createProvider={options.createProvider ?? noProvider}
        listModels={options.listModels ?? noListModels}
      >
        {ui}
      </RepoProvider>
    </SyncProvider>,
  )
  return {
    db,
    diary,
    settingsStore,
    chats,
    memories,
    summaries,
    letters,
    user,
    sync,
    unmount: view.unmount,
  }
}
