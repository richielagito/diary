/** AI tags first, then local ones: those that continue `prefix`, are not equal to it, not already on the entry, no duplicates. */
export function mergeTagSuggestions(
  prefix: string,
  ai: readonly string[],
  local: readonly string[],
  existing: readonly string[],
  max = 3,
): string[] {
  const p = prefix.toLowerCase()
  const skip = new Set(existing.map((t) => t.toLowerCase()))
  const out: string[] = []
  for (const tag of [...ai, ...local]) {
    if (!tag.startsWith(p) || tag === p || skip.has(tag) || out.includes(tag)) continue
    out.push(tag)
    if (out.length === max) break
  }
  return out
}
