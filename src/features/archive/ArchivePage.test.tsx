import { screen, within } from '@testing-library/react'
import { renderApp } from '../../test/renderApp'

const seed = {
  entries: [
    { date: '2026-09-01', markdown: 'Ujian Kalkulus #kuliah', mood: 2 as const },
    { date: '2026-09-03', markdown: 'Lari pagi #olahraga', mood: 5 as const },
    { date: '2026-08-15', markdown: 'Liburan #kuliah selesai' },
  ],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 27, 10))
})
afterEach(() => vi.useRealTimers())

test('calendar shows current month with mood-labelled day links', async () => {
  await renderApp('/archive', seed)
  const cal = await screen.findByRole('grid')
  expect(await within(cal).findByRole('link', { name: /1 September 2026.*Kurang baik/ })).toHaveAttribute(
    'href',
    '/day/2026-09-01',
  )
  expect(within(cal).getByRole('link', { name: /3 September 2026.*Senang/ })).toBeInTheDocument()
})

test('days without entry are still links, labelled without mood', async () => {
  await renderApp('/archive', seed)
  const cal = await screen.findByRole('grid')
  const link = await within(cal).findByRole('link', { name: '10 September 2026' })
  expect(link).toHaveAttribute('href', '/day/2026-09-10')
})

test('previous month navigation', async () => {
  const { user } = await renderApp('/archive', seed)
  await user.click(await screen.findByRole('button', { name: 'Bulan sebelumnya' }))
  expect(await screen.findByRole('heading', { name: /Agustus 2026/ })).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: /15 Agustus 2026.*Tanpa mood/ })).toBeInTheDocument()
})

test('search by #tag lists matching entries across months, newest first', async () => {
  const { user } = await renderApp('/archive', seed)
  await user.type(await screen.findByRole('searchbox', { name: 'Cari' }), '#kuliah')
  expect(await screen.findByText('2 hasil')).toBeInTheDocument()
  const items = within(screen.getByRole('list', { name: 'Cari' })).getAllByRole('link')
  expect(items.map((a) => a.getAttribute('href'))).toEqual(['/day/2026-09-01', '/day/2026-08-15'])
})

test('search with no match', async () => {
  const { user } = await renderApp('/archive', seed)
  await user.type(await screen.findByRole('searchbox', { name: 'Cari' }), 'zzz')
  expect(await screen.findByText('Tidak ada hasil')).toBeInTheDocument()
})
