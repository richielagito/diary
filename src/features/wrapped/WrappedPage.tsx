import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { buildLetterInput } from '../../ai/letter/letterInput'
import { useRepos, useSettings } from '../../app/RepoContext'
import { dateKey } from '../../domain/date'
import { MOODS, type DayEntry, type Mood } from '../../domain/types'
import { Close } from '../../app/icons'
import type { Memory } from '../../storage/MemoryRepository'
import type { Summary } from '../../storage/SummaryRepository'
import { computeStats, type PeriodStats } from '../../stats/computeStats'
import type { StatsPeriod } from '../../stats/range'
import { ClosingSlide } from './slides/ClosingSlide'
import { EmptySlide } from './slides/EmptySlide'
import { LetterSlide } from './slides/LetterSlide'
import { MoodSlide } from './slides/MoodSlide'
import { OpeningSlide } from './slides/OpeningSlide'
import { TagSlide } from './slides/TagSlide'
import { useSlideNav } from './useSlideNav'

export type SlideId = 'opening' | 'mood' | 'tags' | 'letter' | 'closing' | 'empty'

export function buildSlides(stats: PeriodStats, letterAvailable: boolean): SlideId[] {
  if (stats.daysWritten === 0) return ['empty']
  const slides: SlideId[] = ['opening']
  if (stats.mood.count > 0) slides.push('mood')
  if (stats.tags.top.length > 0) slides.push('tags')
  if (letterAvailable) slides.push('letter')
  slides.push('closing')
  return slides
}

/**
 * Latar Wrapped: dua mood yang paling sering muncul di periode ini. Mood netral (3) hanya dipakai
 * kalau tidak ada yang lain, supaya warnanya berasal dari perasaan yang benar-benar terasa.
 */
export function moodWash(distribution: Record<Mood, number>): CSSProperties {
  const [a, b] = MOODS.filter((m) => m !== 3 && distribution[m] > 0).sort((x, y) => distribution[y] - distribution[x])
  const color = (m: Mood | undefined) => `var(--mood-${m ?? 3})`
  return { '--wrap-a': color(a), '--wrap-b': color(b ?? a) } as CSSProperties
}

export function WrappedPage({ period }: { period: StatsPeriod }) {
  const { t } = useTranslation()
  const { diary, memories, summaries } = useRepos()
  const settings = useSettings()
  const navigate = useNavigate()
  const [today] = useState(() => dateKey())
  const [entries, setEntries] = useState<DayEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [letterData, setLetterData] = useState<{ memories: Memory[]; summaries: Summary[] } | null>(null)
  const letterAvailable = settings.ai !== null && settings.aiIncludeDiary

  useEffect(() => {
    let cancelled = false
    diary.list().then(
      (list) => {
        if (!cancelled) setEntries(list)
      },
      (err: unknown) => {
        console.error(err)
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [diary])

  // Surat opsional: kalau memori/ringkasan gagal dimuat, dianggap kosong dan Wrapped tetap jalan.
  useEffect(() => {
    if (!letterAvailable) return
    let cancelled = false
    const orEmpty = <T,>(p: Promise<T[]>) =>
      p.catch((err: unknown) => {
        console.error(err)
        return [] as T[]
      })
    void Promise.all([orEmpty(memories.list()), orEmpty(summaries.list())]).then(([m, s]) => {
      if (!cancelled) setLetterData({ memories: m, summaries: s })
    })
    return () => {
      cancelled = true
    }
  }, [letterAvailable, memories, summaries])

  const stats = useMemo(() => (entries ? computeStats(entries, period, today) : null), [entries, period, today])
  const letterInput = useMemo(
    () =>
      stats && letterData
        ? buildLetterInput({
            stats,
            language: settings.language,
            persona: settings.persona,
            memories: letterData.memories,
            summaries: letterData.summaries,
            memoryEnabled: settings.aiMemoryEnabled,
            summariesEnabled: settings.aiSummariesEnabled,
          })
        : null,
    [stats, letterData, settings.language, settings.persona, settings.aiMemoryEnabled, settings.aiSummariesEnabled],
  )
  const slides = useMemo(() => (stats ? buildSlides(stats, letterAvailable) : []), [stats, letterAvailable])
  // Tutup memakai replace supaya tombol Back tidak membuka Wrapped lagi
  const { index, next, prev, bind } = useSlideNav(slides.length, () => navigate('/stats', { replace: true }))

  if (failed) {
    return (
      <div className="wrapped">
        <section className="slide">
          <div className="slide-body">
            <p role="alert" className="slide-lead">
              {t('wrapped.loadFailed')}
            </p>
            <Link className="slide-close" to="/stats" replace>
              {t('wrapped.close')}
            </Link>
          </div>
        </section>
      </div>
    )
  }
  if (!stats) return null
  const current = slides[index]

  return (
    <div className="wrapped" style={moodWash(stats.mood.distribution)} {...bind}>
      <div className="wrapped-progress" aria-hidden="true">
        {slides.map((id, i) => (
          <span key={id} className={i <= index ? 'filled' : undefined} />
        ))}
      </div>
      <Link className="wrapped-x icon-btn" to="/stats" replace aria-label={t('wrapped.close')}>
        <Close />
      </Link>
      <button type="button" className="sr-only-focusable" onClick={prev}>
        {t('wrapped.previous')}
      </button>
      <button type="button" className="sr-only-focusable" onClick={next}>
        {t('wrapped.next')}
      </button>
      <section
        key={current}
        className="slide slide-in"
        role="group"
        aria-roledescription={t('wrapped.slide')}
        aria-label={t('wrapped.slideOf', { n: index + 1, total: slides.length })}
      >
        {current === 'opening' && <OpeningSlide stats={stats} />}
        {current === 'mood' && <MoodSlide stats={stats} />}
        {current === 'tags' && <TagSlide stats={stats} />}
        {current === 'letter' && letterInput && settings.ai && <LetterSlide input={letterInput} ai={settings.ai} />}
        {current === 'closing' && <ClosingSlide stats={stats} />}
        {current === 'empty' && <EmptySlide />}
      </section>
    </div>
  )
}
