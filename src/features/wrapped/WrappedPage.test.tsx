import { act, fireEvent, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AppRoutes } from '../../app/App'
import { i18n } from '../../i18n'
import type { PeriodStats } from '../../stats/computeStats'
import { renderApp, renderWithRepos } from '../../test/renderApp'
import { renderShareCard } from './shareCard'
import { buildSlides, moodWash } from './WrappedPage'

vi.mock('./shareCard', async (orig) => ({
  ...(await orig<typeof import('./shareCard')>()),
  renderShareCard: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 10, 10))
})
afterEach(async () => {
  vi.useRealTimers()
  delete document.documentElement.dataset.theme
  await i18n.changeLanguage('id')
})

const seed = {
  entries: [
    { date: '2026-10-01' as const, markdown: 'Lari #olahraga', mood: 5 as const },
    { date: '2026-10-02' as const, markdown: 'Lari lagi #olahraga', mood: 4 as const },
    { date: '2026-10-03' as const, markdown: 'Lari terus #olahraga', mood: 4 as const },
  ],
}
const ai = { provider: 'anthropic' as const, apiKey: 'k', baseUrl: '', model: 'm' }

const segments = () => document.querySelectorAll('.wrapped-progress > span').length

test('opening slide, progress bar and no main nav', async () => {
  await renderApp('/wrapped/2026', seed)
  expect(await screen.findByRole('group', { name: '1 dari 4' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '2026, kamu menulis 3 hari (sejauh ini)' })).toBeInTheDocument()
  expect(segments()).toBe(4)
  expect(screen.getByText('Ketuk untuk melanjutkan')).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tutup' })).toHaveAttribute('href', '/stats?p=2026')
})

test('keyboard navigation and clamping', async () => {
  const { user } = await renderApp('/wrapped/2026', seed)
  await screen.findByRole('group', { name: '1 dari 4' })
  await user.keyboard('{ArrowLeft}')
  expect(screen.getByRole('group', { name: '1 dari 4' })).toBeInTheDocument()
  await user.keyboard('{ArrowRight}')
  // The new slide takes focus, so a screen reader announces it.
  expect(screen.getByRole('group', { name: '2 dari 4' })).toHaveFocus()
  await user.keyboard('{ArrowLeft}')
  expect(screen.getByRole('group', { name: '1 dari 4' })).toBeInTheDocument()
})

test('Escape goes to stats', async () => {
  const { user } = await renderApp('/wrapped/2026', seed)
  await screen.findByRole('group', { name: '1 dari 4' })
  await user.keyboard('{Escape}')
  expect(await screen.findByRole('heading', { name: '2026' })).toBeInTheDocument()
})

test.each(['Escape', 'the ✕ link'])('closing with %s replaces the Wrapped history entry', async (how) => {
  const router = createMemoryRouter([{ path: '*', element: <AppRoutes /> }], {
    initialEntries: ['/archive', '/wrapped/2026'],
    initialIndex: 1,
  })
  const { user } = await renderWithRepos(<RouterProvider router={router} />, seed)
  await screen.findByRole('group', { name: '1 dari 4' })
  if (how === 'Escape') await user.keyboard('{Escape}')
  else await user.click(screen.getByRole('link', { name: 'Tutup' }))
  expect(await screen.findByRole('heading', { name: '2026' })).toBeInTheDocument()
  // Back tidak membuka Wrapped lagi
  await act(() => router.navigate(-1))
  expect(await screen.findByRole('searchbox', { name: 'Cari' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/archive')
})

test('clicking the right side advances, the left side goes back', async () => {
  await renderApp('/wrapped/2026', seed)
  const wrapped = (await screen.findByRole('group', { name: '1 dari 4' })).closest('.wrapped') as HTMLElement
  wrapped.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 800 }) as DOMRect
  fireEvent.click(wrapped, { clientX: 800 })
  expect(screen.getByRole('group', { name: '2 dari 4' })).toBeInTheDocument()
  fireEvent.click(wrapped, { clientX: 100 })
  expect(screen.getByRole('group', { name: '1 dari 4' })).toBeInTheDocument()
})

test('swipe left advances and suppresses the click', async () => {
  await renderApp('/wrapped/2026', seed)
  const wrapped = (await screen.findByRole('group', { name: '1 dari 4' })).closest('.wrapped') as HTMLElement
  wrapped.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 800 }) as DOMRect
  fireEvent.pointerDown(wrapped, { clientX: 600, clientY: 300 })
  fireEvent.pointerUp(wrapped, { clientX: 400, clientY: 310 })
  fireEvent.click(wrapped, { clientX: 400 })
  expect(screen.getByRole('group', { name: '2 dari 4' })).toBeInTheDocument()
})

