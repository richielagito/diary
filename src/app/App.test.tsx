import { screen, waitFor } from '@testing-library/react'
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

test('a page change sets the title and moves focus to the content', async () => {
  const { user } = await renderApp('/')
  await screen.findByRole('textbox', { name: 'Tulis diary' })
  expect(document.title).toBe('Hari ini · Diary')
  await user.click(screen.getByRole('link', { name: 'Arsip' }))
  await waitFor(() => expect(document.title).toBe('Arsip · Diary'))
  expect(document.activeElement).toBe(document.getElementById('main'))
})

test('stepping back from today keeps the Today tab lit', async () => {
  const { user } = await renderApp('/')
  await screen.findByRole('textbox', { name: 'Tulis diary' })
  await user.click(screen.getByRole('link', { name: 'Hari sebelumnya' }))
  await user.click(await screen.findByRole('link', { name: 'Hari sebelumnya' }))
  await waitFor(() => expect(document.title).toBe('Hari ini · Diary'))
  expect(screen.getByRole('link', { name: 'Hari ini' })).toHaveClass('active')
  expect(screen.getByRole('link', { name: 'Arsip' })).not.toHaveClass('active')
})

test('a past day opened directly lights the Archive tab', async () => {
  await renderApp('/day/2026-01-05')
  await screen.findByRole('textbox', { name: 'Tulis diary' })
  expect(screen.getByRole('link', { name: 'Arsip' })).toHaveClass('active')
  expect(screen.getByRole('link', { name: 'Hari ini' })).not.toHaveClass('active')
})
