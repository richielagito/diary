export type DateKey = string
export type Mood = 1 | 2 | 3 | 4 | 5

export const MOODS: readonly Mood[] = [1, 2, 3, 4, 5]
export const MOOD_EMOJI: Record<Mood, string> = { 1: '😢', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }

export interface DayEntry {
  date: DateKey
  markdown: string
  mood: Mood | null
  tags: string[]
  wordCount: number
  createdAt: number
  updatedAt: number
}

export type EntryInput = Pick<DayEntry, 'date' | 'markdown' | 'mood' | 'createdAt' | 'updatedAt'>

export function isMood(v: unknown): v is Mood {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}
