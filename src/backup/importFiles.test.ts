import JSZip from 'jszip'
import { serializeEntry } from '../domain/frontmatter'
import { extractTags } from '../domain/tags'
import type { ChatMessage } from '../storage/ChatRepository'
import { DexieChatRepository } from '../storage/DexieChatRepository'
import { withDerived } from '../storage/DexieDiaryRepository'
import { DiaryDB } from '../storage/db'
import { buildExportZip } from './exportZip'
import { buildPreview, readImportFiles } from './importFiles'

const NOW = Date.parse('2026-10-01T00:00:00Z')
const file = (name: string, content: string | Uint8Array) => new File([content as BlobPart], name)
// createdAt/updatedAt use whole seconds: toLocalIso (src/domain/date.ts, from an earlier task)
// serializes timestamps without milliseconds, so a sub-second value like 1 (ms) would round-trip
// through export/import as 0, not 1 - unrelated to this task's import logic.
const entry = (date: string, markdown: string, updatedAt = 1000) =>
  withDerived({ date, markdown, mood: 3, createdAt: 1000, updatedAt })

test('reads own export zip back into identical inputs', async () => {
  const entries = [entry('2026-09-01', 'satu'), entry('2026-09-02', 'dua #x')]
  const zipBytes = await buildExportZip(entries, NOW)
  const parsed = await readImportFiles([file('diary-export-2026-10-01.zip', zipBytes)], NOW)
  expect(parsed.invalid).toEqual([])
  expect(parsed.valid).toEqual(entries.map(({ tags: _t, wordCount: _w, ...rest }) => rest))
})

