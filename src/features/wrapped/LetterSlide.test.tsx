import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { CreateProvider } from '../../ai/provider/createProvider'
import { i18n } from '../../i18n'
import { controllable, failWith, replyWith } from '../../test/fakeProvider'
import { renderApp } from '../../test/renderApp'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 10, 10))
})
afterEach(async () => {
  vi.useRealTimers()
  delete document.documentElement.dataset.theme
  await i18n.changeLanguage('id')
})

const ai = { provider: 'anthropic' as const, apiKey: 'k', baseUrl: '', model: 'm' }
const seed = {
  entries: [
    { date: '2026-10-01' as const, markdown: 'Lari #olahraga', mood: 5 as const },
    { date: '2026-10-02' as const, markdown: 'Lari lagi #olahraga', mood: 4 as const },
  ],
  settings: { ai, aiIncludeDiary: true },
}

async function toLetter(user: { keyboard: (s: string) => Promise<void> }) {
  await screen.findByRole('group', { name: '1 dari 5' })
  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
  await screen.findByText('Ada pesan dari Teman')
}

function counting(inner: CreateProvider) {
  const calls = { n: 0 }
  const createProvider: CreateProvider = (cfg) => {
    calls.n++
    return inner(cfg)
  }
  return { calls, createProvider }
}

test('opens the letter, caches it, and reopens without a second call', async () => {
  const { calls, createProvider } = counting(replyWith('Paragraf satu.\n\nParagraf dua.'))
  const { user } = await renderApp('/wrapped/2026', seed, { createProvider })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByText('Paragraf satu.')).toBeInTheDocument()
  expect(screen.getByText('Paragraf dua.')).toBeInTheDocument()
  expect(screen.getByText('— Teman')).toBeInTheDocument()
  expect(calls.n).toBe(1)

  await user.keyboard('{ArrowLeft}{ArrowRight}')
  expect(await screen.findByText('Sudah pernah dibuka')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByText('Paragraf dua.')).toBeInTheDocument()
  expect(calls.n).toBe(1)
})

test('shows the error and retries', async () => {
  let provider: CreateProvider = failWith('auth')
  const { user } = await renderApp('/wrapped/2026', seed, { createProvider: (c) => provider(c) })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByText('API key ditolak. Periksa key di Pengaturan.')).toBeInTheDocument()
  provider = replyWith('Halo kamu.')
  await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
  expect(await screen.findByText('Halo kamu.')).toBeInTheDocument()
})

test('a stale letter is not shown and survives a failed rewrite', async () => {
  const { user, letters } = await renderApp(
    '/wrapped/2026',
    { ...seed, letters: [{ periodId: '2026', text: 'Surat lama', fingerprint: 'old', createdAt: 1 }] },
    { createProvider: failWith('network') },
  )
  await toLetter(user)
  expect(screen.getByText('Surat baru')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
  expect(screen.queryByText('Surat lama')).not.toBeInTheDocument()
  expect((await letters.get('2026'))?.text).toBe('Surat lama')
})

test('leaving the slide aborts silently and stores nothing', async () => {
  const c = controllable()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { user, letters } = await renderApp('/wrapped/2026', seed, { createProvider: c.createProvider })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Teman sedang menulis…')
  await user.keyboard('{ArrowRight}')
  await screen.findByRole('group', { name: '5 dari 5' })
  c.finish()
  await waitFor(() => expect(c.requests[0].signal.aborted).toBe(true))
  expect(await letters.get('2026')).toBeUndefined()
  expect(errors).not.toHaveBeenCalled()
  errors.mockRestore()
})

test('clicking the envelope button does not advance the slide', async () => {
  const { user } = await renderApp('/wrapped/2026', seed, { createProvider: replyWith('x') })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(screen.getByRole('group', { name: '4 dari 5' })).toBeInTheDocument()
})

function wrappedRoot() {
  const wrapped = document.querySelector('.wrapped') as HTMLElement
  wrapped.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 800 }) as DOMRect
  return wrapped
}

