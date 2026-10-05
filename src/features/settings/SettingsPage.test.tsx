import { screen, waitFor } from '@testing-library/react'
import { serializeEntry } from '../../domain/frontmatter'
import { renderApp } from '../../test/renderApp'

afterEach(() => vi.restoreAllMocks())

test('theme select persists setting', async () => {
  const { settingsStore, user } = await renderApp('/settings')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Tema' }), 'dark')
  await waitFor(async () => expect((await settingsStore.getAll()).theme).toBe('dark'))
})

test('language switch changes UI text', async () => {
  const { user } = await renderApp('/settings')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Bahasa' }), 'en')
  expect(await screen.findByRole('link', { name: 'Settings' })).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'id')
  expect(await screen.findByRole('link', { name: 'Pengaturan' })).toBeInTheDocument()
})

test('reminder can be turned off', async () => {
  const { settingsStore, user } = await renderApp('/settings')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Pengingat cadangan' }), 'off')
  await waitFor(async () => expect((await settingsStore.getAll()).backupReminderDays).toBeNull())
})

test('shows never-exported and persist-denied note', async () => {
  await renderApp('/settings', { settings: { persistGranted: false } })
  expect(await screen.findByText('Belum pernah ekspor')).toBeInTheDocument()
  expect(screen.getByText(/Browser bisa menghapus data diary/)).toBeInTheDocument()
})

test('import file pick failure alerts the user', async () => {
  const { diary, user } = await renderApp('/settings')
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(diary, 'list').mockRejectedValue(new Error('DatabaseClosedError'))
  await user.upload(await screen.findByLabelText('Impor'), new File(['isi'], '2026-09-05.md'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Impor gagal. Tidak ada data yang berubah.')
  expect(error).toHaveBeenCalled()
})

test('import flow: pick md file, preview, confirm', async () => {
  const { diary, user } = await renderApp('/settings')
  const md = serializeEntry({ date: '2026-09-05', markdown: 'dari file', mood: 4, createdAt: 1, updatedAt: 2 })
  await user.upload(await screen.findByLabelText('Impor'), new File([md], '2026-09-05.md'))
  expect(await screen.findByText('1 entri baru')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Impor' }))
  await waitFor(async () => expect((await diary.get('2026-09-05'))?.markdown).toBe('dari file'))
})
