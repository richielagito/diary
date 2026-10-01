import type { DateKey, DayEntry } from '../domain/types'

// Lift ditampilkan 1 desimal; di bawah ini tampil sebagai "+0,0"
const MIN_LIFT = 0.05

export function topTags(entries: DayEntry[], limit = 5): { tag: string; days: number }[] {
  const counts = new Map<string, number>()
  for (const e of entries) for (const tag of e.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts]
    .map(([tag, days]) => ({ tag, days }))
    .sort((a, b) => b.days - a.days || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}

/** Tag yang rata-rata mood-nya di atas rata-rata keseluruhan (min. 3 hari bermood, lift >= 0,05). */
export function moodLiftTags(entries: DayEntry[], limit = 3): { tag: string; lift: number; days: number }[] {
  const moods = entries.filter((e) => e.mood !== null)
  if (moods.length === 0) return []
  const overall = moods.reduce((s, e) => s + (e.mood as number), 0) / moods.length
  const per = new Map<string, { sum: number; days: number }>()
  for (const e of moods) {
    for (const tag of e.tags) {
      const cur = per.get(tag) ?? { sum: 0, days: 0 }
      cur.sum += e.mood as number
      cur.days++
      per.set(tag, cur)
    }
  }
  return [...per]
    .filter(([, v]) => v.days >= 3)
    .map(([tag, v]) => ({ tag, lift: v.sum / v.days - overall, days: v.days }))
    .filter((t) => t.lift >= MIN_LIFT)
    .sort((a, b) => b.lift - a.lift || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}

/** Tag yang pertama kali muncul di [from, to], menurut seluruh entri. */
export function newTags(allEntries: DayEntry[], from: DateKey, to: DateKey, limit = 5): string[] {
  const first = new Map<string, DateKey>()
  for (const e of [...allEntries].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const tag of e.tags) if (!first.has(tag)) first.set(tag, e.date)
  }
  return [...first]
    .filter(([, d]) => d >= from && d <= to)
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
    .slice(0, limit)
}
