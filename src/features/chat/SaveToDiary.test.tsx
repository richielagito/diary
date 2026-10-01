import { screen, waitFor } from '@testing-library/react'
import type { CreateProvider } from '../../ai/provider/createProvider'
import type { AiConfig } from '../../ai/provider/types'
import { dateKey } from '../../domain/date'
import type { Mood } from '../../domain/types'
import type { NewChatMessage } from '../../storage/ChatRepository'
import { controllable, failWith, replyWith } from '../../test/fakeProvider'
import { renderApp } from '../../test/renderApp'

const ai: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5' }
const DATE = '2026-09-20'
const REPLY = '{"text":"Hari ini aku cerita soal kucing.","mood":3,"tags":["kucing"]}'
const CHATS: NewChatMessage[] = [
  { date: DATE, role: 'user', content: 'Mochi sakit', createdAt: 1, status: 'complete' },
  { date: DATE, role: 'assistant', content: 'Semoga cepat sembuh.', createdAt: 2, status: 'complete' },
  { date: DATE, role: 'user', content: 'Sudah ke dokter', createdAt: 3, status: 'complete' },
]

/** `draft` answers only the draft request; background upkeep (summaries) gets an empty reply and does nothing. */
function forDraft(draft: CreateProvider): CreateProvider {
  return (cfg) => ({
    stream: (req) => (req.system.startsWith('Write a diary passage') ? draft : replyWith(''))(cfg).stream(req),
  })
}

const open = (draft: CreateProvider, entry: { markdown: string; mood: Mood | null } = { markdown: 'Pagi.', mood: null }) =>
  renderApp(`/chat/${DATE}`, { settings: { ai }, chats: CHATS, entries: [{ date: DATE, ...entry }] }, { createProvider: forDraft(draft) })

const draftBox = () => screen.findByRole('textbox', { name: 'Tulisan untuk diary' })

afterEach(() => {
  vi.restoreAllMocks()
})

test('hidden without AI config', async () => {
  await renderApp(`/chat/${DATE}`, { chats: CHATS })
  expect(await screen.findByText('Mochi sakit')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Simpan jadi diary' })).not.toBeInTheDocument()
})

test('hidden when the day has no user message', async () => {
  await renderApp(`/chat/${DATE}`, { settings: { ai }, chats: [CHATS[1]] }, { createProvider: forDraft(replyWith(REPLY)) })
  expect(await screen.findByText('Semoga cepat sembuh.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Simpan jadi diary' })).not.toBeInTheDocument()
})

