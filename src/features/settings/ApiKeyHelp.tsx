import { useTranslation } from 'react-i18next'
import { ChevronRight } from '../../app/icons'

/** Where each provider hands out keys. Ollama runs on the user's own computer and needs none. */
const KEY_PAGES = [
  ['Anthropic (Claude)', 'https://console.anthropic.com/settings/keys'],
  ['OpenAI', 'https://platform.openai.com/api-keys'],
  ['Google Gemini', 'https://aistudio.google.com/apikey'],
  ['OpenRouter', 'https://openrouter.ai/keys'],
] as const

/** What an API key is and where to get one, for people who have never needed one. */
export function ApiKeyHelp() {
  const { t } = useTranslation()
  return (
    <details className="api-key-help">
      <summary>
        <ChevronRight />
        {t('aiSettings.keyHelpTitle')}
      </summary>
      <p>{t('aiSettings.keyHelpWhat')}</p>
      <ul>
        {KEY_PAGES.map(([name, url]) => (
          <li key={name}>
            <a href={url} target="_blank" rel="noreferrer">
              {name}
            </a>
          </li>
        ))}
      </ul>
      <p>{t('aiSettings.keyHelpFree')}</p>
    </details>
  )
}