test('the sealed envelope and the error block are not tap targets for navigation', async () => {
  const { user } = await renderApp('/wrapped/2026', seed, { createProvider: failWith('network') })
  await toLetter(user)
  wrappedRoot()
  fireEvent.click(screen.getByText('Ada pesan dari Teman'), { clientX: 800 })
  expect(screen.getByRole('group', { name: '4 dari 5' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  fireEvent.click(await screen.findByRole('alert'), { clientX: 800 })
  expect(screen.getByRole('group', { name: '4 dari 5' })).toBeInTheDocument()
})

test('tapping the right side of an open letter advances', async () => {
  const { user } = await renderApp('/wrapped/2026', seed, { createProvider: replyWith('Paragraf satu.\n\nParagraf dua.') })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  const paragraph = await screen.findByText('Paragraf satu.')
  wrappedRoot()
  fireEvent.click(paragraph, { clientX: 800 })
  expect(screen.getByRole('group', { name: '5 dari 5' })).toBeInTheDocument()
})

test('swiping on an open letter changes the slide', async () => {
  const { user } = await renderApp('/wrapped/2026', seed, { createProvider: replyWith('Paragraf satu.') })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  const paragraph = await screen.findByText('Paragraf satu.')
  fireEvent.pointerDown(paragraph, { clientX: 400, clientY: 300 })
  fireEvent.pointerUp(paragraph, { clientX: 600, clientY: 300 })
  expect(screen.getByRole('group', { name: '3 dari 5' })).toBeInTheDocument()
})

test('selecting letter text does not change the slide', async () => {
  const { user } = await renderApp('/wrapped/2026', seed, { createProvider: replyWith('Paragraf satu.') })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  const paragraph = await screen.findByText('Paragraf satu.')
  wrappedRoot()
  const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Paragraf' } as Selection)
  try {
    // Drag untuk menyeleksi teks: pointerup jauh dari pointerdown, lalu click
    fireEvent.pointerDown(paragraph, { clientX: 600, clientY: 300 })
    fireEvent.pointerUp(paragraph, { clientX: 400, clientY: 300 })
    fireEvent.click(paragraph, { clientX: 800 })
    expect(screen.getByRole('group', { name: '4 dari 5' })).toBeInTheDocument()
    // Ketukan yang menutup seleksi juga bukan navigasi
    fireEvent.pointerDown(paragraph, { clientX: 800, clientY: 300 })
    selection.mockReturnValue({ toString: () => '' } as Selection)
    fireEvent.pointerUp(paragraph, { clientX: 800, clientY: 300 })
    fireEvent.click(paragraph, { clientX: 800 })
    expect(screen.getByRole('group', { name: '4 dari 5' })).toBeInTheDocument()
  } finally {
    selection.mockRestore()
  }
  fireEvent.pointerDown(paragraph, { clientX: 800, clientY: 300 })
  fireEvent.pointerUp(paragraph, { clientX: 800, clientY: 300 })
  fireEvent.click(paragraph, { clientX: 800 })
  expect(screen.getByRole('group', { name: '5 dari 5' })).toBeInTheDocument()
})

test('an aborted error that is not ours shows the error state', async () => {
  const { user } = await renderApp('/wrapped/2026', seed, { createProvider: failWith('aborted') })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Dihentikan.')
  expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('an unrelated settings write does not reseal an open letter', async () => {
  const { user, settingsStore } = await renderApp('/wrapped/2026', seed, { createProvider: replyWith('Halo kamu.') })
  await toLetter(user)
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByText('Halo kamu.')).toBeInTheDocument()
  await settingsStore.set('theme', 'dark')
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
  // Beri waktu efek cek cache (kalau ada) untuk selesai
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.getByText('Halo kamu.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Buka' })).not.toBeInTheDocument()
})
