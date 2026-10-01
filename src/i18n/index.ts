import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Language } from '../storage/SettingsStore'
import { en } from './en'
import { id } from './id'

export async function initI18n(lang: Language): Promise<void> {
  if (i18n.isInitialized) {
    await i18n.changeLanguage(lang)
    return
  }
  await i18n.use(initReactI18next).init({
    resources: { id: { translation: id }, en: { translation: en } },
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
}

export { i18n }
