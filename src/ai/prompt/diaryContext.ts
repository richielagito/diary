import { dateKey, parseDateKey } from '../../domain/date'
import { unescapeMarkdown } from '../../domain/markdownText'
import type { DateKey, DayEntry, Mood } from '../../domain/types'

export const DIARY_CONTEXT_DAYS = 7
export const ENTRY_CHAR_LIMIT = 1500

export function diaryContextRange(today: DateKey): { from: DateKey; to: DateKey } {
  const from = parseDateKey(today)
  from.setDate(from.getDate() - (DIARY_CONTEXT_DAYS - 1))
  return { from: dateKey(from), to: today }
}

export function buildDiaryContext(entries: DayEntry[], moodLabel: (m: Mood) => string,
  charLimit = ENTRY_CHAR_LIMIT,
): string {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const heading = e.mood ? `### ${e.date} (mood: ${moodLabel(e.mood)})` : `### ${e.date}`
      const text = unescapeMarkdown(e.markdown).trim()
      const body = text.length > charLimit ? `${text.slice(0, charLimit)}…` : text
      return body ? `${heading}\n${body}` : heading
    })
    .join('\n\n')
}
