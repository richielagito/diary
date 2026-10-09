import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { MOOD_EMOJI, MOODS_SHOWN } from '../../../domain/types'
import type { PeriodStats } from '../../../stats/computeStats'
import { periodId } from '../../../stats/range'
import { periodLabel } from '../../stats/format'
import { useShareCard } from '../useShareCard'

export function ClosingSlide({ stats }: { stats: PeriodStats }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { busy, failed, save } = useShareCard(stats)

  const dist = stats.mood.distribution
  const moods = MOODS_SHOWN.filter((m) => dist[m] > 0)
  return (
    <div className="slide-body">
      {/* The ending works without the AI letter: the period's moods as one band of colour, happiest first. */}
      {moods.length > 0 && (
        <>
          <h2 className="slide-title">{t('wrapped.colour', { period: periodLabel(stats.period, lang) })}</h2>
          <div
            className="mood-strip"
            role="img"
            aria-label={moods.map((m) => `${t(`mood.${m}`)} ${t('stats.moodDays', { count: dist[m] })}`).join(', ')}
          >
            {moods.map((m) => (
              <span key={m} style={{ flexGrow: dist[m], background: `var(--mood-${m})` }}>
                {/* A thin band has no room for its face; the strip's label still names it. */}
                {dist[m] / stats.mood.count >= 0.1 && MOOD_EMOJI[m]}
              </span>
            ))}
          </div>
        </>
      )}
      <p className="slide-lead">{t('wrapped.thanks')}</p>
      <button type="button" className="wrapped-link" disabled={busy} onClick={() => void save()}>
        {t('wrapped.saveImage')}
      </button>
      {failed && <p role="alert">{t('wrapped.saveFailed')}</p>}
      <Link className="slide-close" to={`/stats?p=${periodId(stats.period)}`} replace>
        {t('wrapped.close')}
      </Link>
    </div>
  )
}
