import { screen, waitFor } from '@testing-library/react'
import { createApi } from '../../account/api'
import { DiaryDB } from '../../storage/db'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
import { createKey, open } from '../../sync/crypto'
import { syncOnce, type SyncDeps } from '../../sync/engine'
import { FakeServer } from '../../sync/testing/fakeServer'
import { renderApp } from '../../test/renderApp'
import { stubLayout } from '../../test/stubLayout'

const EMAIL = 'a@example.com'
const DAY = '2026-09-20'

// The real engine against a mounted day page: nothing is stubbed between the server, the database and the editor.
test('text synced from another device while typing ends up, with the typed text, in the editor, on the server and on that device', async () => {
  stubLayout()
  const server = new FakeServer()
  const api = createApi(server.origin, server.fetch)
  await api.emailStart(EMAIL, 'id')
  const token = await api.emailVerify(EMAIL, server.lastCode(EMAIL))
  const { keys, wrappedKey } = await createKey('frasa sandi panjang', 100_000)
  await api.putKey(token, wrappedKey, false)
  const session = { api, token, keys, keyId: wrappedKey.keyId, now: Date.now }

  // Device A, the phone: wrote a second paragraph and synced.
  const phoneDb = new DiaryDB(`test-${crypto.randomUUID()}`)
  const phone: SyncDeps = { db: phoneDb, ...session }
  const phoneDiary = new DexieDiaryRepository(phoneDb)
  await phoneDiary.save(DAY, { markdown: 'awal\n\nparagraf hp' })
  expect(await syncOnce(phone)).toMatchObject({ pushed: 1 })

  // Device B, the laptop: the rendered app, still holding the older text, signed in with the same keys.
  const { db, diary, user } = await renderApp(`/day/${DAY}`, { entries: [{ date: DAY, markdown: 'awal' }] })
  const laptop: SyncDeps = { db, ...session }
  const box = await screen.findByRole('textbox', { name: 'Tulis diary' })
  await user.click(box)
  await user.keyboard(' kalimat laptop')

  // A sync round lands before the autosave has written what was typed.
  await syncOnce(laptop)
  expect((await diary.get(DAY))!.markdown).toBe('awal\n\nparagraf hp')
  await waitFor(() => expect(box).toHaveTextContent('paragraf hp'))
  expect(box).toHaveTextContent('kalimat laptop')

  await waitFor(
    async () => {
      const stored = (await diary.get(DAY))!.markdown
      expect(stored).toContain('kalimat laptop')
      expect(stored).toContain('paragraf hp')
    },
    { timeout: 3000 },
  )
  expect(await syncOnce(laptop)).toMatchObject({ pushed: 1, unresolved: 0 })
  await syncOnce(phone)

  const merged = (await diary.get(DAY))!.markdown
  expect((await phoneDiary.get(DAY))!.markdown).toBe(merged)
  const records = [...server.user(EMAIL).records]
  expect(records).toHaveLength(1)
  const [id, record] = records[0]!
  expect((await open(keys, id, record.blob)).d).toMatchObject({ markdown: merged })
  expect(merged.match(/paragraf hp/g)).toHaveLength(1)
  expect(merged.match(/kalimat laptop/g)).toHaveLength(1)
}, 15000)