test('edited draft is appended with the checked mood and tag, then links to the day', async () => {
  const { diary, user } = await open(replyWith(REPLY))
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  const box = await draftBox()
  expect(box).toHaveValue('Hari ini aku cerita soal kucing.')
  expect(screen.getByRole('checkbox', { name: 'Isi mood: 😐 Biasa' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Tambahkan tag #kucing' })).toBeChecked()

  await user.clear(box)
  // A trailing new line must not push the tag line further down.
  await user.type(box, 'Hari ini aku cerita soal Mochi.{Enter}')
  await user.click(screen.getByRole('button', { name: 'Tambahkan ke diary' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Ditambahkan ke diary.')
  expect(screen.getByRole('link', { name: 'Buka diary tanggal ini' })).toHaveAttribute('href', `/day/${DATE}`)
  expect(screen.queryByRole('textbox', { name: 'Tulisan untuk diary' })).not.toBeInTheDocument()
  const entry = await diary.get(DATE)
  expect(entry?.markdown).toBe('Pagi.\n\nHari ini aku cerita soal Mochi.\n\n#kucing')
  expect(entry?.mood).toBe(3)
})

test('an entry that already has a mood gets no mood checkbox and keeps its mood', async () => {
  const { diary, user } = await open(replyWith(REPLY), { markdown: 'Pagi.', mood: 5 })
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  await draftBox()
  expect(screen.queryByRole('checkbox', { name: /Isi mood/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tambahkan ke diary' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Ditambahkan ke diary.')
  expect((await diary.get(DATE))?.mood).toBe(5)
})

test('an unchecked tag leaves no tag line', async () => {
  const { diary, user } = await open(replyWith(REPLY))
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  await draftBox()
  await user.click(screen.getByRole('checkbox', { name: 'Tambahkan tag #kucing' }))
  await user.click(screen.getByRole('button', { name: 'Tambahkan ke diary' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Ditambahkan ke diary.')
  expect((await diary.get(DATE))?.markdown).toBe('Pagi.\n\nHari ini aku cerita soal kucing.')
})

test('a blank draft cannot be appended', async () => {
  const { user } = await open(replyWith(REPLY))
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  await user.clear(await draftBox())
  expect(screen.getByRole('button', { name: 'Tambahkan ke diary' })).toBeDisabled()
})

test('a storage failure shows an alert and keeps the panel with the edited text', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { diary, user } = await open(replyWith(REPLY))
  vi.spyOn(diary, 'appendToEntry').mockRejectedValueOnce(new Error('storage full'))
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  const box = await draftBox()
  await user.type(box, ' Lagi.')
  await user.click(screen.getByRole('button', { name: 'Tambahkan ke diary' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan ke perangkat ini. Periksa ruang penyimpanan lalu coba lagi.')
  expect(screen.getByRole('textbox', { name: 'Tulisan untuk diary' })).toHaveValue('Hari ini aku cerita soal kucing. Lagi.')
  expect((await diary.get(DATE))?.markdown).toBe('Pagi.')
  expect(consoleError).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Batal' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a provider error shows its message and the button works again', async () => {
  const { user } = await open(failWith('network'))
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Tidak bisa terhubung ke provider. AI butuh koneksi internet (atau Ollama yang sedang berjalan).',
  )
  expect(screen.getByRole('button', { name: 'Simpan jadi diary' })).toBeEnabled()
  expect(screen.queryByRole('textbox', { name: 'Tulisan untuk diary' })).not.toBeInTheDocument()
})

test('an open draft locks the button; cancel discards the draft, unlocks it and leaves the entry unchanged', async () => {
  const { diary, user } = await open(replyWith(REPLY))
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  await draftBox()
  expect(screen.getByRole('button', { name: 'Simpan jadi diary' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Batal' }))
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Tulisan untuk diary' })).not.toBeInTheDocument())
  expect(screen.queryByRole('checkbox', { name: 'Tambahkan tag #kucing' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Simpan jadi diary' })).toBeEnabled()
  expect(await diary.get(DATE)).toMatchObject({ markdown: 'Pagi.', mood: null })
})

test("today's conversation links to the home page after appending", async () => {
  const today = dateKey()
  const { user } = await renderApp(
    `/chat/${today}`,
    { settings: { ai }, chats: CHATS.map((m) => ({ ...m, date: today })) },
    { createProvider: forDraft(replyWith(REPLY)) },
  )
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  await draftBox()
  await user.click(screen.getByRole('button', { name: 'Tambahkan ke diary' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Ditambahkan ke diary.')
  expect(screen.getByRole('link', { name: 'Buka diary tanggal ini' })).toHaveAttribute('href', '/')
})

test('knownTags are not sent when the diary is not shared with the AI', async () => {
  const requests: string[] = []
  const draft: CreateProvider = (cfg) => ({
    stream: (req) => {
      requests.push(req.messages.map((m) => m.content).join('\n'))
      return replyWith(REPLY)(cfg).stream(req)
    },
  })
  const { user } = await renderApp(
    `/chat/${DATE}`,
    {
      settings: { ai, aiIncludeDiary: false },
      chats: CHATS,
      entries: [
        { date: DATE, markdown: 'Pagi #rahasia', mood: null },
        { date: '2026-09-19', markdown: 'Kemarin #rahasia', mood: null },
      ],
    },
    { createProvider: forDraft(draft) },
  )
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  await draftBox()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toContain('Known tags: (none)')
  expect(requests[0]).not.toContain('rahasia')
})

test('the draft uses the main model, uncached, even when a fast model is set', async () => {
  const drafts: { model: string; cache?: boolean }[] = []
  const draft: CreateProvider = (cfg) => ({
    stream: (req) => {
      drafts.push({ model: cfg.model, cache: req.cache })
      return replyWith(REPLY)(cfg).stream(req)
    },
  })
  const { user } = await renderApp(
    `/chat/${DATE}`,
    { settings: { ai: { ...ai, fastModel: 'claude-haiku-4-5' } }, chats: CHATS, entries: [{ date: DATE, markdown: 'Pagi.', mood: null }] },
    { createProvider: forDraft(draft) },
  )
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  await draftBox()
  expect(drafts).toEqual([{ model: 'claude-opus-5', cache: undefined }])
})

test('an old draft does not come back after the conversation is deleted', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const { user } = await open(replyWith(REPLY))
  await user.click(await screen.findByRole('button', { name: 'Simpan jadi diary' }))
  await draftBox()
  await user.click(screen.getByRole('button', { name: 'Hapus percakapan ini' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Simpan jadi diary' })).not.toBeInTheDocument())
  await user.type(screen.getByRole('textbox', { name: 'Pesan' }), 'halo baru{Enter}')
  await screen.findByRole('button', { name: 'Simpan jadi diary' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan jadi diary' })).toBeEnabled())
  expect(screen.queryByRole('textbox', { name: 'Tulisan untuk diary' })).not.toBeInTheDocument()
})

test('the button is disabled while a reply is streaming', async () => {
  const c = controllable()
  const { user } = await renderApp(`/chat/${DATE}`, { settings: { ai }, chats: CHATS }, { createProvider: c.createProvider })
  expect(await screen.findByRole('button', { name: 'Simpan jadi diary' })).toBeEnabled()
  await user.type(screen.getByRole('textbox', { name: 'Pesan' }), 'lanjut{Enter}')
  await waitFor(() => expect(c.requests.length).toBeGreaterThan(0))
  expect(screen.getByRole('button', { name: 'Simpan jadi diary' })).toBeDisabled()
  c.push('oke')
  c.finish()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan jadi diary' })).toBeEnabled())
})
