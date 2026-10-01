import { unescapeMarkdown } from './markdownText'
import type { DayEntry } from './types'

export function searchEntries(entries: DayEntry[], query: string): DayEntry[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  return entries
    .filter((entry) => {
      const text = unescapeMarkdown(entry.markdown).toLowerCase()
      return tokens.every((t) => (t.startsWith('#') && t.length > 1 ? entry.tags.includes(t.slice(1)) : text.includes(t)))
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function excerpt(markdown: string, max = 120): string {
  // A single left-to-right pass: an escape pair (backslash + punctuation) is consumed
  // atomically as the literal char, so an escaped-literal backslash can never be mistaken
  // for protecting the delimiter that happens to follow it. An unescaped formatting
  // delimiter is simply dropped. This subsumes unescapeMarkdown, so it isn't called separately.
  const flat = markdown
    .replace(/^\s*(#{1,6}|>+|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\[[ xX]\]\s*/g, '')
    .replace(/\\([!-/:-@[-`{-~])|[*_~`]/g, (_m, escaped: string | undefined) => escaped ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}
