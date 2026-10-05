import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { dateKey, parseDateKey } from '../../domain/date'
import { excerpt } from '../../domain/filter'
import { MOOD_EMOJI, type DateKey, type DayEntry } from '../../domain/types'

/**
 * The month read like a table of contents: one line per written day, so a date can be found by what happened on it
 * instead of opening the days one by one.
 */
export function MonthEntries({ entries }: { entries: Map<DateKey, DayEntry> }) {
  const { t, i18n } = useTranslation()
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
  const today = dateKey()
  const days = [...entries.values()].sort((a, b) => a.date.localeCompare(b.date))

  if (days.length === 0) return <p className="month-empty">{t('archive.monthEmpty')}</p>
  return (
    <section className="month-entries" aria-labelledby="month-entries-title">
      <h2 id="month-entries-title">{t('archive.monthEntries', { count: days.length })}</h2>
      <ol>
        {days.map((e) => {
          const day = parseDateKey(e.date)
          // Paragraphs joined by a middle dot, so two thoughts do not run into one sentence.
          const flat = e.markdown.split(/\n\s*\n/).map((p) => excerpt(p, Infinity)).filter(Boolean).join(' · ')
          const text = flat.length > 220 ? flat.slice(0, 220) + '…' : flat
          return (
            <li key={e.date}>
              <Link to={e.date === today ? '/' : `/day/${e.date}`}>
                <span className="entry-date">
                  <span className="entry-day">{day.getDate()}</span>
                  <span className="entry-weekday">{weekday.format(day)}</span>
                </span>
                <span className={text ? 'entry-text' : 'entry-text entry-text--none'}>{text || t('archive.moodOnly')}</span>
                <span className="entry-mood" role="img" aria-label={e.mood ? t(`mood.${e.mood}`) : t('archive.noMood')}>
                  {e.mood ? MOOD_EMOJI[e.mood] : <span className="dot dot-none" />}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
