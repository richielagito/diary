import { screen } from '@testing-library/react'
import { renderApp } from '../../test/renderApp'

// jsdom has no StorageManager: each test that needs one defines it on navigator, and it is removed afterwards.
afterEach(() => {
  delete (navigator as { storage?: unknown }).storage
})

const stubEstimate = (usage: number, quota: number) =>
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: () => Promise.resolve({ usage, quota }) } })

test('shows how much of the browser storage is used and how many days changed since the last export', async () => {
  stubEstimate(3_200_000, 1_100_000_000)
  await renderApp('/settings', {
    settings: { lastExportAt: new Date(2026, 8, 10).getTime() },
    entries: [
      { date: '2026-09-01', markdown: 'lama' },
      { date: '2026-09-20', markdown: 'baru' },
    ],
  })
  expect(await screen.findByText('Terpakai di browser ini: 3,2 MB dari 1,1 GB')).toBeInTheDocument()
  // Seeding writes both entries now, after the export date.
  expect(screen.getByText('2 hari berubah sejak ekspor terakhir.')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('warns when storage is nearly full', async () => {
  stubEstimate(900, 1000)
  await renderApp('/settings')
  expect(await screen.findByRole('alert')).toHaveTextContent('Ruang hampir penuh.')
})

test('without a storage estimate the line stays hidden', async () => {
  await renderApp('/settings', { entries: [{ date: '2026-09-01', markdown: 'x' }] })
  expect(await screen.findByText('1 hari berubah sejak ekspor terakhir.')).toBeInTheDocument()
  expect(screen.queryByText(/Terpakai di browser ini/)).not.toBeInTheDocument()
})
