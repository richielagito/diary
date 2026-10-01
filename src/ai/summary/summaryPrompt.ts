import { buildDiaryContext } from '../prompt/diaryContext'
import type { DayEntry, Mood } from '../../domain/types'
import type { Language } from '../../storage/SettingsStore'
import type { Period } from './periods'

export const WEEK_ENTRY_CHARS = 1500
export const MONTH_ENTRY_CHARS = 600

export function buildSummarySystemPrompt(language: Language): string {
  return [
    'You summarize a period of a private diary so that a companion AI can remember it later.',
    'Write 3 to 6 sentences covering the important events, the people mentioned, and how the mood changed over the period. Do not judge, give advice, or quote long passages.',
    `Write in ${language === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English'}. Reply with only the summary text.`,
  ].join('\n\n')
}

export function buildSummaryUserPrompt(period: Period, entries: DayEntry[], moodLabel: (m: Mood) => string): string {
  const label = period.kind === 'week' ? 'Week' : 'Month'
  const limit = period.kind === 'week' ? WEEK_ENTRY_CHARS : MONTH_ENTRY_CHARS
  return `${label} from ${period.start} to ${period.end}. Diary entries:\n\n${buildDiaryContext(entries, moodLabel, limit)}`
}
