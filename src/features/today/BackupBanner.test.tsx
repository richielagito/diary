import { screen } from '@testing-library/react'
import { renderWithRepos } from '../../test/renderApp'
import { BackupBanner } from './BackupBanner'

const DAY = 86_400_000

test('hidden with no entries', async () => {
  await renderWithRepos(<BackupBanner />)
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.queryByText(/Sudah lama belum membuat cadangan/)).not.toBeInTheDocument()
})

test('shown when first entry is older than interval and never exported', async () => {
  const { diary, settingsStore } = await renderWithRepos(<BackupBanner />)
  await settingsStore.set('persistGranted', true)
  await diary.importMany(
    [{ date: '2026-01-01', markdown: 'lama', mood: null, createdAt: Date.now() - 30 * DAY, updatedAt: 0 }],
    'skip',
  )
  expect(await screen.findByText(/Sudah lama belum membuat cadangan/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ekspor cadangan' })).toBeInTheDocument()
})

test('hidden right after recent export', async () => {
  const { diary, settingsStore } = await renderWithRepos(<BackupBanner />)
  await settingsStore.set('lastExportAt', Date.now())
  await diary.importMany(
    [{ date: '2026-01-01', markdown: 'lama', mood: null, createdAt: Date.now() - 30 * DAY, updatedAt: 0 }],
    'skip',
  )
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.queryByText(/Sudah lama belum membuat cadangan/)).not.toBeInTheDocument()
})
