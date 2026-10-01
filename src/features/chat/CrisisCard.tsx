import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { HELPLINES } from '../../ai/safety/helplines'

export function CrisisCard() {
  const { t, i18n } = useTranslation()
  const titleId = useId()
  const lang = i18n.language === 'en' ? 'en' : 'id'
  return (
    <div className="crisis" role="region" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('crisis.title')}</h2>
      <p>{t('crisis.body')}</p>
      <ul>
        {HELPLINES.map((h) => (
          <li key={h.id}>
            {h.name[lang]}: <a href={h.href}>{h.contact}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
