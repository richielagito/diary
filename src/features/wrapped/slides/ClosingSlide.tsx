import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { MOOD_EMOJI, MOODS_SHOWN } from '../../../domain/types'
import type { PeriodStats } from '../../../stats/computeStats'
import { periodId } from '../../../stats/range'
import { formatNumber, periodLabel } from '../../stats/format'
import { renderShareCard, type ShareCardData } from '../shareCard'
import { shareImage } from '../shareImage'

export function ClosingSlide({ stats }: { stats: PeriodStats }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const data: ShareCardData = {
        periodLabel: periodLabel(stats.period, lang),
        subtitle: stats.range.isCurrent ? t('wrapped.soFar') : '',
        stats: [
          { label: t('stats.daysWritten'), value: formatNumber(stats.daysWritten, lang) },
          { label: t('wrapped.shareWords'), value: formatNumber(stats.totalWords, lang) },
          { label: t('stats.longestStreak'), value: t('stats.streakDays', { count: stats.longestStreak }) },
        ],
        distribution: stats.mood.distribution,
        heatmap: stats.heatmap,
        weeks: stats.weeks,
        mode: stats.period.kind,
        topTags: stats.tags.top.slice(0, 3).map((x) => x.tag),
        appName: 'Diary',
      }
      const blob = await renderShareCard(data)
      await shareImage(new File([blob], `diary-wrapped-${periodId(stats.period)}.png`, { type: 'image/png' }))
    } catch (err) {
      console.error(err)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

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
                {MOOD_EMOJI[m]}
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
      <Link className="slide-close" to="/stats" replace>
        {t('wrapped.close')}
      </Link>
    </div>
  )
}
