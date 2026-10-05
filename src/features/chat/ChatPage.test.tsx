import { screen, waitFor, within } from '@testing-library/react'
import type { CreateProvider } from '../../ai/provider/createProvider'
import type { AiConfig, ProviderErrorKind } from '../../ai/provider/types'
import { controllable, failWith, replyWith } from '../../test/fakeProvider'
import { renderApp } from '../../test/renderApp'

const ai: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5' }
const DATE = '2026-09-20'
const open = (createProvider?: CreateProvider, seed: Parameters<typeof renderApp>[1] = {}) =>
  renderApp(`/chat/${DATE}`, { settings: { ai }, ...seed }, { createProvider })

/** First chat request fails with `kind`, later ones reply. Counts stream calls, since background upkeep also creates providers. */
function failOnce(kind: ProviderErrorKind, reply: string): CreateProvider {
  let calls = 0
  return (cfg) => {
    const fail = failWith(kind)(cfg)
    const ok = replyWith(reply)(cfg)
    return { stream: (req) => (calls++ === 0 ? fail : ok).stream(req) }
  }
}

test('without AI config shows setup card and no composer', async () => {
  await renderApp(`/chat/${DATE}`)
  expect(await screen.findByText('AI belum diatur')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Atur AI' })).toHaveAttribute('href', '/settings#ai')
  expect(screen.queryByRole('textbox', { name: 'Pesan' })).not.toBeInTheDocument()
})

test('sending shows the streamed reply, clears the input and persists both messages', async () => {
  const { chats, user } = await open(replyWith('Aku ', 'dengar kamu.'))
  const input = await screen.findByRole('textbox', { name: 'Pesan' })
  await user.type(input, 'hari ini berat')
  await user.click(screen.getByRole('button', { name: 'Kirim' }))
  expect(await screen.findByText('Aku dengar kamu.')).toBeInTheDocument()
  expect(input).toHaveValue('')
  await waitFor(async () => expect((await chats.listByDate(DATE)).map((m) => m.content)).toEqual(['hari ini berat', 'Aku dengar kamu.']))
})

test('Enter sends, Shift+Enter adds a new line', async () => {
  const { chats, user } = await open(replyWith('ok'))
  const input = await screen.findByRole('textbox', { name: 'Pesan' })
  await user.type(input, 'baris satu{Shift>}{Enter}{/Shift}baris dua')
  expect(input).toHaveValue('baris satu\nbaris dua')
  await user.type(input, '{Enter}')
  await waitFor(async () => expect((await chats.listByDate(DATE))[0]?.content).toBe('baris satu\nbaris dua'))
})

test('crisis phrase shows the help card and the message is still sent', async () => {
  const c = controllable()
  const { user } = await open(c.createProvider)
  await user.type(await screen.findByRole('textbox', { name: 'Pesan' }), 'aku pengen mati aja{Enter}')
  const card = await screen.findByRole('region', { name: 'Kamu tidak sendirian' })
  expect(within(card).getByText(/119 ext 8/)).toBeInTheDocument()
  await waitFor(() => expect(c.requests).toHaveLength(1))
  c.finish()
})

test('help card shows for an earlier crisis message even without AI config', async () => {
  await renderApp(`/chat/${DATE}`, {
    chats: [{ date: DATE, role: 'user', content: 'rasanya ingin bunuh diri', createdAt: 1, status: 'complete' }],
  })
  expect(await screen.findByRole('region', { name: 'Kamu tidak sendirian' })).toBeInTheDocument()
})

test('provider error shows the mapped message and retry recovers', async () => {
  const { user } = await open(failOnce('auth', 'berhasil'))
  await user.type(await screen.findByRole('textbox', { name: 'Pesan' }), 'halo{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('API key ditolak. Periksa key di Pengaturan.')
  await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
  expect(await screen.findByText('berhasil')).toBeInTheDocument()
  expect(screen.getAllByText('halo')).toHaveLength(1)
})

test('refusal shows the refusal message and the help card', async () => {
  const { user } = await open(failWith('refusal'))
  await user.type(await screen.findByRole('textbox', { name: 'Pesan' }), 'halo{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('AI tidak bisa menjawab pesan ini.')
  expect(screen.getByRole('region', { name: 'Kamu tidak sendirian' })).toBeInTheDocument()
})

test('the help card stays after a refusal even once a retry succeeds, placed between the messages and the composer', async () => {
  const { user } = await open(failOnce('refusal', 'berhasil'))
  await user.type(await screen.findByRole('textbox', { name: 'Pesan' }), 'halo{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('AI tidak bisa menjawab pesan ini.')
  await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
  const reply = await screen.findByText('berhasil')
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  const card = screen.getByRole('region', { name: 'Kamu tidak sendirian' })
  expect(reply.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const composer = screen.getByRole('textbox', { name: 'Pesan' })
  expect(card.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('stop keeps the partial reply marked as stopped', async () => {
  const c = controllable()
  const { user } = await open(c.createProvider)
  await user.type(await screen.findByRole('textbox', { name: 'Pesan' }), 'cerita{Enter}')
  await waitFor(() => expect(c.requests).toHaveLength(1))
  c.push('setengah jalan')
  expect(await screen.findByText('setengah jalan')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Berhenti' }))
  expect(await screen.findByText('(dihentikan)')).toBeInTheDocument()
})

const openInfo = (seed: Parameters<typeof renderApp>[1] = {}) => renderApp(`/chat/${DATE}/info`, { settings: { ai }, ...seed })

test('the settings icon opens the chat details, which link back', async () => {
  const { user } = await open(replyWith('x'))
  await user.click(await screen.findByRole('link', { name: 'Detail curhat' }))
  expect(await screen.findByRole('heading', { name: 'Detail curhat' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Kembali ke curhat' })).toHaveAttribute('href', `/chat/${DATE}`)
  await user.click(screen.getByRole('link', { name: 'Yang AI tahu tentang kamu' }))
  expect(await screen.findByRole('heading', { name: 'Yang AI tahu tentang kamu' })).toBeInTheDocument()
  // Memory leads back to the details it was opened from.
  expect(screen.getByRole('link', { name: 'Kembali' })).toHaveAttribute('href', `/chat/${DATE}/info`)
})

test('an empty conversation invites the user to start, centred above the composer', async () => {
  await open(replyWith('x'))
  expect(await screen.findByRole('heading', { name: 'Mau cerita apa?' })).toBeInTheDocument()
  expect(screen.getByText('Teman siap mendengarkan. Ketik di bawah untuk mulai.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Kirim' })).toBeDisabled()
})

test('context preview shows what is sent and the diary toggle updates settings', async () => {
  const { settingsStore, user } = await openInfo({ entries: [{ date: '2026-09-18', markdown: 'isi diary' }] })
  await user.click(await screen.findByText('Lihat isi yang dikirim'))
  expect(await screen.findByText('Memori: 0 · Ringkasan: 0 · Entri terbaru: 1 · Entri relevan: 0')).toBeInTheDocument()
  expect(screen.getByText(/isi diary/)).toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'Sertakan diary (hari-hari terakhir, ringkasan, dan catatan lama yang terkait)' }))
  await waitFor(async () => expect((await settingsStore.getAll()).aiIncludeDiary).toBe(false))
  expect(await screen.findByText('Memori: 0 · Ringkasan: 0 · Entri terbaru: 0 · Entri relevan: 0')).toBeInTheDocument()
})

test('a context preview that fails to load is logged and stays hidden', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { memories, user } = await openInfo()
  const boom = new Error('storage gone')
  vi.spyOn(memories, 'list').mockRejectedValueOnce(boom)
  await user.click(await screen.findByText('Lihat isi yang dikirim'))
  await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(boom))
  expect(screen.queryByText(/^Memori: /)).not.toBeInTheDocument()
  vi.restoreAllMocks()
})

test('history links to other days and deleting the conversation returns to the chat', async () => {
  const { chats, user } = await openInfo({
    chats: [
      { date: DATE, role: 'user', content: 'hari ini', createdAt: 2, status: 'complete' },
      { date: '2026-09-15', role: 'user', content: 'dulu', createdAt: 1, status: 'complete' },
    ],
  })
  const link = await screen.findByRole('link', { name: /15/ })
  expect(link).toHaveAttribute('href', '/chat/2026-09-15')
  await user.click(await screen.findByRole('button', { name: 'Hapus percakapan ini' }))
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await waitFor(async () => expect(await chats.listByDate(DATE)).toEqual([]))
  expect(await chats.listByDate('2026-09-15')).toHaveLength(1)
  expect(await screen.findByRole('heading', { name: 'Curhat' })).toBeInTheDocument()
  vi.restoreAllMocks()
})

test('invalid date redirects to today chat', async () => {
  await renderApp('/chat/2026-02-30', { settings: { ai } })
  expect(await screen.findByRole('heading', { name: 'Curhat' })).toBeInTheDocument()
})

test('storage error saving the assistant reply keeps it visible and retry saves it once storage recovers', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { chats, user } = await open(replyWith('Aku dengar kamu.'))
  const original = chats.add.bind(chats)
  const addSpy = vi.spyOn(chats, 'add').mockImplementation(async (msg) => {
    if (msg.role === 'assistant') throw new Error('storage full')
    return original(msg)
  })
  const input = await screen.findByRole('textbox', { name: 'Pesan' })
  await user.type(input, 'halo{Enter}')
  expect(await screen.findByText('Aku dengar kamu.')).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Gagal menyimpan ke perangkat ini. Periksa ruang penyimpanan lalu coba lagi.',
  )
  addSpy.mockRestore()
  await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
  await waitFor(async () => expect((await chats.listByDate(DATE)).map((m) => m.content)).toEqual(['halo', 'Aku dengar kamu.']))
  consoleError.mockRestore()
})

test('storage error saving the user message shows no retry button and keeps the draft in the composer', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { chats, user } = await open(replyWith('x'))
  vi.spyOn(chats, 'add').mockRejectedValueOnce(new Error('storage full'))
  const input = await screen.findByRole('textbox', { name: 'Pesan' })
  await user.type(input, 'halo{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Gagal menyimpan ke perangkat ini. Periksa ruang penyimpanan lalu coba lagi.',
  )
  expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument()
  expect(input).toHaveValue('halo')
  consoleError.mockRestore()
})

test('a storage error while stopping keeps the unsaved reply marked as stopped', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const c = controllable()
  const { chats, user } = await open(c.createProvider)
  const original = chats.add.bind(chats)
  const addSpy = vi.spyOn(chats, 'add').mockImplementation(async (msg) => {
    if (msg.role === 'assistant') throw new Error('storage full')
    return original(msg)
  })
  await user.type(await screen.findByRole('textbox', { name: 'Pesan' }), 'cerita{Enter}')
  await waitFor(() => expect(c.requests).toHaveLength(1))
  c.push('sebagian')
  expect(await screen.findByText('sebagian')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Berhenti' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Gagal menyimpan ke perangkat ini. Periksa ruang penyimpanan lalu coba lagi.',
  )
  expect(await screen.findByText('(dihentikan)')).toBeInTheDocument()
  expect(screen.getByText('sebagian')).toBeInTheDocument()
  addSpy.mockRestore()
  consoleError.mockRestore()
})
