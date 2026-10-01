import { buildChatContext, type ContextCounts } from '../../ai/context/chatContext'
import { pickRelevant, type Scored } from '../../ai/context/relevance'
import { diaryContextRange } from '../../ai/prompt/diaryContext'
import { buildRelevantContext, buildSystemPrompt } from '../../ai/prompt/systemPrompt'
import { addDays, completedPeriods } from '../../ai/summary/periods'
import { dateKey } from '../../domain/date'
import type { DateKey, Mood } from '../../domain/types'
import type { DiaryRepository } from '../../storage/DiaryRepository'
import type { MemoryRepository } from '../../storage/MemoryRepository'
import type { Settings } from '../../storage/SettingsStore'
import type { SummaryRepository } from '../../storage/SummaryRepository'

const RELEVANT_LOOKBACK_DAYS = 365

export async function loadChatPrompt(deps: {
  diary: DiaryRepository
  memories: MemoryRepository
  summaries: SummaryRepository
  settings: Settings
  moodLabel: (m: Mood) => string
  date: DateKey
  latestUserText?: string
}): Promise<{ system: string; context: string; counts: ContextCounts }> {
  const { diary, memories, summaries, settings, moodLabel, date, latestUserText = '' } = deps
  const include = settings.aiIncludeDiary
  const range = diaryContextRange(date)

  const memoryList = settings.aiMemoryEnabled ? await memories.list() : []
  const recent = include ? await diary.list(range) : []
  const inWindow = new Set(completedPeriods(date).map((p) => p.id))
  const summaryList = include && settings.aiSummariesEnabled ? (await summaries.list()).filter((s) => inWindow.has(s.id)) : []
  let relevant: Scored[] = []
  if (include && latestUserText.trim()) {
    const older = await diary.list({ from: addDays(date, -RELEVANT_LOOKBACK_DAYS), to: addDays(range.from, -1) })
    relevant = pickRelevant(older, latestUserText)
  }

  const ctx = buildChatContext({ memories: memoryList, summaries: summaryList, recent, relevant, moodLabel })
  const system = buildSystemPrompt({
    persona: settings.persona,
    language: settings.language,
    today: dateKey(),
    conversationDate: date,
    memories: ctx.memories,
    summaries: ctx.summaries,
    diaryContext: ctx.recent,
  })
  return { system, context: buildRelevantContext(ctx.relevant), counts: ctx.counts }
}
