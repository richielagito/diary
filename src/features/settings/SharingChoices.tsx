import { useTranslation } from 'react-i18next'
import { useRepos, useSettings } from '../../app/RepoContext'

/**
 * Asked once, right after AI is first connected: each way the diary can reach the provider, named and switchable,
 * so setting up Curhat never silently means sharing the diary.
 */
export function SharingChoices({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const { settingsStore } = useRepos()
  const settings = useSettings()

  const setMemory = async (enabled: boolean) => {
    // Chats written while memory was off must not be extracted once it is turned on: move the cursor first.
    if (enabled && !settings.aiMemoryEnabled) await settingsStore.set('memoryCursor', Date.now())
    await settingsStore.set('aiMemoryEnabled', enabled)
  }

  const choices = [
    { key: 'diary', label: t('chat.includeDiary'), checked: settings.aiIncludeDiary, set: (v: boolean) => settingsStore.set('aiIncludeDiary', v) },
    { key: 'tags', label: t('aiSettings.tagSuggest'), checked: settings.aiTagSuggest, set: (v: boolean) => settingsStore.set('aiTagSuggest', v) },
    { key: 'memory', label: t('memory.enable'), checked: settings.aiMemoryEnabled, set: setMemory },
    { key: 'summaries', label: t('memory.enableSummaries'), checked: settings.aiSummariesEnabled, set: (v: boolean) => settingsStore.set('aiSummariesEnabled', v) },
  ]

  return (
    <fieldset className="sharing-choices">
      <legend>{t('aiSettings.sharingTitle')}</legend>
      <p>{t('aiSettings.sharingIntro')}</p>
      {choices.map((c) => (
        <label key={c.key}>
          <input type="checkbox" checked={c.checked} onChange={(e) => void c.set(e.target.checked)} />
          {c.label}
        </label>
      ))}
      <p>
        <button type="button" className="primary" onClick={onDone}>
          {t('aiSettings.sharingDone')}
        </button>
      </p>
    </fieldset>
  )
}
