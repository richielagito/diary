import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { MOOD_EMOJI, MOODS, type Mood } from '../../domain/types'

export function MoodPicker({ value, onChange, past = false }: { value: Mood | null; onChange: (m: Mood | null) => void; past?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="mood-row">
      <div className="mood-picker" role="group" aria-label={t(past ? 'day.moodLabelPast' : 'day.moodLabel')}>
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            aria-label={t(`mood.${m}`)}
            title={t(`mood.${m}`)}
            aria-pressed={value === m}
            onClick={() => onChange(value === m ? null : m)}
            style={{ '--mood': `var(--mood-${m})` } as CSSProperties}
          >
            {MOOD_EMOJI[m]}
          </button>
        ))}
      </div>
      {/* The emoji alone do not say which is which: the chosen one is named, and clearing is a visible word. */}
      {value ? (
        <p className="mood-caption">
          <span aria-hidden="true">{t(`mood.${value}`)}</span>
          <button type="button" className="quiet" onClick={() => onChange(null)}>
            {t('day.clearMood')}
          </button>
        </p>
      ) : (
        <p className="mood-caption">{t(past ? 'day.moodPromptPast' : 'day.moodPrompt')}</p>
      )}
    </div>
  )
}