test('a swipe without a following click does not eat the next tap', async () => {
  await renderApp('/wrapped/2026', seed)
  const wrapped = (await screen.findByRole('group', { name: '1 dari 4' })).closest('.wrapped') as HTMLElement
  wrapped.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 800 }) as DOMRect
  // Sentuhan: swipe memberi pointerup tanpa click
  fireEvent.pointerDown(wrapped, { clientX: 600, clientY: 300 })
  fireEvent.pointerUp(wrapped, { clientX: 400, clientY: 310 })
  expect(screen.getByRole('group', { name: '2 dari 4' })).toBeInTheDocument()
  fireEvent.pointerDown(wrapped, { clientX: 800, clientY: 300 })
  fireEvent.pointerUp(wrapped, { clientX: 800, clientY: 300 })
  fireEvent.click(wrapped, { clientX: 800 })
  expect(screen.getByRole('group', { name: '3 dari 4' })).toBeInTheDocument()
})

test('pointercancel clears the gesture', async () => {
  await renderApp('/wrapped/2026', seed)
  const wrapped = (await screen.findByRole('group', { name: '1 dari 4' })).closest('.wrapped') as HTMLElement
  fireEvent.pointerDown(wrapped, { clientX: 600, clientY: 300 })
  fireEvent.pointerCancel(wrapped, { clientX: 500, clientY: 300 })
  fireEvent.pointerUp(wrapped, { clientX: 400, clientY: 300 })
  expect(screen.getByRole('group', { name: '1 dari 4' })).toBeInTheDocument()
})

test('entries without moods or tags give two slides', async () => {
  await renderApp('/wrapped/2026', { entries: [{ date: '2026-10-01', markdown: 'halo' }] })
  await screen.findByRole('group', { name: '1 dari 2' })
  expect(segments()).toBe(2)
})

