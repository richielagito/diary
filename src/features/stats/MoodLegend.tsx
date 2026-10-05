import { useTranslation } from 'react-i18next'
import { MOODS_SHOWN } from '../../domain/types'

/** The key to the mood colours, wherever mood is drawn as colour: heatmaps and the Archive calendar. */
export function MoodLegend({ note }: { note?: string }) {
  const { t } = useTranslation()
  return (
    <div className="heat-legend">
      {MOODS_SHOWN.map((m) => (
        <span key={m}>
          <span className="swatch" style={{ background: `var(--mood-${m})` }} />
          {t(`mood.${m}`)}
        </span>
      ))}
      <span>
        <span className="swatch swatch-none" />
        {t('stats.noMood')}
      </span>
      {note && <span>{note}</span>}
    </div>
  )
}
