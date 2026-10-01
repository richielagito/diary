import { useTranslation } from 'react-i18next'

export function UnavailableScreen() {
  const { t } = useTranslation()
  return (
    <main className="unavailable">
      <h1>{t('unavailable.title')}</h1>
      <p>{t('unavailable.body')}</p>
    </main>
  )
}