test('memories round-trip; invalid items are skipped; text is capped', async () => {
  const good = { id: 'm1', text: 'Punya kucing', source: 'user', createdAt: 1, updatedAt: 2 }
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ app: 'diary', formatVersion: 1 }))
  zip.file('memories.json', JSON.stringify([good, { id: 5 }, { ...good, id: 'm2', text: 'x'.repeat(300) }]))
  const parsed = await readImportFiles([file('b.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  expect(parsed.memories).toEqual([good, { ...good, id: 'm2', text: 'x'.repeat(200) }])
  expect(parsed.skippedMemories).toBe(1)
})

test('duplicate memory ids across the batch are deduplicated', async () => {
  const good = { id: 'm1', text: 'Punya kucing', source: 'user', createdAt: 1, updatedAt: 2 }
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ app: 'diary', formatVersion: 1 }))
  zip.file('memories.json', JSON.stringify([good, { ...good, text: 'lain' }]))
  const parsed = await readImportFiles([file('b.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  expect(parsed.memories).toEqual([good])
})

test('a broken chats.json or memories.json does not block the diary entries', async () => {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ app: 'diary', formatVersion: 1 }))
  zip.file('entries/2026/2026-09-01.md', 'isi')
  zip.file('chats.json', '{rusak')
  zip.file('memories.json', '{"bukan": "array"}')
  const parsed = await readImportFiles([file('b.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  expect(parsed.valid.map((e) => e.date)).toEqual(['2026-09-01'])
  expect(parsed.invalid).toEqual([])
  expect([parsed.skippedChats, parsed.skippedMemories]).toEqual([1, 1])
})

test('exported escaped tag imports back with the same tag', async () => {
  const zipBytes = await buildExportZip([entry('2026-09-01', 'hari #self\\_care')], NOW)
  const parsed = await readImportFiles([file('diary-export-2026-10-01.zip', zipBytes)], NOW)
  expect(extractTags(parsed.valid[0].markdown)).toEqual(['self_care'])
})

test('loose md files, with and without frontmatter', async () => {
  const parsed = await readImportFiles(
    [file('2026-09-02.md', 'polos saja'), file('x.md', serializeEntry(entry('2026-09-01', 'fm')))],
    NOW,
  )
  expect(parsed.valid.map((e) => [e.date, e.markdown])).toEqual([
    ['2026-09-01', 'fm'],
    ['2026-09-02', 'polos saja'],
  ])
})

test('invalid files reported without failing others', async () => {
  const parsed = await readImportFiles(
    [file('2026-02-30.md', 'x'), file('foto.jpg', 'x'), file('2026-09-01.md', 'ok')],
    NOW,
  )
  expect(parsed.valid.map((e) => e.date)).toEqual(['2026-09-01'])
  expect(parsed.invalid).toEqual([
    { fileName: '2026-02-30.md', reason: 'invalidDate' },
    { fileName: 'foto.jpg', reason: 'unsupportedFile' },
  ])
})

test('zip with unsupported format version rejected', async () => {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ app: 'diary', formatVersion: 2 }))
  zip.file('entries/2026/2026-09-01.md', 'x')
  const parsed = await readImportFiles([file('lama.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  expect(parsed).toEqual({ valid: [], invalid: [{ fileName: 'lama.zip', reason: 'formatVersion' }], chats: [], skippedChats: 0, memories: [], skippedMemories: 0 })
})

test('zip without manifest (plain folder of md) accepted, non-md ignored', async () => {
  const zip = new JSZip()
  zip.file('vault/2026-09-01.md', 'a')
  zip.file('vault/.obsidian/app.json', '{}')
  const parsed = await readImportFiles([file('vault.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  expect(parsed.valid.map((e) => e.date)).toEqual(['2026-09-01'])
  expect(parsed.invalid).toEqual([])
})

test('duplicate dates keep newest updatedAt', async () => {
  const parsed = await readImportFiles(
    [
      file('a.md', serializeEntry(entry('2026-09-01', 'lama', 1))),
      file('b.md', serializeEntry(entry('2026-09-01', 'baru', 5000))),
    ],
    NOW,
  )
  expect(parsed.valid.map((e) => e.markdown)).toEqual(['baru'])
})

test('corrupt (non-zip) .zip file reported without failing other files', async () => {
  const parsed = await readImportFiles([file('rusak.zip', 'bukan zip'), file('2026-09-01.md', 'ok')], NOW)
  expect(parsed.valid.map((e) => e.date)).toEqual(['2026-09-01'])
  expect(parsed.invalid).toEqual([{ fileName: 'rusak.zip', reason: 'unreadable' }])
})

test('zip with unparsable manifest.json reported as unreadable', async () => {
  const zip = new JSZip()
  zip.file('manifest.json', '{not json')
  zip.file('entries/2026/2026-09-01.md', 'x')
  const parsed = await readImportFiles([file('rusak2.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  expect(parsed).toEqual({ valid: [], invalid: [{ fileName: 'rusak2.zip', reason: 'unreadable' }], chats: [], skippedChats: 0, memories: [], skippedMemories: 0 })
})

test('buildPreview counts new vs conflicting', () => {
  const parsed = { valid: [entry('2026-09-01', 'a'), entry('2026-09-02', 'b')], invalid: [], chats: [], skippedChats: 0, memories: [], skippedMemories: 0 }
  expect(buildPreview(parsed, new Set(['2026-09-02']))).toEqual({ newCount: 1, conflictCount: 1 })
})

const chat = (id: string, date: string, createdAt: number, role: ChatMessage['role'] = 'user'): ChatMessage => ({
  id,
  date,
  role,
  content: `pesan ${id}`,
  createdAt,
  status: role === 'assistant' ? 'stopped' : 'complete',
})

test('chat history survives an export/import round trip identically', async () => {
  const chats = [chat('c3', '2026-09-02', 5, 'assistant'), chat('c1', '2026-09-01', 9), chat('c2', '2026-09-02', 1)]
  const zip = await JSZip.loadAsync(await buildExportZip([entry('2026-09-01', 'satu')], NOW, chats))
  expect(JSON.parse(await zip.file('manifest.json')!.async('string')).chatCount).toBe(3)

  const parsed = await readImportFiles([file('diary-export-2026-10-01.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  const sorted = [chats[1], chats[2], chats[0]]
  expect(parsed.chats).toEqual(sorted)
  expect(parsed.skippedChats).toBe(0)

  const db = new DiaryDB(`test-${crypto.randomUUID()}`)
  const repo = new DexieChatRepository(db)
  expect(await repo.importMany(parsed.chats)).toBe(3)
  expect(await repo.listAll()).toEqual(sorted)
  const again = await readImportFiles([file('diary-export-2026-10-01.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  expect(await repo.importMany(again.chats)).toBe(0)
  expect(await repo.listAll()).toEqual(sorted)
  db.close()
  await db.delete()
})

test('export without chats writes no chats.json', async () => {
  const zip = await JSZip.loadAsync(await buildExportZip([entry('2026-09-01', 'satu')], NOW))
  expect(zip.file('chats.json')).toBeNull()
})

test('invalid chat items are skipped and counted, valid ones kept', async () => {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ app: 'diary', formatVersion: 1 }))
  const good = chat('ok', '2026-09-01', 1)
  zip.file(
    'chats.json',
    JSON.stringify([
      good,
      { ...chat('x1', '2026-02-30', 1) },
      { ...chat('x2', '2026-09-01', 1), role: 'system' },
      { ...chat('x3', '2026-09-01', 1), status: 'failed' },
      { ...chat('x4', '2026-09-01', 1), createdAt: '1' },
      { ...chat('x5', '2026-09-01', 1), content: 5 },
      { ...chat('x6', '2026-09-01', 1), id: 6 },
      null,
    ]),
  )
  const parsed = await readImportFiles([file('b.zip', await zip.generateAsync({ type: 'uint8array' }))], NOW)
  expect(parsed.chats).toEqual([good])
  expect(parsed.skippedChats).toBe(7)
  expect(parsed.invalid).toEqual([])
})

test('loose files never produce chats', async () => {
  const parsed = await readImportFiles([file('chats.json', JSON.stringify([chat('a', '2026-09-01', 1)]))], NOW)
  expect(parsed.chats).toEqual([])
  expect(parsed.invalid).toEqual([{ fileName: 'chats.json', reason: 'unsupportedFile' }])
})
