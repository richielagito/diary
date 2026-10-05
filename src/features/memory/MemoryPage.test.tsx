import { screen, waitFor, within } from '@testing-library/react'
import { extractMemories } from '../../ai/memory/extractMemories'
import type { AiConfig } from '../../ai/provider/types'
import { failWith, replyWith } from '../../test/fakeProvider'
import { renderApp } from '../../test/renderApp'

const ai: AiConfig = { provider: 'anthropic', apiKey: 'k', baseUrl: '', model: 'claude-opus-5' }

test('lists memories with their source, and edits make them yours', async () => {
  const { memories, user } = await renderApp('/memory', { memories: [{ text: 'Punya kucing Mochi', source: 'auto' }] })
  const item = await screen.findByRole('textbox', { name: 'Memori 1' })
  expect(item).toHaveValue('Punya kucing Mochi')
  expect(screen.getByText('Dicatat AI')).toBeInTheDocument()
  await user.clear(item)
  await user.type(item, 'Punya dua kucing')
  await waitFor(async () => expect((await memories.list())[0]).toMatchObject({ text: 'Punya dua kucing', source: 'user' }))
})

test('clearing a memory textbox never deletes it; the Hapus button does', async () => {
  const { memories, user } = await renderApp('/memory', { memories: [{ text: 'a', source: 'auto' }, { text: 'b', source: 'user' }] })
  const first = await screen.findByRole('textbox', { name: 'Memori 1' })
  await user.clear(first)
  expect(await memories.list()).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Hapus: b' }))
  // One memory asks first; nothing is gone until the user says yes.
  expect(await memories.list()).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await waitFor(async () => expect((await memories.list()).map((m) => m.text)).toEqual(['a']))
})

test('add and clear all', async () => {
  const { memories, user } = await renderApp('/memory')
  expect(await screen.findByText('Belum ada memori.')).toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: 'Tambah memori' }), 'Kuliah di ITB')
  await user.click(screen.getByRole('button', { name: 'Tambah' }))
  await waitFor(async () => expect((await memories.list()).map((m) => [m.text, m.source])).toEqual([['Kuliah di ITB', 'user']]))
  await user.click(screen.getByRole('button', { name: 'Hapus semua memori' }))
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await waitFor(async () => expect(await memories.list()).toEqual([]))
  vi.restoreAllMocks()
})

test('toggles update settings', async () => {
  const { settingsStore, user } = await renderApp('/memory')
  await user.click(await screen.findByRole('checkbox', { name: 'Izinkan AI mengingat' }))
  await user.click(screen.getByRole('checkbox', { name: 'Buat ringkasan mingguan dan bulanan' }))
  await waitFor(async () => expect(await settingsStore.getAll()).toMatchObject({ aiMemoryEnabled: false, aiSummariesEnabled: false }))
})

test('refresh needs AI; with AI it reports the result', async () => {
  await renderApp('/memory')
  expect(await screen.findByText('Atur AI di Pengaturan untuk memperbarui memori.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Perbarui dari percakapan' })).toBeDisabled()
})

test('refresh runs extraction and shows counts', async () => {
  const { user } = await renderApp(
    '/memory',
    { settings: { ai }, chats: [{ date: '2026-09-20', role: 'user', content: 'aku punya kucing', createdAt: 5, status: 'complete' }] },
    { createProvider: replyWith(JSON.stringify({ add: ['Punya kucing'] })) },
  )
  await user.click(await screen.findByRole('button', { name: 'Perbarui dari percakapan' }))
  expect(await screen.findByText('Memori diperbarui: 1 baru, 0 diubah, 0 dihapus.')).toBeInTheDocument()
  expect(await screen.findByDisplayValue('Punya kucing')).toBeInTheDocument()
})

test('refresh reports nothing to do and provider errors', async () => {
  const first = await renderApp('/memory', { settings: { ai } }, { createProvider: replyWith('{}') })
  await first.user.click(await screen.findByRole('button', { name: 'Perbarui dari percakapan' }))
  expect(await screen.findByText('Belum ada percakapan baru untuk diproses.')).toBeInTheDocument()
})

