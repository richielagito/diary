import { buildDiaryContext } from '../prompt/diaryContext'
import type { DayEntry, Mood } from '../../domain/types'
import type { Memory } from '../../storage/MemoryRepository'
import type { Summary } from '../../storage/SummaryRepository'
import type { Scored } from './relevance'

export const CONTEXT_BUDGET = 24000
export const MONTH_SUMMARY_LIMIT = 3
export const WEEK_SUMMARY_LIMIT = 4

export interface ChatContextInput {
  memories: Memory[]
  summaries: Summary[]
  recent: DayEntry[]
  relevant: Scored[]
  moodLabel: (m: Mood) => string
}

export interface ContextCounts {
  memories: number
  summaries: number
  recent: number
  relevant: number
}

export interface ChatContext {
  memories: string
  summaries: string
  recent: string
  relevant: string
  counts: ContextCounts
}

const byStart = (a: Summary, b: Summary) => a.periodStart.localeCompare(b.periodStart)

function renderSummaries(summaries: Summary[]): string {
  return [...summaries]
    .sort(byStart)
    .map((s) => `### ${s.kind === 'week' ? 'Week' : 'Month'} from ${s.periodStart}\n${s.text}`)
    .join('\n\n')
}

/** Rakit bagian konteks chat. Ringkasan, diary terbaru, dan entri relevan dibatasi CONTEXT_BUDGET karakter. */
export function buildChatContext({ memories, summaries, recent, relevant, moodLabel }: ChatContextInput): ChatContext {
  let months = summaries.filter((s) => s.kind === 'month').sort(byStart).slice(-MONTH_SUMMARY_LIMIT)
  let weeks = summaries.filter((s) => s.kind === 'week').sort(byStart).slice(-WEEK_SUMMARY_LIMIT)
  let recentLeft = [...recent].sort((a, b) => a.date.localeCompare(b.date))
  let relevantLeft = [...relevant].sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))

  const render = () => ({
    summaries: renderSummaries([...months, ...weeks]),
    recent: buildDiaryContext(recentLeft, moodLabel),
    relevant: buildDiaryContext(
      relevantLeft.map((r) => r.entry),
      moodLabel,
    ),
  })
  let parts = render()
  const size = () => parts.summaries.length + parts.recent.length + parts.relevant.length
  while (size() > CONTEXT_BUDGET) {
    if (relevantLeft.length) relevantLeft = relevantLeft.slice(0, -1)
    else if (weeks.length) weeks = weeks.slice(1)
    else if (months.length) months = months.slice(1)
    else if (recentLeft.length) recentLeft = recentLeft.slice(1)
    else break
    parts = render()
  }

  return {
    memories: memories.map((m) => `- ${m.text}`).join('\n'),
    ...parts,
    counts: {
      memories: memories.length,
      summaries: months.length + weeks.length,
      recent: recentLeft.length,
      relevant: relevantLeft.length,
    },
  }
}
