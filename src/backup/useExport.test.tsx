import JSZip from 'jszip'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { RepoProvider } from '../app/RepoContext'
import { DexieChatRepository } from '../storage/DexieChatRepository'
import { DexieMemoryRepository } from '../storage/DexieMemoryRepository'
import { DexieLetterRepository } from '../storage/DexieLetterRepository'
import { DexieSummaryRepository } from '../storage/DexieSummaryRepository'
import { DiaryDB } from '../storage/db'
import { DexieDiaryRepository } from '../storage/DexieDiaryRepository'
import { DexieSettingsStore } from '../storage/DexieSettingsStore'
import { defaultSettings } from '../storage/SettingsStore'
import { useExport } from './useExport'

test('downloads zip and records lastExportAt', async () => {
  const db = new DiaryDB(`test-${crypto.randomUUID()}`)
  const diary = new DexieDiaryRepository(db)
  const settingsStore = new DexieSettingsStore(db, defaultSettings('id'))
  await diary.save('2026-09-27', { markdown: 'isi' })
  const chats = new DexieChatRepository(db)
  const saved = await chats.add({ date: '2026-09-27', role: 'user', content: 'curhat', createdAt: 1, status: 'complete' })

  const blobs: Blob[] = []
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b)
    return 'blob:x'
  })
  URL.revokeObjectURL = vi.fn()
  const clicked: string[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this.download)
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepoProvider diary={diary} settingsStore={settingsStore} chats={chats} memories={new DexieMemoryRepository(db)} summaries={new DexieSummaryRepository(db)} letters={new DexieLetterRepository(db)} createProvider={() => { throw new Error('unused') }}>
      {children}
    </RepoProvider>
  )
  const { result } = renderHook(() => useExport(), { wrapper })
  await vi.waitFor(() => expect(result.current).toBeTypeOf('function'))
  await act(() => result.current())

  const zip = await JSZip.loadAsync(await blobs[0].arrayBuffer())
  expect(JSON.parse(await zip.file('chats.json')!.async('string'))).toEqual([saved])
  expect(clicked).toHaveLength(1)
  expect(clicked[0]).toMatch(/^diary-export-\d{4}-\d{2}-\d{2}\.zip$/)
  expect((await settingsStore.getAll()).lastExportAt).toBeTypeOf('number')
})

test('shows alert and does not record lastExportAt on export failure', async () => {
  const db = new DiaryDB(`test-${crypto.randomUUID()}`)
  const diary = new DexieDiaryRepository(db)
  const settingsStore = new DexieSettingsStore(db, defaultSettings('id'))

  const listSpy = vi.spyOn(diary, 'list').mockRejectedValue(new Error('boom'))
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepoProvider diary={diary} settingsStore={settingsStore} chats={new DexieChatRepository(db)} memories={new DexieMemoryRepository(db)} summaries={new DexieSummaryRepository(db)} letters={new DexieLetterRepository(db)} createProvider={() => { throw new Error('unused') }}>
      {children}
    </RepoProvider>
  )
  const { result } = renderHook(() => useExport(), { wrapper })
  await vi.waitFor(() => expect(result.current).toBeTypeOf('function'))
  await act(() => result.current())

  expect(alertSpy).toHaveBeenCalledWith('Export gagal. Coba lagi.')
  expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
  expect((await settingsStore.getAll()).lastExportAt).toBeNull()

  listSpy.mockRestore()
  alertSpy.mockRestore()
  errorSpy.mockRestore()
})
