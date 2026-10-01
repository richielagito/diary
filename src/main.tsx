import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createProvider } from './ai/provider/createProvider'
import { App } from './app/App'
import { openDatabase, requestPersist } from './app/bootstrap'
import { RepoProvider } from './app/RepoContext'
import { UnavailableScreen } from './app/UnavailableScreen'
import { initI18n } from './i18n'
import { DexieChatRepository } from './storage/DexieChatRepository'
import { DiaryDB } from './storage/db'
import { DexieDiaryRepository } from './storage/DexieDiaryRepository'
import { DexieLetterRepository } from './storage/DexieLetterRepository'
import { DexieMemoryRepository } from './storage/DexieMemoryRepository'
import { DexieSettingsStore } from './storage/DexieSettingsStore'
import { DexieSummaryRepository } from './storage/DexieSummaryRepository'
import { defaultSettings } from './storage/SettingsStore'
import './styles.css'

async function start() {
  const root = createRoot(document.getElementById('root')!)
  const defaults = defaultSettings(navigator.language)
  const db = new DiaryDB()

  if (!(await openDatabase(db))) {
    await initI18n(defaults.language)
    root.render(<UnavailableScreen />)
    return
  }

  const settingsStore = new DexieSettingsStore(db, defaults)
  const diary = new DexieDiaryRepository(db)
  const chats = new DexieChatRepository(db)
  const memories = new DexieMemoryRepository(db)
  const summaries = new DexieSummaryRepository(db)
  const letters = new DexieLetterRepository(db)
  await initI18n((await settingsStore.getAll()).language)
  void requestPersist(settingsStore)

  root.render(
    <StrictMode>
      <RepoProvider
        diary={diary}
        settingsStore={settingsStore}
        chats={chats}
        memories={memories}
        summaries={summaries}
        letters={letters}
        createProvider={(config) => createProvider(config)}
      >
        <App />
      </RepoProvider>
    </StrictMode>,
  )
}

void start()
