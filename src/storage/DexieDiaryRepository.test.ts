import { DiaryDB } from './db'
import { DexieDiaryRepository } from './DexieDiaryRepository'
import { StaleTextError } from './DiaryRepository'

let clock = 1000
let db: DiaryDB
let repo: DexieDiaryRepository

beforeEach(() => {
  clock = 1000
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  repo = new DexieDiaryRepository(db, () => clock)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('save creates entry with derived fields', async () => {
  const e = await repo.save('2026-09-27', { markdown: 'Hari #kuliah seru' })
  expect(e).toEqual({
    date: '2026-09-27',
    markdown: 'Hari #kuliah seru',
    mood: null,
    tags: ['kuliah'],
    wordCount: 3,
    createdAt: 1000,
    updatedAt: 1000,
  })
  expect(await repo.get('2026-09-27')).toEqual(e)
})

test('patch merges with existing, createdAt kept, updatedAt refreshed', async () => {
  await repo.save('2026-09-27', { markdown: 'a' })
  clock = 2000
  const e = await repo.save('2026-09-27', { mood: 5 })
  expect(e).toMatchObject({ markdown: 'a', mood: 5, createdAt: 1000, updatedAt: 2000 })
})

test('mood null clears mood but keeps text', async () => {
  await repo.save('2026-09-27', { markdown: 'a', mood: 3 })
  expect(await repo.save('2026-09-27', { mood: null })).toMatchObject({ markdown: 'a', mood: null })
})

test('empty text and null mood deletes the record', async () => {
  await repo.save('2026-09-27', { markdown: 'a', mood: 2 })
  await repo.save('2026-09-27', { markdown: '   \n' })
  expect(await repo.save('2026-09-27', { mood: null })).toBeNull()
  expect(await repo.get('2026-09-27')).toBeUndefined()
})

test('saving empty on a new day stores nothing', async () => {
  expect(await repo.save('2026-09-27', { markdown: '' })).toBeNull()
  expect(await repo.list()).toEqual([])
})

test('mood-only entry is kept', async () => {
  expect(await repo.save('2026-09-27', { mood: 1 })).toMatchObject({ markdown: '', mood: 1, wordCount: 0 })
})

test('list is sorted and range inclusive', async () => {
  for (const d of ['2026-09-03', '2026-09-01', '2026-09-02', '2026-08-31']) await repo.save(d, { markdown: d })
  expect((await repo.list()).map((e) => e.date)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'])
  expect((await repo.list({ from: '2026-09-01', to: '2026-09-02' })).map((e) => e.date)).toEqual([
    '2026-09-01',
    '2026-09-02',
  ])
})

test('delete removes entry', async () => {
  await repo.save('2026-09-27', { markdown: 'a' })
  await repo.delete('2026-09-27')
  expect(await repo.get('2026-09-27')).toBeUndefined()
})

test('watch emits current value and later changes', async () => {
  const seen: (string | undefined)[] = []
  const unsub = repo.watch('2026-09-27', (e) => seen.push(e?.markdown))
  await vi.waitFor(() => expect(seen).toEqual([undefined]))
  await repo.save('2026-09-27', { markdown: 'baru' })
  await vi.waitFor(() => expect(seen).toEqual([undefined, 'baru']))
  unsub()
  await repo.save('2026-09-27', { markdown: 'lagi' })
  await new Promise((r) => setTimeout(r, 50))
  expect(seen).toEqual([undefined, 'baru'])
})

test('watchFirstCreatedAt tracks earliest createdAt', async () => {
  const seen: (number | null)[] = []
  const unsub = repo.watchFirstCreatedAt((ms) => seen.push(ms))
  await vi.waitFor(() => expect(seen).toEqual([null]))
  clock = 5000
  await repo.save('2026-09-02', { markdown: 'b' })
  await vi.waitFor(() => expect(seen.at(-1)).toBe(5000))
  clock = 7000
  await repo.save('2026-09-03', { markdown: 'c' })
  await new Promise((r) => setTimeout(r, 50))
  expect(seen.at(-1)).toBe(5000)
  unsub()
})

describe('appendToEntry', () => {
  test('creates a missing entry with trimmed text and the mood', async () => {
    const e = await repo.appendToEntry('2026-09-28', '  Halo dunia \n', 4)
    expect(e).toMatchObject({ markdown: 'Halo dunia', mood: 4, createdAt: 1000, updatedAt: 1000 })
    expect(await repo.get('2026-09-28')).toEqual(e)
  })

  test('appends to existing text with a blank line and refreshes updatedAt', async () => {
    await repo.save('2026-09-28', { markdown: 'lama' })
    clock = 2000
    const e = await repo.appendToEntry('2026-09-28', 'baru', null)
    expect(e).toMatchObject({ markdown: 'lama\n\nbaru', createdAt: 1000, updatedAt: 2000 })
  })

  test('sets mood only when the stored mood is null', async () => {
    await repo.save('2026-09-28', { markdown: 'a', mood: 2 })
    expect((await repo.appendToEntry('2026-09-28', 'b', 4)).mood).toBe(2)
    await repo.save('2026-09-29', { markdown: 'a' })
    expect((await repo.appendToEntry('2026-09-29', 'b', 4)).mood).toBe(4)
  })

  test('null moodIfEmpty leaves the mood unchanged', async () => {
    await repo.save('2026-09-28', { markdown: 'a', mood: 3 })
    expect((await repo.appendToEntry('2026-09-28', 'b', null)).mood).toBe(3)
    await repo.save('2026-09-29', { markdown: 'a' })
    expect((await repo.appendToEntry('2026-09-29', 'b', null)).mood).toBeNull()
  })

  test('rejects text that is empty after trim and stores nothing', async () => {
    await expect(repo.appendToEntry('2026-09-28', '  \n ', 3)).rejects.toThrow()
    expect(await repo.get('2026-09-28')).toBeUndefined()
  })

  test('trailing whitespace on existing text gives exactly one blank line', async () => {
    await repo.save('2026-09-28', { markdown: 'lama\n\n  ' })
    expect((await repo.appendToEntry('2026-09-28', 'baru', null)).markdown).toBe('lama\n\nbaru')
  })

  test('whitespace-only existing text counts as empty and keeps its mood', async () => {
    await repo.save('2026-09-28', { markdown: ' \n ', mood: 2 })
    const e = await repo.appendToEntry('2026-09-28', ' baru ', 5)
    expect(e).toMatchObject({ markdown: 'baru', mood: 2 })
  })

  test('derives tags and word count for the appended text', async () => {
    await repo.save('2026-09-28', { markdown: 'pagi' })
    const e = await repo.appendToEntry('2026-09-28', 'siang #kerja lembur', null)
    expect(e.tags).toContain('kerja')
    expect(e.wordCount).toBe(4)
  })
})

describe('save with a base', () => {
  it('writes when the stored text is still the base', async () => {
    await repo.save('2026-10-01', { markdown: 'awal' })
    const entry = await repo.save('2026-10-01', { markdown: 'awal lalu lanjut', baseMarkdown: 'awal' })
    expect(entry!.markdown).toBe('awal lalu lanjut')
  })

  it('writes a first entry when the base is empty', async () => {
    const entry = await repo.save('2026-10-01', { markdown: 'baru', baseMarkdown: '' })
    expect(entry!.markdown).toBe('baru')
  })

  it('refuses to overwrite text that changed since the base, and reports what is stored', async () => {
    await repo.save('2026-10-01', { markdown: 'awal\n\nparagraf hp', mood: 4 })
    const attempt = repo.save('2026-10-01', { markdown: 'awal\n\nkalimat laptop', baseMarkdown: 'awal' })
    await expect(attempt).rejects.toBeInstanceOf(StaleTextError)
    await expect(attempt).rejects.toMatchObject({ stored: 'awal\n\nparagraf hp' })
    expect(await repo.get('2026-10-01')).toMatchObject({ markdown: 'awal\n\nparagraf hp', mood: 4 })
  })

  it('refuses when the entry was deleted since the base', async () => {
    const attempt = repo.save('2026-10-01', { markdown: 'awal lalu lanjut', baseMarkdown: 'awal' })
    await expect(attempt).rejects.toMatchObject({ stored: '' })
    expect(await repo.get('2026-10-01')).toBeUndefined()
  })

  it('does not check the base for a mood-only save or when no base is given', async () => {
    await repo.save('2026-10-01', { markdown: 'awal' })
    await repo.save('2026-10-01', { mood: 5, baseMarkdown: 'bukan ini' })
    await repo.save('2026-10-01', { markdown: 'ditimpa' })
    expect(await repo.get('2026-10-01')).toMatchObject({ markdown: 'ditimpa', mood: 5 })
  })
})
