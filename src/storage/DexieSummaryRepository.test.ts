import { DiaryDB } from './db'
import { DexieSummaryRepository } from './DexieSummaryRepository'
import type { Summary } from './SummaryRepository'

let db: DiaryDB
let repo: DexieSummaryRepository
const s = (id: string, periodStart: string, kind: Summary['kind'] = 'week'): Summary => ({
  id,
  kind,
  periodStart,
  periodEnd: periodStart,
  text: id,
  entryCount: 1,
  sourceUpdatedAt: 1,
  createdAt: 1,
})
beforeEach(() => {
  db = new DiaryDB(`test-${crypto.randomUUID()}`)
  repo = new DexieSummaryRepository(db)
})
afterEach(async () => {
  db.close()
  await db.delete()
})

test('put, get, list by periodStart, remove', async () => {
  await repo.put(s('week:2026-09-14', '2026-09-14'))
  await repo.put(s('month:2026-08', '2026-08-01', 'month'))
  expect(await repo.get('week:2026-09-14')).toMatchObject({ text: 'week:2026-09-14' })
  expect((await repo.list()).map((x) => x.id)).toEqual(['month:2026-08', 'week:2026-09-14'])
  await repo.remove('month:2026-08')
  expect((await repo.list()).map((x) => x.id)).toEqual(['week:2026-09-14'])
})

test('watch emits changes', async () => {
  const seen: number[] = []
  const unsub = repo.watch((x) => seen.push(x.length))
  await vi.waitFor(() => expect(seen).toEqual([0]))
  await repo.put(s('week:2026-09-14', '2026-09-14'))
  await vi.waitFor(() => expect(seen).toEqual([0, 1]))
  unsub()
})
