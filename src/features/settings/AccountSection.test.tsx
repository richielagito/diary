import { screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { createApi } from '../../account/api'
import { DiaryDB } from '../../storage/db'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
import { createSyncController, type SyncController } from '../../sync/controller'
import { sha256Base64Url } from '../../sync/crypto'
import { generateRecoveryKey, normalizeRecoveryKey } from '../../sync/recoveryKey'
import { FakeServer } from '../../sync/testing/fakeServer'
import { renderApp, renderWithRepos } from '../../test/renderApp'
import { AccountSection } from './AccountSection'

const EMAIL = 'a@example.com'
/** The key another device created for the account in `existingAccount`. */
const KEY = generateRecoveryKey()
const DAY = '2026-10-01'

const live: SyncController[] = []
afterEach(() => {
  for (const c of live.splice(0)) c.stop()
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  vi.restoreAllMocks()
})

const withServer = (server: FakeServer) => (db: DiaryDB) => {
  const controller = createSyncController({
    db,
    api: createApi(server.origin, server.fetch),
    debounceMs: 10,
    retryDelaysMs: [20],
    iterations: 100_000,
    origin: 'https://app.test',
  })
  live.push(controller)
  return controller
}

/** An account that already has a passphrase and one entry, as another device left it. */
async function existingAccount(server: FakeServer) {
  const db = new DiaryDB(`test-${crypto.randomUUID()}`)
  const other = withServer(server)(db)
  await other.start()
  await other.requestEmailCode(EMAIL, 'id')
  await other.verifyEmailCode(EMAIL, server.lastCode(EMAIL))
  await other.createPassphrase(normalizeRecoveryKey(KEY))
  await new DexieDiaryRepository(db).save(DAY, { markdown: 'dari perangkat lain' })
  await other.syncNow()
  return other
}

async function signIn(user: UserEvent, server: FakeServer) {
  await user.type(await screen.findByLabelText('Email'), EMAIL)
  await user.click(screen.getByRole('button', { name: 'Kirim kode' }))
  await user.type(await screen.findByLabelText('Kode dari email'), server.lastCode(EMAIL))
  await user.click(screen.getByRole('button', { name: 'Masuk' }))
}

/** Confirms the key the page generated and returns it as shown. */
async function confirmKey(user: UserEvent, action = 'Lanjut'): Promise<string> {
  const key = (await screen.findByLabelText('Kunci pemulihan')).textContent!
  await user.click(screen.getByRole('checkbox', { name: 'Saya sudah menyimpan kunci ini' }))
  await user.click(screen.getByRole('button', { name: action }))
  return key
}

test('is hidden when the app has no sync server', async () => {
  await renderApp('/settings')
  expect(await screen.findByRole('combobox', { name: 'Tema' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Akun & sinkronisasi' })).toBeNull()
  expect(screen.queryByRole('img', { name: 'Perlu perhatian' })).toBeNull()
})

test('signs in with an email code, shows a generated key and starts syncing once it is saved', async () => {
  const server = new FakeServer()
  const { user, diary } = await renderApp('/settings', { entries: [{ date: DAY, markdown: 'sudah ada' }] }, { sync: withServer(server) })
  expect(await screen.findByRole('heading', { name: 'Akun & sinkronisasi' })).toBeInTheDocument()
  await signIn(user, server)

  expect(await screen.findByRole('heading', { name: 'Kunci pemulihan sync' })).toBeInTheDocument()
  const key = screen.getByLabelText('Kunci pemulihan').textContent!
  expect(key).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/)
  const download = screen.getByRole('link', { name: 'Unduh (.txt)' })
  expect(download).toHaveAttribute('download', 'diary-recovery-key.txt')
  expect(decodeURIComponent(download.getAttribute('href')!)).toContain(key)
  await user.click(screen.getByRole('button', { name: 'Salin' }))
  expect(await screen.findByRole('button', { name: 'Tersalin' })).toBeInTheDocument()
  expect(await navigator.clipboard.readText()).toBe(key)

  // Nothing reaches the server before the user says the key is saved.
  expect(screen.getByRole('button', { name: 'Lanjut' })).toBeDisabled()
  expect(server.user(EMAIL).key).toBeNull()
  await confirmKey(user)

  expect(await screen.findByText(`Masuk sebagai ${EMAIL}`)).toBeInTheDocument()
  expect(await screen.findByText(/^Terakhir sync:/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Kunci pemulihan')).toBeNull()
  await waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
  expect((await diary.get(DAY))!.markdown).toBe('sudah ada')
})

test('says so when the email code is wrong', async () => {
  const server = new FakeServer()
  const { user } = await renderApp('/settings', {}, { sync: withServer(server) })
  await user.type(await screen.findByLabelText('Email'), EMAIL)
  await user.click(screen.getByRole('button', { name: 'Kirim kode' }))
  expect(await screen.findByText(`Kode dikirim ke ${EMAIL}.`)).toBeInTheDocument()
  await user.type(screen.getByLabelText('Kode dari email'), '999999')
  await user.click(screen.getByRole('button', { name: 'Masuk' }))
  expect(await screen.findByText('Kode salah atau kedaluwarsa.')).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
})

test('asks for the existing recovery key on another device and brings the diary in', async () => {
  const server = new FakeServer()
  await existingAccount(server)
  const { user, diary } = await renderApp('/settings', {}, { sync: withServer(server) })
  await signIn(user, server)

  expect(await screen.findByRole('heading', { name: 'Masukkan kunci pemulihan' })).toBeInTheDocument()
  await user.type(screen.getByLabelText('Kunci pemulihan'), 'AAAA-BBBB-CCCC')
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByText('Kunci pemulihan salah.')).toBeInTheDocument()

  // Pasted in lower case with spaces instead of dashes still opens.
  await user.clear(screen.getByLabelText('Kunci pemulihan'))
  await user.type(screen.getByLabelText('Kunci pemulihan'), KEY.toLowerCase().replace(/-/g, ' '))
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByText(/^Terakhir sync:/)).toBeInTheDocument()
  await waitFor(async () => expect((await diary.get(DAY))?.markdown).toBe('dari perangkat lain'))
})

test('marks the Settings link while sync needs attention', async () => {
  const server = new FakeServer()
  const { user } = await renderApp('/settings', {}, { sync: withServer(server) })
  await screen.findByLabelText('Email')
  expect(screen.queryByRole('img', { name: 'Perlu perhatian' })).toBeNull()
  await signIn(user, server)
  expect(await screen.findByRole('img', { name: 'Perlu perhatian' })).toBeInTheDocument()
  await confirmKey(user)
  await waitFor(() => expect(screen.queryByRole('img', { name: 'Perlu perhatian' })).toBeNull())
})

test('suggests a backup before the first sync only when the device has a diary', async () => {
  const server = new FakeServer()
  const first = await renderApp('/settings', { entries: [{ date: DAY, markdown: 'sudah ada' }] }, { sync: withServer(server) })
  await signIn(first.user, server)
  expect(await screen.findByRole('button', { name: 'Export cadangan' })).toBeInTheDocument()
  first.unmount()

  const emptyServer = new FakeServer()
  const second = await renderApp('/settings', {}, { sync: withServer(emptyServer) })
  await signIn(second.user, emptyServer)
  expect(await screen.findByRole('heading', { name: 'Kunci pemulihan sync' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Export cadangan' })).toBeNull()
})

test('signs out and keeps the diary', async () => {
  const server = new FakeServer()
  const { user, diary } = await renderApp('/settings', { entries: [{ date: DAY, markdown: 'tetap di sini' }] }, { sync: withServer(server) })
  await signIn(user, server)
  await confirmKey(user)
  await screen.findByText(/^Terakhir sync:/)
  await user.click(screen.getByRole('button', { name: 'Keluar' }))
  expect(await screen.findByLabelText('Email')).toHaveValue('')
  expect(server.sessionCount()).toBe(0)
  expect((await diary.get(DAY))!.markdown).toBe('tetap di sini')
})

test('deletes the account only after the email is typed', async () => {
  const server = new FakeServer()
  const { user } = await renderApp('/settings', {}, { sync: withServer(server) })
  await signIn(user, server)
  await confirmKey(user)
  await screen.findByText(/^Terakhir sync:/)

  await user.click(screen.getByRole('button', { name: 'Hapus akun' }))
  const confirm = await screen.findByLabelText(/Ketik email akun/)
  await user.type(confirm, 'bukan@example.com')
  await user.click(screen.getByRole('button', { name: 'Hapus akun selamanya' }))
  expect(await screen.findByText('Email tidak cocok.')).toBeInTheDocument()
  expect(server.hasUser(EMAIL)).toBe(true)

  await user.clear(confirm)
  await user.type(confirm, EMAIL)
  await user.click(screen.getByRole('button', { name: 'Hapus akun selamanya' }))
  await waitFor(() => expect(server.hasUser(EMAIL)).toBe(false))
  expect(await screen.findByLabelText('Email')).toBeInTheDocument()
})

test('creates a new key when the recovery key is forgotten', async () => {
  const server = new FakeServer()
  await existingAccount(server)
  const oldKeyId = server.user(EMAIL).key!.keyId
  const { user } = await renderApp('/settings', { entries: [{ date: '2026-10-02', markdown: 'isi perangkat ini' }] }, { sync: withServer(server) })
  await signIn(user, server)
  await user.click(await screen.findByRole('button', { name: 'Lupa kunci pemulihan' }))
  expect(await screen.findByRole('heading', { name: 'Buat kunci baru' })).toBeInTheDocument()
  expect(screen.getByText(/Data di server akan dihapus/)).toBeInTheDocument()

  await confirmKey(user, 'Pakai kunci baru')
  expect(await screen.findByText(/^Terakhir sync:/)).toBeInTheDocument()
  expect(server.user(EMAIL).key!.keyId).not.toBe(oldKeyId)
  await waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
})

test('creates a new key from a device that is signed in, and the old key stops working', async () => {
  const server = new FakeServer()
  const { user } = await renderApp('/settings', { entries: [{ date: DAY, markdown: 'tetap ada' }] }, { sync: withServer(server) })
  await signIn(user, server)
  const first = await confirmKey(user)
  await screen.findByText(/^Terakhir sync:/)
  const firstKeyId = server.user(EMAIL).key!.keyId

  await user.click(screen.getByRole('button', { name: 'Buat kunci baru' }))
  expect(await screen.findByRole('heading', { name: 'Buat kunci baru' })).toBeInTheDocument()
  const second = await confirmKey(user, 'Pakai kunci baru')
  expect(second).not.toBe(first)
  await waitFor(() => expect(server.user(EMAIL).key!.keyId).not.toBe(firstKeyId))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Pakai kunci baru' })).toBeNull())
  await waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
})

test('asks to sign in again when the session ended', async () => {
  const server = new FakeServer()
  const { user } = await renderApp('/settings', {}, { sync: withServer(server) })
  await signIn(user, server)
  await confirmKey(user)
  await screen.findByText(/^Terakhir sync:/)
  server.failNext(401, 'unauthorized')
  await user.click(screen.getByRole('button', { name: 'Sync sekarang' }))
  expect(await screen.findByText('Sesi berakhir. Masuk lagi untuk melanjutkan sync.')).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveValue(EMAIL)
  expect(screen.getByRole('img', { name: 'Perlu perhatian' })).toBeInTheDocument()
})

test('sends the browser to Google', async () => {
  const server = new FakeServer()
  const navigate = vi.fn()
  const { user } = await renderWithRepos(<AccountSection navigate={navigate} />, {}, { sync: withServer(server) })
  await user.click(await screen.findByRole('button', { name: 'Masuk dengan Google' }))
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
  const url = new URL(navigate.mock.calls[0]![0] as string)
  expect(url.origin + url.pathname).toBe('https://sync.test/auth/google/start')
  expect(url.searchParams.get('return')).toBe('https://app.test')
})

test('finishes a Google login that came back in the address', async () => {
  const server = new FakeServer()
  localStorage.setItem('diary.googleVerifier', 'verifier-1')
  const code = server.issueLoginCode(EMAIL, await sha256Base64Url('verifier-1'))
  window.history.replaceState(null, '', `/settings#login=${code}`)
  await renderApp('/settings', {}, { sync: withServer(server) })
  expect(await screen.findByText(`Masuk sebagai ${EMAIL}`)).toBeInTheDocument()
  expect(window.location.hash).toBe('')
})

test('explains a Google login that failed', async () => {
  window.history.replaceState(null, '', '/settings#login_error=denied')
  await renderApp('/settings', {}, { sync: withServer(new FakeServer()) })
  expect(await screen.findByText('Login Google dibatalkan.')).toBeInTheDocument()
  expect(window.location.hash).toBe('')
})

test('says sync is not active and offers only sign-out when the plan is not active', async () => {
  const server = new FakeServer()
  const first = new DiaryDB(`test-${crypto.randomUUID()}`)
  const creator = withServer(server)(first)
  await creator.start()
  await creator.requestEmailCode(EMAIL, 'id')
  await creator.verifyEmailCode(EMAIL, server.lastCode(EMAIL))
  server.user(EMAIL).plan = 'free'

  const { user } = await renderApp('/settings', {}, { sync: withServer(server) })
  await signIn(user, server)
  expect(await screen.findByText('Sync tidak aktif untuk akun ini.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Kunci pemulihan')).toBeNull()
  expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument()
})