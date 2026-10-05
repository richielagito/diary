import { screen, waitFor } from '@testing-library/react'
import type { ParsedImport } from '../../backup/importFiles'
import { renderWithRepos } from '../../test/renderApp'
import { ImportDialog } from './ImportDialog'

const parsed: ParsedImport = {
  valid: [
    { date: '2026-09-01', markdown: 'impor', mood: 3, createdAt: 1, updatedAt: 2 },
    { date: '2026-09-02', markdown: 'baru', mood: null, createdAt: 1, updatedAt: 2 },
  ],
  invalid: [{ fileName: '2026-02-30.md', reason: 'invalidDate' }],
  chats: [],
  skippedChats: 0,
  memories: [],
  skippedMemories: 0,
}

test('shows preview counts and invalid reasons', async () => {
  await renderWithRepos(<ImportDialog parsed={parsed} existing={new Set(['2026-09-01'])} onClose={() => {}} />)
  expect(await screen.findByText('1 entri baru')).toBeInTheDocument()
  expect(screen.getByText('1 entri bentrok dengan yang sudah ada')).toBeInTheDocument()
  expect(screen.getByText('1 file tidak valid')).toBeInTheDocument()
  expect(screen.getByText('2026-02-30.md: tanggal tidak valid')).toBeInTheDocument()
})

test('skip by default keeps existing, reports result', async () => {
  const { diary, user } = await renderWithRepos(
    <ImportDialog parsed={parsed} existing={new Set(['2026-09-01'])} onClose={() => {}} />,
    { entries: [{ date: '2026-09-01', markdown: 'asli' }] },
  )
  await user.click(await screen.findByRole('button', { name: 'Impor' }))
  expect(await screen.findByText('Selesai: 1 ditambah, 0 ditimpa, 1 dilewati.')).toBeInTheDocument()
  expect((await diary.get('2026-09-01'))?.markdown).toBe('asli')
  expect((await diary.get('2026-09-02'))?.markdown).toBe('baru')
})

test('overwrite option replaces existing', async () => {
  const { diary, user } = await renderWithRepos(
    <ImportDialog parsed={parsed} existing={new Set(['2026-09-01'])} onClose={() => {}} />,
    { entries: [{ date: '2026-09-01', markdown: 'asli' }] },
  )
  await user.click(await screen.findByRole('radio', { name: 'Timpa' }))
  await user.click(screen.getByRole('button', { name: 'Impor' }))
  await waitFor(async () => expect((await diary.get('2026-09-01'))?.markdown).toBe('impor'))
})

