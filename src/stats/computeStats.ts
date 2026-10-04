import { weekStart } from '../ai/summary/periods'
import { addDays, dateKey } from '../domain/date'
import type { DateKey, DayEntry, Mood } from '../domain/types'
import { periodRange, type PeriodRange, type StatsPeriod } from './range'
import { currentStreak, longestStreak } from './streaks'
import { moodLiftTags, newTags, topTags } from './tagStats'
import { wordLevel, wordThresholds, type WordLevel } from './wordLevels'

export interface HeatCell {
  date: DateKey
  inRange: boolean // false = sel padding di luar periode
  future: boolean // date > today
  entry: { mood: Mood | null; words: number; level: WordLevel } | null // null: tanpa entri, masa depan, atau di luar periode
}
export interface TrendPoint {
  key: string
  from: DateKey
  to: DateKey
  average: number | null
  count: number
}
export interface PeriodStats {
  period: StatsPeriod
  range: PeriodRange
  daysWritten: number
  writtenRatio: number // elapsedDays === 0 ? 0 : daysWritten / elapsedDays
  totalWords: number
  currentStreak: number // atas SEMUA entri sampai hari ini
  longestStreak: number // runtun yang menyentuh [from, elapsedTo], panjangnya dihitung utuh
  mood: {
    count: number
    average: number | null
    distribution: Record<Mood, number>
    trend: TrendPoint[]
    brightest: string | null // kunci bulan 'YYYY-MM', hanya periode tahun
    heaviest: string | null
  }
  tags: {
    top: { tag: string; days: number }[]
    moodLift: { tag: string; lift: number; days: number }[]
    fresh: string[]
  }
  heatmap: HeatCell[] // kolom demi kolom: tiap 7 sel berurutan = satu minggu Senin..Minggu
  weeks: number // heatmap.length / 7
}

function trendPoint(key: string, from: DateKey, to: DateKey, inPeriod: DayEntry[]): TrendPoint {
  const moods = inPeriod.filter((e) => e.date >= from && e.date <= to && e.mood !== null).map((e) => e.mood as number)
  const average = moods.length === 0 ? null : moods.reduce((s, m) => s + m, 0) / moods.length
  return { key, from, to, average, count: moods.length }
}

function buildTrend(period: StatsPeriod, range: PeriodRange, inPeriod: DayEntry[]): TrendPoint[] {
  const points: TrendPoint[] = []
  if (period.kind === 'month') {
    for (let monday = weekStart(range.from); monday <= range.to; monday = addDays(monday, 7)) {
      const from = monday < range.from ? range.from : monday
      const sunday = addDays(monday, 6)
      const to = sunday > range.to ? range.to : sunday
      if (from <= range.elapsedTo) points.push(trendPoint(monday, from, to, inPeriod))
    }
  } else {
    for (let m = 1; m <= 12; m++) {
      const from = dateKey(new Date(period.year, m - 1, 1))
      if (from > range.elapsedTo) break
      const to = dateKey(new Date(period.year, m, 0))
      points.push(trendPoint(`${period.year}-${String(m).padStart(2, '0')}`, from, to, inPeriod))
    }
  }
  return points
}

export function computeStats(allEntries: DayEntry[], period: StatsPeriod, today: DateKey): PeriodStats {
  const sorted = [...allEntries].sort((a, b) => a.date.localeCompare(b.date))
  const range = periodRange(period, today)
  const upToToday = sorted.filter((e) => e.date <= today)
  const inPeriod = sorted.filter((e) => e.date >= range.from && e.date <= range.elapsedTo)
  const thresholds = wordThresholds(upToToday.map((e) => e.wordCount))

  const distribution: Record<Mood, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let moodSum = 0
  let moodCount = 0
  for (const e of inPeriod) {
    if (e.mood === null) continue
    distribution[e.mood]++
    moodSum += e.mood
    moodCount++
  }

  const trend = buildTrend(period, range, inPeriod)
  let brightest: string | null = null
  let heaviest: string | null = null
  if (period.kind === 'year') {
    const eligible = trend.filter((p) => p.count >= 3)
    if (eligible.length >= 2) {
      let hi = eligible[0]
      let lo = eligible[0]
      for (const p of eligible) {
        if ((p.average as number) > (hi.average as number)) hi = p
        if ((p.average as number) < (lo.average as number)) lo = p
      }
      // Rata-rata seri (termasuk hi dan lo bulan yang sama): tidak ada yang menonjol
      if ((hi.average as number) > (lo.average as number)) {
        brightest = hi.key
        heaviest = lo.key
      }
    }
  }

  const byDate = new Map(inPeriod.map((e) => [e.date, e]))
  const heatmap: HeatCell[] = []
  const gridEnd = addDays(weekStart(range.to), 6)
  for (let d = weekStart(range.from); d <= gridEnd; d = addDays(d, 1)) {
    const e = byDate.get(d)
    heatmap.push({
      date: d,
      inRange: d >= range.from && d <= range.to,
      future: d > today,
      entry: e ? { mood: e.mood, words: e.wordCount, level: wordLevel(e.wordCount, thresholds) } : null,
    })
  }

  const daysWritten = inPeriod.length
  return {
    period,
    range,
    daysWritten,
    writtenRatio: range.elapsedDays === 0 ? 0 : daysWritten / range.elapsedDays,
    totalWords: inPeriod.reduce((s, e) => s + e.wordCount, 0),
    currentStreak: currentStreak(upToToday.map((e) => e.date), today),
    longestStreak: longestStreak(upToToday.map((e) => e.date), { from: range.from, to: range.elapsedTo }),
    mood: {
      count: moodCount,
      average: moodCount === 0 ? null : moodSum / moodCount,
      distribution,
      trend,
      brightest,
      heaviest,
    },
    tags: {
      top: topTags(inPeriod),
      moodLift: moodLiftTags(inPeriod),
      fresh: newTags(sorted, range.from, range.elapsedTo),
    },
    heatmap,
    weeks: heatmap.length / 7,
  }
}
