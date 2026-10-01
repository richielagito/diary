export const TAG_MAX_LENGTH = 30
export const TAG_SUGGESTION_MAX = 3
export const INLINE_TAG_AI_MAX = 5
export const KNOWN_TAGS_MAX = 50

const TAG_SHAPE = /^[\p{L}\p{N}_-]+$/u
const HAS_NON_DIGIT = /[\p{L}_-]/u

/** Lowercase, strip a leading '#', keep only valid tags (max 30 chars); drop duplicates and tags in `existing`; at most `max`. */
export function sanitizeTags(raw: unknown, existing: readonly string[], max = TAG_SUGGESTION_MAX): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set(existing.map((t) => t.toLowerCase()))
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const tag = item.trim().replace(/^#/, '').toLowerCase()
    if (tag.length > TAG_MAX_LENGTH || !TAG_SHAPE.test(tag) || !HAS_NON_DIGIT.test(tag) || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length === max) break
  }
  return out
}

/** Most used tags across entries (ties: alphabetical), at most `limit`. */
export function topTags(entries: readonly { tags: readonly string[] }[], limit = KNOWN_TAGS_MAX): string[] {
  const counts = new Map<string, number>()
  for (const e of entries) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit)
    .map(([t]) => t)
}