test('failure shows message and changes nothing', async () => {
  const { diary, user } = await renderWithRepos(
    <ImportDialog parsed={parsed} existing={new Set()} onClose={() => {}} />,
  )
  vi.spyOn(diary, 'importMany').mockRejectedValue(new Error('boom'))
  await user.click(await screen.findByRole('button', { name: 'Impor' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Impor gagal. Tidak ada data yang berubah.')
})

test('cancel calls onClose', async () => {
  const onClose = vi.fn()
  const { user } = await renderWithRepos(<ImportDialog parsed={parsed} existing={new Set()} onClose={onClose} />)
  await user.click(await screen.findByRole('button', { name: 'Batal' }))
  expect(onClose).toHaveBeenCalled()
})

test('chat messages are previewed, restored after the entries and reported', async () => {
  const withChats: ParsedImport = {
    ...parsed,
    chats: [
      { id: 'a', date: '2026-09-01', role: 'user', content: 'curhat', createdAt: 1, status: 'complete' },
      { id: 'b', date: '2026-09-01', role: 'assistant', content: 'balasan', createdAt: 2, status: 'complete' },
    ],
  }
  const { chats, diary, user } = await renderWithRepos(
    <ImportDialog parsed={withChats} existing={new Set()} onClose={() => {}} />,
  )
  expect(await screen.findByText('2 pesan curhat')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Impor' }))
  expect(await screen.findByText('Selesai: 2 ditambah, 0 ditimpa, 0 dilewati.')).toBeInTheDocument()
  expect(screen.getByText('2 pesan curhat dipulihkan.')).toBeInTheDocument()
  expect((await chats.listAll()).map((m) => m.id)).toEqual(['a', 'b'])
  expect((await diary.get('2026-09-01'))?.markdown).toBe('impor')
})

test('a chats-only import can be confirmed', async () => {
  const chatsOnly: ParsedImport = {
    valid: [],
    invalid: [],
    chats: [{ id: 'a', date: '2026-09-01', role: 'user', content: 'curhat', createdAt: 1, status: 'complete' }],
    skippedChats: 0,
    memories: [],
    skippedMemories: 0,
  }
  const { chats, user } = await renderWithRepos(<ImportDialog parsed={chatsOnly} existing={new Set()} onClose={() => {}} />)
  expect(await screen.findByText('1 pesan curhat')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Impor' }))
  expect(await screen.findByText('1 pesan curhat dipulihkan.')).toBeInTheDocument()
  expect(await chats.listAll()).toHaveLength(1)
})

const memory = { id: 'm1', text: 'Punya kucing', source: 'auto' as const, createdAt: 1, updatedAt: 1 }

test('memories are previewed, restored and reported', async () => {
  const withMemories: ParsedImport = { ...parsed, memories: [memory] }
  const { memories, user } = await renderWithRepos(<ImportDialog parsed={withMemories} existing={new Set()} onClose={() => {}} />)
  expect(await screen.findByText('1 memori AI')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Impor' }))
  expect(await screen.findByText('1 memori AI dipulihkan.')).toBeInTheDocument()
  expect((await memories.list()).map((m) => m.id)).toEqual(['m1'])
})

test('a memory restore failure keeps the diary result and shows an alert', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const withMemories: ParsedImport = { ...parsed, memories: [memory] }
  const { memories, user } = await renderWithRepos(<ImportDialog parsed={withMemories} existing={new Set()} onClose={() => {}} />)
  vi.spyOn(memories, 'importMany').mockRejectedValue(new Error('quota'))
  await user.click(await screen.findByRole('button', { name: 'Impor' }))
  expect(await screen.findByText('Selesai: 2 ditambah, 0 ditimpa, 0 dilewati.')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Memori AI gagal dipulihkan.')
  errorSpy.mockRestore()
})

test('skipped chat and memory parts are mentioned', async () => {
  const damaged: ParsedImport = { ...parsed, skippedChats: 2, skippedMemories: 1 }
  await renderWithRepos(<ImportDialog parsed={damaged} existing={new Set()} onClose={() => {}} />)
  expect(await screen.findByText('2 bagian riwayat curhat rusak dan dilewati')).toBeInTheDocument()
  expect(screen.getByText('1 bagian memori AI rusak dan dilewati')).toBeInTheDocument()
})

test('no skipped line when nothing was skipped', async () => {
  await renderWithRepos(<ImportDialog parsed={parsed} existing={new Set()} onClose={() => {}} />)
  expect(await screen.findByText('2 entri baru')).toBeInTheDocument()
  expect(screen.queryByText(/rusak dan dilewati/)).not.toBeInTheDocument()
})

test('no chat line when the import has no chats', async () => {
  await renderWithRepos(<ImportDialog parsed={parsed} existing={new Set()} onClose={() => {}} />)
  expect(await screen.findByText('2 entri baru')).toBeInTheDocument()
  expect(screen.queryByText(/pesan curhat/)).not.toBeInTheDocument()
})

test('a chat restore failure after a successful diary import reports both parts accurately', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const withChats: ParsedImport = {
    ...parsed,
    chats: [{ id: 'a', date: '2026-09-01', role: 'user', content: 'curhat', createdAt: 1, status: 'complete' }],
  }
  const { chats, diary, user } = await renderWithRepos(<ImportDialog parsed={withChats} existing={new Set()} onClose={() => {}} />)
  vi.spyOn(chats, 'importMany').mockRejectedValue(new Error('quota'))
  await user.click(await screen.findByRole('button', { name: 'Impor' }))
  expect(await screen.findByText('Selesai: 2 ditambah, 0 ditimpa, 0 dilewati.')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Entri diary sudah diimpor, tapi pesan curhat gagal dipulihkan.')
  expect(screen.queryByText('Impor gagal. Tidak ada data yang berubah.')).not.toBeInTheDocument()
  expect(screen.queryByText('1 pesan curhat dipulihkan.')).not.toBeInTheDocument()
  expect((await diary.get('2026-09-02'))?.markdown).toBe('baru')
  expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
  errorSpy.mockRestore()
})
