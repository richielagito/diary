import { useTranslation } from 'react-i18next'
import { formatMood } from './format'

const H = 80
const LABEL_H = 16
const MIN_H = 6
// Lebih dari seminggu titik (tren 12 bulan): batang lebih ramping supaya viewBox sempit
// dan label bulan tetap terbaca (~10px) saat SVG diskalakan ke lebar ponsel.
const WIDE = { bar: 32, gap: 8, font: 10 }
const DENSE = { bar: 20, gap: 6, font: 11 }

/** Tren mood: tinggi batang dari skala 1 (Sedih, batang terendah) sampai 5; null = slot kosong. */
export function MoodBars({ points }: { points: { label: string; average: number | null }[] }) {
  const { t, i18n } = useTranslation()
  const { bar, gap, font } = points.length > 7 ? DENSE : WIDE
  const width = Math.max(points.length, 1) * (bar + gap) - gap
  const summary = points
    .map((p) => `${p.label}: ${p.average === null ? t('stats.noMood').toLowerCase() : formatMood(p.average, i18n.language)}`)
    .join(', ')
  return (
    <svg
      className="mood-bars"
      role="img"
      aria-label={`${t('stats.moodTrend')}: ${summary}`}
      viewBox={`0 0 ${width} ${H + LABEL_H}`}
      preserveAspectRatio="xMinYMid meet"
      style={{ maxWidth: width * 1.5 }}
    >
      {points.map((p, i) => {
        const x = i * (bar + gap)
        // The scale starts at 1, not 0, so the months' differences show instead of every bar standing at 60-80%.
        const h = p.average === null ? 0 : Math.max(MIN_H, ((p.average - 1) / 4) * H)
        const avg = p.average === null ? null : Math.round(p.average)
        return (
          <g key={i}>
            {/* The track is an outline, not a fill: a pale mood bar then stands against the page, not against grey. */}
            <rect x={x + 0.5} y={0.5} width={bar - 1} height={H - 1} rx={4} fill="none" stroke="var(--border)" />
            {avg !== null && <rect x={x} y={H - h} width={bar} height={h} rx={4} fill={`var(--mood-${avg})`} />}
            <text x={x + bar / 2} y={H + 12} textAnchor="middle" fontSize={font} fill="var(--muted)">
              {p.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
