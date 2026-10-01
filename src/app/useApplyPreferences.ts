import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from './RepoContext'

/** Terapkan tema dan bahasa dari pengaturan ke dokumen (dipakai Layout dan halaman Wrapped). */
export function useApplyPreferences() {
  const { i18n } = useTranslation()
  const { theme, language } = useSettings()

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language)
    document.documentElement.lang = language
  }, [i18n, language])
}