test('refresh shows a provider error', async () => {
  const { user } = await renderApp(
    '/memory',
    { settings: { ai }, chats: [{ date: '2026-09-20', role: 'user', content: 'x', createdAt: 5, status: 'complete' }] },
    { createProvider: failWith('auth') },
  )
  await user.click(await screen.findByRole('button', { name: 'Perbarui dari percakapan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('API key ditolak. Periksa key di Pengaturan.')
})

test('manual refresh uses the fast model', async () => {
  const models: string[] = []
  const reply = replyWith(JSON.stringify({ add: ['Punya kucing'] }))
  const { user } = await renderApp(
    '/memory',
    { settings: { ai }, chats: [{ date: '2026-09-20', role: 'user', content: 'aku punya kucing', createdAt: 5, status: 'complete' }] },
    {
      createProvider: (config) => {
        models.push(config.model)
        return reply(config)
      },
    },
  )
  await user.click(await screen.findByRole('button', { name: 'Perbarui dari percakapan' }))
  expect(await screen.findByText('Memori diperbarui: 1 baru, 0 diubah, 0 dihapus.')).toBeInTheDocument()
  expect(models).toEqual(['claude-haiku-4-5'])
})

test('summaries are listed newest first and can be deleted', async () => {
  const { summaries, user } = await renderApp('/memory', {
    summaries: [
      { id: 'week:2026-09-14', kind: 'week', periodStart: '2026-09-14', periodEnd: '2026-09-20', text: 'minggu sibuk', entryCount: 1, sourceUpdatedAt: 1, createdAt: 1 },
      { id: 'month:2026-08', kind: 'month', periodStart: '2026-08-01', periodEnd: '2026-08-31', text: 'agustus tenang', entryCount: 1, sourceUpdatedAt: 1, createdAt: 1 },
    ],
  })
  const list = await screen.findByRole('list', { name: 'Ringkasan' })
  const items = within(list).getAllByRole('listitem')
  expect(items[0]).toHaveTextContent('minggu sibuk')
  expect(items[1]).toHaveTextContent('agustus tenang')
  await user.click(within(items[0]).getByRole('button', { name: /Hapus/ }))
  await user.click(within(items[0]).getByRole('button', { name: 'Ya, hapus' }))
  await waitFor(async () => expect((await summaries.list()).map((s) => s.id)).toEqual(['month:2026-08']))
})

test('turning memory on moves the cursor so earlier chats are not extracted', async () => {
  const { settingsStore, user } = await renderApp('/memory', { settings: { aiMemoryEnabled: false } })
  expect((await settingsStore.getAll()).memoryCursor).toBe(0)
  await user.click(await screen.findByRole('checkbox', { name: 'Izinkan AI mengingat' }))
  await waitFor(async () => expect((await settingsStore.getAll()).memoryCursor).toBeGreaterThan(0))
})

test('manual refresh is disabled and never calls the provider while memory is off', async () => {
  const createProvider = vi.fn(replyWith('{}'))
  await renderApp(
    '/memory',
    { settings: { ai, aiMemoryEnabled: false }, chats: [{ date: '2026-09-20', role: 'user', content: 'x', createdAt: 5, status: 'complete' }] },
    { createProvider },
  )
  expect(await screen.findByRole('button', { name: 'Perbarui dari percakapan' })).toBeDisabled()
  expect(screen.getByText('Memori sedang dimatikan, jadi tidak bisa diperbarui.')).toBeInTheDocument()
  expect(createProvider).not.toHaveBeenCalled()
})

test('a throwing refresh shows an error and re-enables the button', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { user } = await renderApp(
    '/memory',
    { settings: { ai }, chats: [{ date: '2026-09-20', role: 'user', content: 'x', createdAt: 5, status: 'complete' }] },
    {
      createProvider: () => {
        throw new Error('boom')
      },
    },
  )
  await user.click(await screen.findByRole('button', { name: 'Perbarui dari percakapan' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Perbarui dari percakapan' })).toBeEnabled()
  vi.restoreAllMocks()
})

test('turning memory off leaves the cursor unchanged', async () => {
  const { settingsStore, user } = await renderApp('/memory', { settings: { memoryCursor: 42 } })
  await user.click(await screen.findByRole('checkbox', { name: 'Izinkan AI mengingat' }))
  await waitFor(async () => expect((await settingsStore.getAll()).aiMemoryEnabled).toBe(false))
  expect((await settingsStore.getAll()).memoryCursor).toBe(42)
})

test('an unfocused textarea follows the stored text', async () => {
  const { memories } = await renderApp('/memory', { memories: [{ text: 'lama', source: 'auto' }] })
  const box = await screen.findByRole('textbox', { name: 'Memori 1' })
  const [m] = await memories.list()
  await memories.put({ ...m, text: 'baru', updatedAt: 99 })
  await waitFor(() => expect(box).toHaveValue('baru'))
})

const STORAGE_ALERT = 'Gagal menyimpan ke perangkat ini. Periksa ruang penyimpanan lalu coba lagi.'

test('a storage failure shows an alert that clears on the next successful change', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { memories, user } = await renderApp('/memory')
  const boom = new Error('disk full')
  vi.spyOn(memories, 'add').mockRejectedValueOnce(boom)
  await user.type(await screen.findByRole('textbox', { name: 'Tambah memori' }), 'Kuliah di ITB')
  await user.click(screen.getByRole('button', { name: 'Tambah' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(STORAGE_ALERT)
  expect(errorSpy).toHaveBeenCalledWith(boom)
  expect(screen.getByRole('textbox', { name: 'Tambah memori' })).toHaveValue('Kuliah di ITB')
  await user.click(screen.getByRole('button', { name: 'Tambah' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect((await memories.list()).map((m) => m.text)).toEqual(['Kuliah di ITB'])
  vi.restoreAllMocks()
})

test('failing deletes, edits, clear all and toggles also show the storage alert', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { memories, summaries, settingsStore, user } = await renderApp('/memory', {
    memories: [{ text: 'a', source: 'auto' }],
    summaries: [{ id: 'month:2026-08', kind: 'month', periodStart: '2026-08-01', periodEnd: '2026-08-31', text: 'agustus', entryCount: 1, sourceUpdatedAt: 1, createdAt: 1 }],
  })
  const expectAlert = async () => expect(await screen.findByRole('alert')).toHaveTextContent(STORAGE_ALERT)
  const expectNoAlert = () => waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())

  vi.spyOn(memories, 'remove').mockRejectedValueOnce(new Error('x'))
  await user.click(await screen.findByRole('button', { name: 'Hapus: a' }))
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await expectAlert()

  const edit = vi.spyOn(memories, 'edit').mockResolvedValueOnce()
  await user.type(screen.getByRole('textbox', { name: 'Memori 1' }), 'b')
  await expectNoAlert()
  edit.mockRejectedValueOnce(new Error('x'))
  await user.type(screen.getByRole('textbox', { name: 'Memori 1' }), 'c')
  await expectAlert()

  vi.spyOn(summaries, 'remove').mockResolvedValueOnce()
  await user.click(screen.getByRole('button', { name: /^Hapus: Agustus/ }))
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await expectNoAlert()
  vi.spyOn(memories, 'clear').mockRejectedValueOnce(new Error('x'))
  await user.click(screen.getByRole('button', { name: 'Hapus semua memori' }))
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await expectAlert()

  vi.spyOn(settingsStore, 'set').mockResolvedValueOnce().mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'))
  await user.click(screen.getByRole('checkbox', { name: 'Buat ringkasan mingguan dan bulanan' }))
  await expectNoAlert()
  await user.click(screen.getByRole('checkbox', { name: 'Buat ringkasan mingguan dan bulanan' }))
  await expectAlert()
  await user.click(screen.getByRole('checkbox', { name: 'Izinkan AI mengingat' }))
  await waitFor(() => expect(settingsStore.set).toHaveBeenCalledWith('aiMemoryEnabled', false))
  await expectAlert()
  vi.restoreAllMocks()
})

test('refresh while an extraction is already running says so', async () => {
  const chats = [{ date: '2026-09-20', role: 'user' as const, content: 'x', createdAt: 5, status: 'complete' as const }]
  const repos = await renderApp('/memory', { settings: { ai }, chats }, { createProvider: replyWith('{}') })
  let release: (() => void) | null = null
  const background = extractMemories({
    chats: repos.chats,
    memories: repos.memories,
    settingsStore: repos.settingsStore,
    provider: {
      async *stream() {
        await new Promise<void>((r) => (release = r))
        yield '{}'
      },
    },
    minUserMessages: 1,
  })
  await waitFor(() => expect(release).not.toBeNull())
  await repos.user.click(await screen.findByRole('button', { name: 'Perbarui dari percakapan' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Memori sedang diperbarui di latar belakang. Coba lagi sebentar.')
  release!()
  await background
})

test('adding is blocked at 100 memories', async () => {
  const full = Array.from({ length: 100 }, (_, i) => ({ text: `m${i}`, source: 'auto' as const }))
  await renderApp('/memory', { memories: full })
  expect(await screen.findByText('Sudah ada 100 memori. Hapus beberapa dulu.')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Tambah memori' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Tambah' })).toBeDisabled()
})

test('clear all memories also removes stored Wrapped letters', async () => {
  const { letters, user } = await renderApp('/memory', {
    memories: [{ text: 'a', source: 'auto' }],
    letters: [{ periodId: '2026-09', text: 'Surat', fingerprint: 'f', createdAt: 1 }],
  })
  expect(await letters.get('2026-09')).toBeDefined()
  await user.click(await screen.findByRole('button', { name: 'Hapus semua memori' }))
  await user.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await waitFor(async () => expect(await letters.get('2026-09')).toBeUndefined())
  vi.restoreAllMocks()
})
