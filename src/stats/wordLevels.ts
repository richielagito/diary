export type WordLevel = 1 | 2 | 3 | 4

/** Opasitas warna per level; satu sumber untuk heatmap di layar (CSS) dan kartu share (canvas). */
export const LEVEL_OPACITY: Record<WordLevel, number> = { 1: 0.35, 2: 0.55, 3: 0.8, 4: 1 }

/** Kuartil jumlah kata; null kalau data terlalu sedikit atau datar. */
export function wordThresholds(counts: number[]): [number, number, number] | null {
  const s = [...counts].sort((a, b) => a - b)
  const n = s.length
  if (n < 4) return null
  const q = (p: number) => s[Math.floor(p * (n - 1))]
  const t: [number, number, number] = [q(0.25), q(0.5), q(0.75)]
  return t[0] === t[2] ? null : t
}

export function wordLevel(words: number, thresholds: [number, number, number] | null): WordLevel {
  if (!thresholds) return 4
  return (1 + thresholds.filter((t) => words > t).length) as WordLevel
}
