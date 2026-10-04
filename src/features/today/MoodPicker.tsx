import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { MOOD_EMOJI, MOODS, type Mood } from '../../domain/types'

export function MoodPicker({ value, onChange, past = false }: { value: Mood | null; onChange: (m: Mood | null) => void; past?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="mood-row">
      {/* Above the faces: first the question they answer, then the name of the chosen one and a visible way to clear it. */}
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
    </div>
  )
}
