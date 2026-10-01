import { unescapeMarkdown } from '../../domain/markdownText'
import type { DayEntry } from '../../domain/types'

const STOPWORDS = new Set([
  // id
  'yang', 'untuk', 'dengan', 'karena', 'tapi', 'juga', 'sudah', 'udah', 'belum', 'akan', 'bisa', 'lagi', 'hari',
  'saja', 'banget', 'sangat', 'dari', 'pada', 'atau', 'kalau', 'dalam', 'seperti', 'sama', 'masih', 'harus',
  'tidak', 'nggak', 'enggak', 'kayak', 'terus', 'sekarang', 'kemarin', 'besok', 'tadi', 'rasanya', 'merasa',
  'sedang', 'bikin', 'jadi', 'buat', 'banyak', 'sekali', 'mereka', 'kamu', 'dia', 'kita', 'kami',
  // en
  'that', 'this', 'with', 'have', 'from', 'they', 'what', 'when', 'your', 'just', 'like', 'about', 'really',
  'feel', 'today', 'been', 'were', 'would', 'there', 'their', 'some', 'because', 'know', 'want', 'very', 'much',
])

export function keywords(text: string): Set<string> {
  const tokens = unescapeMarkdown(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && /\p{L}/u.test(w) && !STOPWORDS.has(w))
  return new Set(tokens)
}

export interface Scored {
  entry: DayEntry
  score: number
}

export function pickRelevant(candidates: DayEntry[], query: string, limit = 3, minScore = 2): Scored[] {
  const wanted = keywords(query)
  if (wanted.size === 0) return []
  return candidates
    .map((entry) => {
      const have = keywords(entry.markdown)
      let score = 0
      for (const w of wanted) if (have.has(w)) score++
      return { entry, score }
    })
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))
    .slice(0, limit)
}
