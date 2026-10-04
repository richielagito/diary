import { useTranslation } from 'react-i18next'
import type { PeriodStats } from '../../../stats/computeStats'
import { formatNumber, periodLabel } from '../../stats/format'

export function OpeningSlide({ stats }: { stats: PeriodStats }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const key = stats.period.kind === 'year' ? 'wrapped.openingYear' : 'wrapped.openingMonth'
  const title = t(key, { count: stats.daysWritten, period: periodLabel(stats.period, lang), days: formatNumber(stats.daysWritten, lang) })
  return (
    <div className="slide-body">
      {/* "So far" qualifies the title, so it is said quietly beside it rather than in display size. */}
      <h1 className="slide-title">
        {title}
        {stats.range.isCurrent && (
          <>
            {' '}
            <span className="slide-title-note">{t('wrapped.soFar')}</span>
          </>
        )}
      </h1>
      <p className="slide-lead">{t('wrapped.totalWords', { count: stats.totalWords, words: formatNumber(stats.totalWords, lang) })}</p>
      <p className="slide-lead">{t('wrapped.longestStreak', { count: stats.longestStreak })}</p>
    </div>
  )
}
