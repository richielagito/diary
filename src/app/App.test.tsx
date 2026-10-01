import { screen } from '@testing-library/react'
import { renderApp } from '../test/renderApp'

afterEach(() => {
  delete document.documentElement.dataset.theme
})

test('layout shows navigation and today page', async () => {
  await renderApp('/')
  expect(await screen.findByRole('link', { name: 'Hari ini' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Arsip' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Statistik' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Pengaturan' })).toBeInTheDocument()
})

test('chat nav link opens the chat page', async () => {
  const { user } = await renderApp('/')
  await user.click(await screen.findByRole('link', { name: 'Curhat' }))
  expect(await screen.findByRole('heading', { name: 'Curhat' })).toBeInTheDocument()
})

test('navigates to archive', async () => {
  const { user } = await renderApp('/')
  await user.click(await screen.findByRole('link', { name: 'Arsip' }))
  expect(await screen.findByRole('searchbox', { name: 'Cari' })).toBeInTheDocument()
})

test('invalid date route redirects to today', async () => {
  await renderApp('/day/2026-02-30')
  expect(await screen.findByRole('textbox', { name: 'Tulis diary' })).toBeInTheDocument()
})

test('theme setting applied to html element', async () => {
  const { settingsStore } = await renderApp('/')
  await screen.findByRole('link', { name: 'Arsip' })
  await settingsStore.set('theme', 'dark')
  await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
  await settingsStore.set('theme', 'system')
  await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBeUndefined())
})