test.each(['2026-13', '2027', '2026-10'])('invalid, future or monthly period %s redirects to stats', async (id) => {
  await renderApp(`/wrapped/${id}`, seed)
  expect(await screen.findByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument()
})

test('empty current year on day 1 shows the empty slide', async () => {
  vi.setSystemTime(new Date(2026, 0, 1, 10))
  await renderApp('/wrapped/2026', { entries: [{ date: '2025-12-03', markdown: 'x', mood: 3 }] })
  expect(await screen.findByText('Belum ada tulisan di periode ini.')).toBeInTheDocument()
  expect(segments()).toBe(1)
  expect(screen.getByRole('link', { name: 'Tulis hari ini' })).toHaveAttribute('href', '/')
})

test('letter slide only with AI configured and diary context enabled', async () => {
  await renderApp('/wrapped/2026', { ...seed, settings: { ai, aiIncludeDiary: true } })
  await screen.findByRole('group', { name: '1 dari 5' })
  expect(segments()).toBe(5)
})

test('no letter slide when diary context is off', async () => {
  await renderApp('/wrapped/2026', { ...seed, settings: { ai, aiIncludeDiary: false } })
  await screen.findByRole('group', { name: '1 dari 4' })
})

test('direct load applies language and theme without the Layout', async () => {
  await renderApp('/wrapped/2026', { ...seed, settings: { language: 'en', theme: 'dark' } })
  expect(await screen.findByRole('heading', { name: '2026, you wrote 3 days (so far)' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: '1 of 4' })).toBeInTheDocument()
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(document.documentElement.lang).toBe('en')
})

test('English singular day and word counts', async () => {
  await renderApp('/wrapped/2026', { entries: [{ date: '2026-10-01', markdown: 'halo' }], settings: { language: 'en' } })
  expect(await screen.findByRole('heading', { name: '2026, you wrote 1 day (so far)' })).toBeInTheDocument()
  expect(screen.getByText('1 word written')).toBeInTheDocument()
  expect(screen.getByText('Longest streak 1 day')).toBeInTheDocument()
})

test('load failure shows an alert instead of the empty slide', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { DexieDiaryRepository } = await import('../../storage/DexieDiaryRepository')
  vi.spyOn(DexieDiaryRepository.prototype, 'list').mockRejectedValue(new Error('boom'))
  await renderApp('/wrapped/2026', seed)
  expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat Wrapped.')
  expect(screen.queryByText('Belum ada tulisan di periode ini.')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tutup' })).toHaveAttribute('href', '/stats?p=2026')
  spy.mockRestore()
  vi.restoreAllMocks()
})

test('swipe that starts on the mini heatmap changes slide', async () => {
  await renderApp('/wrapped/2026', seed)
  const wrapped = (await screen.findByRole('group', { name: '1 dari 4' })).closest('.wrapped') as HTMLElement
  fireEvent.keyDown(window, { key: 'ArrowRight' })
  // The mood slide mounts after the step; wait for it before touching its heatmap.
  await screen.findByRole('group', { name: '2 dari 4' })
  const heat = document.querySelector('.slide-heatmap') as HTMLElement
  expect(heat).not.toBeNull()
  fireEvent.pointerDown(heat, { clientX: 600, clientY: 300 })
  fireEvent.pointerUp(wrapped, { clientX: 400, clientY: 300 })
  expect(screen.getByRole('group', { name: '3 dari 4' })).toBeInTheDocument()
})

test('a second finger (pinch) cancels the swipe', async () => {
  await renderApp('/wrapped/2026', seed)
  const wrapped = (await screen.findByRole('group', { name: '1 dari 4' })).closest('.wrapped') as HTMLElement
  fireEvent.pointerDown(wrapped, { pointerId: 1, clientX: 300, clientY: 300 })
  fireEvent.pointerDown(wrapped, { pointerId: 2, clientX: 600, clientY: 320 })
  fireEvent.pointerUp(wrapped, { pointerId: 1, clientX: 280, clientY: 300 })
  fireEvent.pointerUp(wrapped, { pointerId: 2, clientX: 500, clientY: 320 })
  expect(screen.getByRole('group', { name: '1 dari 4' })).toBeInTheDocument()
})

test('buildSlides', () => {
  const stats = (over: Partial<{ daysWritten: number; mood: number; tags: number }>) =>
    ({
      daysWritten: over.daysWritten ?? 1,
      mood: { count: over.mood ?? 0 },
      tags: { top: Array.from({ length: over.tags ?? 0 }) },
    }) as unknown as PeriodStats
  expect(buildSlides(stats({ daysWritten: 0 }), true)).toEqual(['empty'])
  expect(buildSlides(stats({}), false)).toEqual(['opening', 'closing'])
  expect(buildSlides(stats({ mood: 2, tags: 1 }), true)).toEqual(['opening', 'mood', 'tags', 'letter', 'closing'])
})

test('saving the image shows an alert when rendering fails', async () => {
  vi.mocked(renderShareCard).mockRejectedValue(new Error('no canvas'))
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { user } = await renderApp('/wrapped/2026', { entries: [{ date: '2026-10-01', markdown: 'halo' }] })
  await screen.findByRole('group', { name: '1 dari 2' })
  await user.keyboard('{ArrowRight}')
  await user.click(screen.getByRole('button', { name: 'Simpan gambar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan gambar. Coba lagi.')
  spy.mockRestore()
})

test('the background takes the two most frequent moods, skipping neutral unless it is all there is', () => {
  expect(moodWash({ 1: 2, 2: 0, 3: 9, 4: 5, 5: 1 })).toEqual({ '--wrap-a': 'var(--mood-4)', '--wrap-b': 'var(--mood-1)' })
  expect(moodWash({ 1: 0, 2: 0, 3: 4, 4: 0, 5: 3 })).toEqual({ '--wrap-a': 'var(--mood-5)', '--wrap-b': 'var(--mood-5)' })
  expect(moodWash({ 1: 0, 2: 0, 3: 4, 4: 0, 5: 0 })).toEqual({ '--wrap-a': 'var(--mood-3)', '--wrap-b': 'var(--mood-3)' })
})
