import { monthKeyLabel, periodLabel, trendLabel } from '../../features/stats/format'
import type { Mood } from '../../domain/types'
import type { PeriodStats } from '../../stats/computeStats'
import { periodId } from '../../stats/range'
import type { Language } from '../../storage/SettingsStore'
import type { Memory } from '../../storage/MemoryRepository'
import type { Summary } from '../../storage/SummaryRepository'
import type { PersonaSettings } from '../prompt/persona'

/** Bahan surat Wrapped: hanya statistik, memori, ringkasan bulanan dan persona. Tidak pernah isi entri. */
export interface LetterInput {
  periodId: string
  periodLabel: string
  isCurrent: boolean
  daysWritten: number
  elapsedDays: number
  totalWords: number
  longestStreak: number
  mood: {
    average: number | null
    distribution: Record<Mood, number>
    trend: { label: string; average: number | null }[]
    brightest: string | null
    heaviest: string | null
  }
  tags: {
    top: { tag: string; days: number }[]
    moodLift: { tag: string; lift: number }[]
    fresh: string[]
  }
  memories: string[]
  summaries: { label: string; text: string }[]
  persona: PersonaSettings
  language: Language
}

// Pembulatan menjaga fingerprint tetap stabil terhadap noise floating point.
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

export function buildLetterInput(args: {
  stats: PeriodStats
  language: Language
  persona: PersonaSettings
  memories: Memory[]
  summaries: Summary[]
  memoryEnabled: boolean
  summariesEnabled: boolean
}): LetterInput {
  const { stats, language, persona, memoryEnabled, summariesEnabled } = args
  const { period, range, mood, tags } = stats
  const summaries = summariesEnabled
    ? args.summaries
        .filter((s) => s.kind === 'month' && s.periodStart >= range.from && s.periodStart <= range.to)
        .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
        .map((s) => ({ label: monthKeyLabel(s.periodStart.slice(0, 7), language), text: s.text }))
    : []
  return {
    periodId: periodId(period),
    periodLabel: periodLabel(period, language),
    isCurrent: range.isCurrent,
    daysWritten: stats.daysWritten,
    elapsedDays: range.elapsedDays,
    totalWords: stats.totalWords,
    longestStreak: stats.longestStreak,
    mood: {
      average: mood.average === null ? null : round(mood.average, 2),
      distribution: { ...mood.distribution },
      trend: mood.trend.map((p) => ({
        label: trendLabel(p, 'year', language),
        average: p.average === null ? null : round(p.average, 2),
      })),
      brightest: mood.brightest === null ? null : monthKeyLabel(mood.brightest, language),
      heaviest: mood.heaviest === null ? null : monthKeyLabel(mood.heaviest, language),
    },
    tags: {
      top: tags.top.map(({ tag, days }) => ({ tag, days })),
      moodLift: tags.moodLift.map(({ tag, lift }) => ({ tag, lift: round(lift, 1) })),
      fresh: [...tags.fresh],
    },
    memories: memoryEnabled ? args.memories.map((m) => m.text) : [],
    summaries,
    persona: { ...persona },
    language,
  }
}
