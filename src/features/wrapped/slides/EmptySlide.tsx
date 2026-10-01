import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export function EmptySlide() {
  const { t } = useTranslation()
  return (
    <div className="slide-body">
      <p className="slide-lead">{t('wrapped.empty')}</p>
      <Link className="wrapped-link" to="/">
        {t('wrapped.writeToday')}
      </Link>
      <Link className="slide-close" to="/stats" replace>
        {t('wrapped.close')}
      </Link>
    </div>
  )
}
