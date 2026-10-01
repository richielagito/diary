import { screen, within } from '@testing-library/react'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
import { renderApp } from '../../test/renderApp'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 10, 10))
})
afterEach(() => vi.useRealTimers())

const seed = {
  entries: [
    { date: '2026-10-01', markdown: 'Lari #olahraga', mood: 5 as const },
    { date: '2026-10-02', markdown: 'Lari lagi #olahraga', mood: 4 as const },
    { date: '2026-10-03', markdown: 'Lari terus #olahraga', mood: 4 as const },
  ],
}

test('nav has a Statistik link that opens the page', async () => {
  const { user } = await renderApp('/', seed)
  await user.click(await screen.findByRole('link', { name: 'Statistik' }))
  expect(await screen.findByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument()
})

test('month view shows consistency, tags and the Wrapped link', async () => {
  await renderApp('/stats', seed)
  expect(await screen.findByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument()
  expect(await screen.findByText('3 dari 10 hari (30%)')).toBeInTheDocument()
  expect(screen.getByText('0 hari', { selector: 'strong' })).toBeInTheDocument()
  expect(screen.getByText('3 hari', { selector: 'strong' })).toBeInTheDocument()
  const topList = screen.getByText('Tag teratas').nextElementSibling as HTMLElement
  expect(within(topList).getByText('#olahraga')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Lihat Wrapped Oktober 2026' })).toHaveAttribute('href', '/wrapped/2026-10')
  expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeDisabled()
})

test('switching to year', async () => {
  const { user } = await renderApp('/stats', seed)
  await user.click(await screen.findByRole('button', { name: 'Tahun' }))
  expect(await screen.findByRole('heading', { name: '2026' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Lihat Wrapped 2026' })).toHaveAttribute('href', '/wrapped/2026')
})

test('previous stops at the first entry period', async () => {
  const { user } = await renderApp('/stats', { entries: [{ date: '2026-09-03', markdown: 'x', mood: 3 as const }] })
  await user.click(await screen.findByRole('button', { name: 'Sebelumnya' }))
  expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeDisabled()
})

test('empty diary', async () => {
  await renderApp('/stats')
  expect(await screen.findByText(/Belum ada diary/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tulis hari ini' })).toHaveAttribute('href', '/')
})

test('period without entries shows only the empty heatmap and one sentence', async () => {
  await renderApp('/stats', { entries: [{ date: '2026-09-03', markdown: 'x #tag', mood: 3 as const }] })
  expect(await screen.findByText('Belum ada tulisan di periode ini.')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Heatmap mood' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Kamis, 8 Oktober 2026: tidak menulis/ })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Lihat Wrapped/ })).not.toBeInTheDocument()
  // Tanpa kartu konsistensi, ajakan mood, maupun ajakan tag
  expect(screen.queryByText('Hari menulis')).not.toBeInTheDocument()
  expect(screen.queryByText('Streak sekarang')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Mood' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Tag' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Belum ada mood yang dipilih/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Belum ada tag/)).not.toBeInTheDocument()
})

test('entries without mood and tags show the empty copy', async () => {
  await renderApp('/stats', { entries: [{ date: '2026-10-01', markdown: 'polos' }] })
  expect(await screen.findByText(/Belum ada mood yang dipilih/)).toBeInTheDocument()
  expect(screen.getByText(/Belum ada tag/)).toBeInTheDocument()
})

test('year to month: current month in the current year, December in a past year', async () => {
  const { user } = await renderApp('/stats', { entries: [{ date: '2025-03-03', markdown: 'x' }, ...seed.entries] })
  await user.click(await screen.findByRole('button', { name: 'Tahun' }))
  await user.click(screen.getByRole('button', { name: 'Bulan' }))
  expect(await screen.findByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tahun' }))
  await user.click(screen.getByRole('button', { name: 'Sebelumnya' }))
  expect(await screen.findByRole('heading', { name: '2025' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Bulan' }))
  expect(await screen.findByRole('heading', { name: 'Desember 2025' })).toBeInTheDocument()
})

test('year view shows brightest and heaviest months', async () => {
  const entries = [1, 2, 3].flatMap((d) => [
    { date: `2026-09-0${d}`, markdown: 'a', mood: 5 as const },
    { date: `2026-10-0${d}`, markdown: 'b', mood: 1 as const },
  ])
  const { user } = await renderApp('/stats', { entries })
  await user.click(await screen.findByRole('button', { name: 'Tahun' }))
  expect(await screen.findByText('Paling cerah: September')).toBeInTheDocument()
  expect(screen.getByText('Paling berat: Oktober')).toBeInTheDocument()
})

test('next arrow returns to the current period', async () => {
  const { user } = await renderApp('/stats', { entries: [{ date: '2026-09-03', markdown: 'x', mood: 3 as const }] })
  await user.click(await screen.findByRole('button', { name: 'Sebelumnya' }))
  expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
  const next = screen.getByRole('button', { name: 'Berikutnya' })
  expect(next).toBeEnabled()
  await user.click(next)
  expect(await screen.findByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument()
})

test('a failing load shows an error line', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const list = vi.spyOn(DexieDiaryRepository.prototype, 'list').mockRejectedValueOnce(new Error('idb'))
  await renderApp('/stats')
  expect(await screen.findByText('Gagal memuat statistik.')).toBeInTheDocument()
  list.mockRestore()
  spy.mockRestore()
})
