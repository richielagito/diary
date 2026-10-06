import { render, screen } from '@testing-library/react'
import { MoodBars } from './MoodBars'

test('is one image whose label lists every point', () => {
  render(
    <MoodBars
      points={[
        { label: '1–4', average: 4.5 },
        { label: '5–11', average: null },
        { label: '12–18', average: 3 },
      ]}
    />,
  )
  expect(screen.getByRole('img', { name: 'Tren mood: 1–4: 4,5, 5–11: tanpa mood, 12–18: 3,0' })).toBeInTheDocument()
})

test('a year of bars uses a narrower viewBox so month labels stay legible on phones', () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const { container } = render(<MoodBars points={months.map((label) => ({ label, average: 3 }))} />)
  const svg = container.querySelector('svg')!
  const [, , width] = svg.getAttribute('viewBox')!.split(' ').map(Number)
  const fontSize = Number(svg.querySelector('text')!.getAttribute('font-size'))
  // Di layar 320px (lebar isi 288px) label minimal ~10px
  expect((fontSize * 288) / width).toBeGreaterThanOrEqual(10)
  expect(svg.querySelectorAll('text')).toHaveLength(12)
})

test('bars diverge from the Okay line: brighter averages rise, heavier ones drop', () => {
  const { container } = render(
    <MoodBars
      points={[
        { label: 'a', average: 5 },
        { label: 'b', average: 1 },
      ]}
    />,
  )
  const mid = Number(container.querySelector('line')!.getAttribute('y1'))
  const [up, down] = [...container.querySelectorAll('rect')].map((r) => ({ y: Number(r.getAttribute('y')), h: Number(r.getAttribute('height')) }))
  expect(up.y + up.h).toBe(mid)
  expect(down.y).toBe(mid)
  expect(up.h).toBe(down.h)
})
