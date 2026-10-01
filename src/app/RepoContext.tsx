import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CreateProvider } from '../ai/provider/createProvider'
import { listModels as realListModels, type ListModels } from '../ai/provider/listModels'
import type { ChatRepository } from '../storage/ChatRepository'
import type { DiaryRepository } from '../storage/DiaryRepository'
import type { LetterRepository } from '../storage/LetterRepository'
import type { MemoryRepository } from '../storage/MemoryRepository'
import type { Settings, SettingsStore } from '../storage/SettingsStore'
import type { SummaryRepository } from '../storage/SummaryRepository'

interface Repos {
  diary: DiaryRepository
  settingsStore: SettingsStore
  chats: ChatRepository
  memories: MemoryRepository
  summaries: SummaryRepository
  letters: LetterRepository
  createProvider: CreateProvider
  listModels: ListModels
}

type RepoProviderProps = Omit<Repos, 'listModels'> & { listModels?: ListModels; children: ReactNode }

const ReposContext = createContext<Repos | null>(null)
const SettingsContext = createContext<Settings | null>(null)

const defaultListModels: ListModels = (config) => realListModels(config)

export function RepoProvider({
  diary,
  settingsStore,
  chats,
  memories,
  summaries,
  letters,
  createProvider,
  listModels = defaultListModels,
  children,
}: RepoProviderProps) {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => settingsStore.watchAll(setSettings), [settingsStore])
  const repos = useMemo(
    () => ({ diary, settingsStore, chats, memories, summaries, letters, createProvider, listModels }),
    [diary, settingsStore, chats, memories, summaries, letters, createProvider, listModels],
  )
  if (!settings) return null
  return (
    <ReposContext.Provider value={repos}>
      <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
    </ReposContext.Provider>
  )
}

export function useRepos(): Repos {
  const r = useContext(ReposContext)
  if (!r) throw new Error('useRepos outside RepoProvider')
  return r
}

export function useSettings(): Settings {
  const s = useContext(SettingsContext)
  if (!s) throw new Error('useSettings outside RepoProvider')
  return s
}
