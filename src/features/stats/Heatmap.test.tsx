import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { DayEntry } from '../../domain/types'
import { i18n } from '../../i18n'
import { computeStats } from '../../stats/computeStats'
import { Heatmap, heatCellLabel } from './Heatmap'

function entry(date: string, mood: DayEntry['mood'], wordCount: number): DayEntry {
  return { date, markdown: '', mood, tags: [], wordCount, createdAt: 0, updatedAt: 0 } as DayEntry
}

function renderHeat(
  entries: DayEntry[],
  period: Parameters<typeof computeStats>[1],
  mode: 'month' | 'year',
  compact = false,
  today = '2026-10-10',
) {
  const s = computeStats(entries, period, today)
  return render(
    <MemoryRouter>
      <Heatmap cells={s.heatmap} weeks={s.weeks} mode={mode} compact={compact} scrollToToday={s.range.isCurrent} />
    </MemoryRouter>,
  )
}

afterEach(() => vi.restoreAllMocks())

const month = { kind: 'month', year: 2026, month: 10 } as const

test('month mode: entry, empty past, future and padding cells', () => {
  const { container } = renderHeat([entry('2026-10-05', 4, 320)], month, 'month')
  expect(screen.getByRole('link', { name: /Senin, 5 Oktober 2026: .*Baik, 320 kata/ })).toHaveAttribute(
    'href',
    '/day/2026-10-05',
  )
  expect(screen.getByRole('link', { name: /Kamis, 8 Oktober 2026: tidak menulis/ })).toBeInTheDocument()
  const future = screen.getByRole('img', { name: /20 Oktober 2026: belum terjadi/ })
  expect(future.tagName).not.toBe('A')
  const pads = container.querySelectorAll('.heat-pad')
  expect(pads.length).toBeGreaterThan(0)
  pads.forEach((p) => expect(p).toHaveAttribute('aria-hidden', 'true'))
})

test('English cell label uses the singular for one word', () => {
  const cells = computeStats([entry('2026-10-05', 4, 1), entry('2026-10-06', 4, 2)], month, '2026-10-10').heatmap
  const t = i18n.getFixedT('en')
  expect(heatCellLabel(cells.find((c) => c.date === '2026-10-05')!, t, 'en')).toBe('Monday, October 5, 2026: 🙂 Good, 1 word')
  expect(heatCellLabel(cells.find((c) => c.date === '2026-10-06')!, t, 'en')).toBe('Tuesday, October 6, 2026: 🙂 Good, 2 words')
})

test('year mode renders 12 month labels', () => {
  const { container } = renderHeat([], { kind: 'year', year: 2026 }, 'year')
  expect(container.querySelectorAll('.heat-month')).toHaveLength(12)
})

test('compact renders no links and no legend', () => {
  const { container } = renderHeat([entry('2026-10-05', 4, 320)], month, 'month', true)
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  expect(container.querySelector('.heat-legend')).toBeNull()
})

test('entry without mood uses the none colour', () => {
  renderHeat([entry('2026-10-05', null, 100)], month, 'month')
  expect(screen.getByRole('link', { name: /5 Oktober 2026: tanpa mood, 100 kata/ })).toHaveStyle({
    background: 'var(--mood-none)',
  })
})

describe('year auto-scroll', () => {
  // jsdom tidak punya layout: sel hari ini ada di x=600, lebar sel 12, viewport 300, isi 795
  function stubMetrics() {
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-current') ? 600 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(12)
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300)
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(795)
  }
  const year = { kind: 'year', year: 2026 } as const

  test('current year scrolls to today, not to the end of the year', () => {
    stubMetrics()
    const { container } = renderHeat([], year, 'year')
    expect(container.querySelectorAll('[data-current]')).toHaveLength(1)
    expect(container.querySelector('[data-current]')).toHaveAttribute('aria-label', expect.stringContaining('10 Oktober 2026'))
    // Kolom hari ini berjarak satu sel dari tepi kanan
    expect(container.querySelector('.heat-scroll')!.scrollLeft).toBe(600 + 2 * 12 - 300)
  })

  test('still scrolls on 31 December, when no cell is in the future', () => {
    stubMetrics()
    const { container } = renderHeat([], year, 'year', false, '2026-12-31')
    expect(container.querySelector('[data-current]')).toHaveAttribute('aria-label', expect.stringContaining('31 Desember 2026'))
    expect(container.querySelector('.heat-scroll')!.scrollLeft).toBe(324)
  })

  test('never scrolls to a negative offset', () => {
    stubMetrics()
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(900)
    const { container } = renderHeat([], year, 'year')
    expect(container.querySelector('.heat-scroll')!.scrollLeft).toBe(0)
  })

  test('a past year stays at the start', () => {
    stubMetrics()
    const { container } = renderHeat([], { kind: 'year', year: 2025 }, 'year')
    expect(container.querySelector('[data-current]')).toBeNull()
    expect(container.querySelector('.heat-scroll')!.scrollLeft).toBe(0)
  })
})

test('compact year grid sizes its columns to the container instead of scrolling', () => {
  const { container } = renderHeat([], { kind: 'year', year: 2026 }, 'year', true)
  const grid = container.querySelector('.heat-grid') as HTMLElement
  expect(grid.style.gridTemplateColumns).toBe('repeat(53, minmax(0, 1fr))')
  expect(screen.queryAllByRole('link')).toHaveLength(0)
})
