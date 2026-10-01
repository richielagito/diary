import JSZip from 'jszip'
import { withDerived } from '../storage/DexieDiaryRepository'
import { buildExportZip, exportFileName } from './exportZip'

const NOW = Date.parse('2026-09-27T05:00:00Z')
const entries = [
  withDerived({ date: '2025-12-31', markdown: 'akhir tahun', mood: 5, createdAt: NOW, updatedAt: NOW }),
  withDerived({ date: '2026-09-27', markdown: 'hari ini #kuliah', mood: null, createdAt: NOW, updatedAt: NOW }),
]

test('file name uses local date', () => {
  expect(exportFileName(new Date(2026, 8, 27, 23, 30))).toBe('diary-export-2026-09-27.zip')
})

test('zip contains manifest and one md per entry grouped by year', async () => {
  const zip = await JSZip.loadAsync(await buildExportZip(entries, NOW))
  expect(Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()).toEqual([
    'entries/2025/2025-12-31.md',
    'entries/2026/2026-09-27.md',
    'manifest.json',
  ])
  expect(JSON.parse(await zip.file('manifest.json')!.async('string'))).toEqual({
    app: 'diary',
    formatVersion: 1,
    exportedAt: '2026-09-27T05:00:00.000Z',
    count: 2,
    chatCount: 0,
    memoryCount: 0,
  })
  const md = await zip.file('entries/2026/2026-09-27.md')!.async('string')
  expect(md).toBe(
    '---\ndate: 2026-09-27\nmood: null\ncreated: 2026-09-27T12:00:00+07:00\nupdated: 2026-09-27T12:00:00+07:00\n---\nhari ini #kuliah\n',
  )
})

test('tags are exported without serializer escapes so other apps read them whole', async () => {
  const tagged = withDerived({ date: '2026-09-27', markdown: 'hari #self\\_care', mood: null, createdAt: NOW, updatedAt: NOW })
  const zip = await JSZip.loadAsync(await buildExportZip([tagged], NOW))
  const md = await zip.file('entries/2026/2026-09-27.md')!.async('string')
  expect(md).toContain('\nhari #self_care\n')
})

test('memories are exported to memories.json with a count', async () => {
  const m = { id: 'm1', text: 'Punya kucing', source: 'auto' as const, createdAt: 2, updatedAt: 2 }
  const zip = await JSZip.loadAsync(await buildExportZip([], NOW, [], [m]))
  expect(JSON.parse(await zip.file('memories.json')!.async('string'))).toEqual([m])
  expect(JSON.parse(await zip.file('manifest.json')!.async('string')).memoryCount).toBe(1)
})

test('empty diary exports manifest only', async () => {
  const zip = await JSZip.loadAsync(await buildExportZip([], NOW))
  expect(JSON.parse(await zip.file('manifest.json')!.async('string')).count).toBe(0)
})
