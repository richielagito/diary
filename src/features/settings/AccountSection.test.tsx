import { screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { createApi } from '../../account/api'
import { DiaryDB } from '../../storage/db'
import { DexieDiaryRepository } from '../../storage/DexieDiaryRepository'
import { createSyncController, type SyncController } from '../../sync/controller'
import { sha256Base64Url } from '../../sync/crypto'
import { FakeServer } from '../../sync/testing/fakeServer'
import { renderApp, renderWithRepos } from '../../test/renderApp'
import { AccountSection } from './AccountSection'

const EMAIL = 'a@example.com'
const PASS = 'frasa sandi panjang'
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
  await other.createPassphrase(PASS)
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

async function createPassphrase(user: UserEvent, first = PASS, second = first) {
  await user.type(await screen.findByLabelText('Frasa sandi sync'), first)
  await user.type(screen.getByLabelText('Ulangi frasa sandi'), second)
  await user.click(screen.getByRole('button', { name: 'Buat frasa sandi' }))
}

test('is hidden when the app has no sync server', async () => {
  await renderApp('/settings')
  expect(await screen.findByRole('combobox', { name: 'Tema' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Akun & sinkronisasi' })).toBeNull()
  expect(screen.queryByRole('img', { name: 'Perlu perhatian' })).toBeNull()
})

test('signs in with an email code, creates the passphrase and starts syncing', async () => {
  const server = new FakeServer()
  const { user, diary } = await renderApp('/settings', { entries: [{ date: DAY, markdown: 'sudah ada' }] }, { sync: withServer(server) })
  expect(await screen.findByRole('heading', { name: 'Akun & sinkronisasi' })).toBeInTheDocument()
  await signIn(user, server)

  expect(await screen.findByRole('heading', { name: 'Buat frasa sandi sync' })).toBeInTheDocument()
  await createPassphrase(user, PASS, 'tidak sama sekali')
  expect(await screen.findByText('Kedua frasa sandi tidak sama.')).toBeInTheDocument()
  await user.clear(screen.getByLabelText('Frasa sandi sync'))
  await user.clear(screen.getByLabelText('Ulangi frasa sandi'))
  await createPassphrase(user, 'pendek')
  expect(await screen.findByText('Frasa sandi minimal 10 karakter.')).toBeInTheDocument()
  await user.clear(screen.getByLabelText('Frasa sandi sync'))
  await user.clear(screen.getByLabelText('Ulangi frasa sandi'))
  await createPassphrase(user)

  expect(await screen.findByText(`Masuk sebagai ${EMAIL}`)).toBeInTheDocument()
  expect(await screen.findByText(/^Terakhir sync:/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Frasa sandi sync')).toBeNull()
  await waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
  expect((await diary.get(DAY))!.markdown).toBe('sudah ada')
  // Three typed passphrase rounds plus a key derivation: close to 5 s when the whole suite runs in parallel.
}, 15_000)

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

test('asks for the existing passphrase on another device and brings the diary in', async () => {
  const server = new FakeServer()
  await existingAccount(server)
  const { user, diary } = await renderApp('/settings', {}, { sync: withServer(server) })
  await signIn(user, server)

  expect(await screen.findByRole('heading', { name: 'Masukkan frasa sandi sync' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Ulangi frasa sandi')).toBeNull()
  await user.type(screen.getByLabelText('Frasa sandi sync'), 'frasa sandi salah')
  await user.click(screen.getByRole('button', { name: 'Buka' }))
  expect(await screen.findByText('Frasa sandi salah.')).toBeInTheDocument()

  await user.clear(screen.getByLabelText('Frasa sandi sync'))
  await user.type(screen.getByLabelText('Frasa sandi sync'), PASS)
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
  await createPassphrase(user)
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
  expect(await screen.findByRole('heading', { name: 'Buat frasa sandi sync' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Export cadangan' })).toBeNull()
})

test('signs out and keeps the diary', async () => {
  const server = new FakeServer()
  const { user, diary } = await renderApp('/settings', { entries: [{ date: DAY, markdown: 'tetap di sini' }] }, { sync: withServer(server) })
  await signIn(user, server)
  await createPassphrase(user)
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
  await createPassphrase(user)
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

test('resets sync when the passphrase is forgotten', async () => {
  const server = new FakeServer()
  await existingAccount(server)
  const oldKeyId = server.user(EMAIL).key!.keyId
  const { user } = await renderApp('/settings', { entries: [{ date: '2026-10-02', markdown: 'isi perangkat ini' }] }, { sync: withServer(server) })
  await signIn(user, server)
  await user.click(await screen.findByRole('button', { name: 'Lupa frasa sandi' }))
  expect(await screen.findByRole('heading', { name: 'Reset sync' })).toBeInTheDocument()
  expect(screen.getByText(/Data di server akan dihapus/)).toBeInTheDocument()

  await user.type(screen.getByLabelText('Frasa sandi sync'), 'frasa sandi baru')
  await user.type(screen.getByLabelText('Ulangi frasa sandi'), 'frasa sandi baru')
  await user.click(screen.getByRole('button', { name: 'Hapus data server dan buat frasa sandi baru' }))
  expect(await screen.findByText(/^Terakhir sync:/)).toBeInTheDocument()
  expect(server.user(EMAIL).key!.keyId).not.toBe(oldKeyId)
  await waitFor(() => expect(server.user(EMAIL).records.size).toBe(1))
})

test('asks to sign in again when the session ended', async () => {
  const server = new FakeServer()
  const { user } = await renderApp('/settings', {}, { sync: withServer(server) })
  await signIn(user, server)
  await createPassphrase(user)
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
  expect(screen.queryByLabelText('Frasa sandi sync')).toBeNull()
  expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument()
})