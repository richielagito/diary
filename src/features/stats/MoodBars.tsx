import { useTranslation } from 'react-i18next'
import { formatMood } from './format'

const H = 80
const MID = H / 2
const LABEL_H = 16
const MIN_H = 3
// Lebih dari seminggu titik (tren 12 bulan): batang lebih ramping supaya viewBox sempit
// dan label bulan tetap terbaca (~10px) saat SVG diskalakan ke lebar ponsel.
const WIDE = { bar: 32, gap: 8, font: 10 }
const DENSE = { bar: 20, gap: 6, font: 11 }

/**
 * Tren mood, diverging like the palette: the middle line is 3 (Biasa); a bar rises toward 5 or drops toward 1
 * by how far the average sits from it, in the nearest mood's colour. null = slot kosong.
 */
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
      <line x1={0} x2={width} y1={MID} y2={MID} stroke="var(--border-strong)" />
      {points.map((p, i) => {
        const x = i * (bar + gap)
        const h = p.average === null ? 0 : Math.max(MIN_H, (Math.abs(p.average - 3) / 2) * MID)
        const y = p.average !== null && p.average >= 3 ? MID - h : MID
        return (
          <g key={i}>
            {p.average !== null && (
              <rect x={x} y={y} width={bar} height={h} rx={Math.min(2, h / 2)} fill={`var(--mood-${Math.round(p.average)})`} />
            )}
            <text x={x + bar / 2} y={H + 12} textAnchor="middle" fontSize={font} fill="var(--muted)">
              {p.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
