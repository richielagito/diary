import { completeText } from '../provider/completeText'
import type { ChatProvider } from '../provider/types'
import type { DateKey, DayEntry, Mood } from '../../domain/types'
import type { DiaryRepository } from '../../storage/DiaryRepository'
import type { Language } from '../../storage/SettingsStore'
import type { Summary, SummaryRepository } from '../../storage/SummaryRepository'
import { completedPeriods } from './periods'
import { buildSummarySystemPrompt, buildSummaryUserPrompt } from './summaryPrompt'

export interface MaintainDeps {
  diary: DiaryRepository
  summaries: SummaryRepository
  provider: ChatProvider
  language: Language
  moodLabel: (m: Mood) => string
  today: DateKey
  limit?: number
  now?: () => number
}

const maxUpdated = (entries: DayEntry[]) => Math.max(0, ...entries.map((e) => e.updatedAt))

export function isStale(summary: Summary | undefined, entries: DayEntry[]): boolean {
  if (!summary) return true
  if (summary.entryCount !== entries.length) return true
  return maxUpdated(entries) !== summary.sourceUpdatedAt
}

let running = false

/** Buat atau perbarui ringkasan periode yang sudah selesai; paling banyak `limit` per panggilan. */
export async function maintainSummaries(deps: MaintainDeps): Promise<number> {
  if (running) return 0
  running = true
  try {
    const limit = deps.limit ?? 2
    let made = 0
    const periods = completedPeriods(deps.today)
    // Ringkasan di luar jendela periode tidak pernah dikirim lagi; buang supaya tidak menumpuk.
    const inWindow = new Set(periods.map((p) => p.id))
    for (const s of await deps.summaries.list()) {
      if (!inWindow.has(s.id)) await deps.summaries.remove(s.id)
    }
    for (const period of periods) {
      if (made >= limit) break
      const entries = await deps.diary.list({ from: period.start, to: period.end })
      const existing = await deps.summaries.get(period.id)
      if (entries.length === 0) {
        if (existing) await deps.summaries.remove(period.id)
        continue
      }
      if (!isStale(existing, entries)) continue
      let text: string
      try {
        text = (
          await completeText(deps.provider, {
            system: buildSummarySystemPrompt(deps.language),
            messages: [{ role: 'user', content: buildSummaryUserPrompt(period, entries, deps.moodLabel) }],
          })
        ).trim()
      } catch {
        break // coba lagi lain kali
      }
      if (!text) break
      await deps.summaries.put({
        id: period.id,
        kind: period.kind,
        periodStart: period.start,
        periodEnd: period.end,
        text,
        entryCount: entries.length,
        sourceUpdatedAt: maxUpdated(entries),
        createdAt: (deps.now ?? Date.now)(),
      })
      made++
    }
    return made
  } finally {
    running = false
  }
}
