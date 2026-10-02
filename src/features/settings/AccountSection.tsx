import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, EMAIL_CODE_LENGTH, NetworkError } from '../../account/api'
import { useRepos } from '../../app/RepoContext'
import { useSync, useSyncStatus } from '../../app/SyncContext'
import { useExport } from '../../backup/useExport'
import { KeyExistsError, PassphraseTooShortError, type SyncController, type SyncStatus } from '../../sync/controller'
import { MIN_PASSPHRASE_LENGTH, WrongPassphraseError } from '../../sync/crypto'
import { Field } from './Field'

type Navigate = (url: string) => void
type Run = (work: () => Promise<void>) => Promise<void>

class MismatchError extends Error {}
class EmailMismatchError extends Error {}

function errorKey(e: unknown): string {
  if (e instanceof WrongPassphraseError) return 'account.error.wrongPassphrase'
  if (e instanceof PassphraseTooShortError) return 'account.error.tooShort'
  if (e instanceof MismatchError) return 'account.error.mismatch'
  if (e instanceof EmailMismatchError) return 'account.error.emailMismatch'
  if (e instanceof KeyExistsError) return 'account.error.keyExists'
  if (e instanceof NetworkError) return 'account.error.network'
  if (e instanceof ApiError && (e.code === 'invalid_code' || e.code === 'rate_limited')) return `account.error.${e.code}`
  return 'account.error.generic'
}

const goTo: Navigate = (url) => window.location.assign(url)

/** Bagian "Akun & sinkronisasi". Tidak dirender kalau aplikasi dibangun tanpa server sync. */
export function AccountSection({ navigate = goTo }: { navigate?: Navigate }) {
  const sync = useSync()
  const status = useSyncStatus()
  if (!sync || !status) return null
  return <AccountPanel sync={sync} status={status} navigate={navigate} />
}

function AccountPanel({ sync, status, navigate }: { sync: SyncController; status: SyncStatus; navigate: Navigate }) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Satu aksi pada satu waktu; kegagalan tampil sebagai kalimat, bukan dilempar. */
  const run: Run = async (work) => {
    setError(null)
    setBusy(true)
    try {
      await work()
    } catch (e) {
      setError(t(errorKey(e)))
    } finally {
      setBusy(false)
    }
  }

  // Kembali dari Google: kode ada di fragmen alamat. Fragmen dibuang lebih dulu supaya tidak diproses dua kali.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const code = params.get('login')
    const failure = params.get('login_error')
    if (!code && !failure) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (code) void run(() => sync.completeGoogleLogin(code))
    else setError(t(`account.googleError.${failure === 'denied' || failure === 'email_unverified' ? failure : 'failed'}`))
    // Hanya saat pertama tampil.
  }, [sync])

  useEffect(() => {
    void sync.refreshAccount()
  }, [sync])

  const signedIn = status.phase !== 'signed-out' && status.problem !== 'needs-login'

  return (
    <section>
      <h2>{t('account.title')}</h2>
      {!signedIn && <SignIn sync={sync} run={run} busy={busy} expired={status.problem === 'needs-login'} knownEmail={status.email} navigate={navigate} />}
      {signedIn && status.phase === 'needs-passphrase' && status.problem === 'plan' && (
        <>
          <p>{t('account.signedInAs', { email: status.email })}</p>
          <p role="alert">{t('account.problem.plan')}</p>
          <p>
            <button type="button" disabled={busy} onClick={() => void run(() => sync.logout())}>
              {t('account.signOut')}
            </button>
          </p>
        </>
      )}
      {signedIn && status.phase === 'needs-passphrase' && status.problem !== 'plan' && <Passphrase sync={sync} status={status} run={run} busy={busy} />}
      {signedIn && status.phase === 'ready' && <Active sync={sync} status={status} run={run} busy={busy} />}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

function SignIn({
  sync,
  run,
  busy,
  expired,
  knownEmail,
  navigate,
}: {
  sync: SyncController
  run: Run
  busy: boolean
  expired: boolean
  knownEmail: string | null
  navigate: Navigate
}) {
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState(knownEmail ?? '')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')

  const send = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await sync.requestEmailCode(email, i18n.language)
      setSentTo(email.trim())
    })
  }
  const verify = (e: FormEvent) => {
    e.preventDefault()
    void run(() => sync.verifyEmailCode(email, code))
  }

  return (
    <>
      <p>{expired ? t('account.sessionExpired') : t('account.intro')}</p>
      <form onSubmit={send}>
        <Field label={t('account.email')}>
          {(id) => (
            <input
              id={id}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setSentTo(null)
              }}
            />
          )}
        </Field>
        <button type="submit" disabled={busy}>
          {t('account.sendCode')}
        </button>
      </form>
      {sentTo && (
        <form onSubmit={verify}>
          <p role="status">{t('account.codeSent', { email: sentTo })}</p>
          <Field label={t('account.code')}>
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={EMAIL_CODE_LENGTH}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </Field>
          <button type="submit" disabled={busy}>
            {t('account.signIn')}
          </button>
        </form>
      )}
      <p>
        <button type="button" disabled={busy} onClick={() => void run(async () => navigate(await sync.googleLoginUrl()))}>
          {t('account.google')}
        </button>
      </p>
    </>
  )
}

function Passphrase({ sync, status, run, busy }: { sync: SyncController; status: SyncStatus; run: Run; busy: boolean }) {
  const { t } = useTranslation()
  const { diary } = useRepos()
  const exportNow = useExport()
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [resetting, setResetting] = useState(false)
  const [hasDiary, setHasDiary] = useState(false)

  useEffect(() => {
    let cancelled = false
    void diary.list().then((entries) => {
      if (!cancelled) setHasDiary(entries.length > 0)
    })
    return () => {
      cancelled = true
    }
  }, [diary])

  const creating = !status.accountHasKey || resetting
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (!creating) return sync.enterPassphrase(first)
      if (first !== second) throw new MismatchError()
      if (first.length < MIN_PASSPHRASE_LENGTH) throw new PassphraseTooShortError()
      await (resetting ? sync.resetSync(first) : sync.createPassphrase(first))
    })
  }

  return (
    <form onSubmit={submit}>
      <p>{t('account.signedInAs', { email: status.email })}</p>
      <h3>{resetting ? t('account.resetTitle') : creating ? t('account.createTitle') : t('account.enterTitle')}</h3>
      <p>{resetting ? t('account.resetWarning') : creating ? t('account.createHint') : t('account.enterHint')}</p>
      {hasDiary && !resetting && (
        <p>
          {t('account.backupFirst')}{' '}
          <button type="button" onClick={() => void exportNow()}>
            {t('account.exportBackup')}
          </button>
        </p>
      )}
      <Field label={t('account.passphrase')}>
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            required
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        )}
      </Field>
      {creating && (
        <Field label={t('account.passphraseAgain')}>
          {(id) => <input id={id} type="password" autoComplete="new-password" required value={second} onChange={(e) => setSecond(e.target.value)} />}
        </Field>
      )}
      <p>
        <button type="submit" disabled={busy}>
          {resetting ? t('account.reset') : creating ? t('account.create') : t('account.unlock')}
        </button>{' '}
        {status.accountHasKey && (
          <button
            type="button"
            onClick={() => {
              setResetting((r) => !r)
              setFirst('')
              setSecond('')
            }}
          >
            {resetting ? t('account.cancel') : t('account.forgot')}
          </button>
        )}{' '}
        <button type="button" disabled={busy} onClick={() => void run(() => sync.logout())}>
          {t('account.signOut')}
        </button>
      </p>
    </form>
  )
}

function Active({ sync, status, run, busy }: { sync: SyncController; status: SyncStatus; run: Run; busy: boolean }) {
  const { t, i18n } = useTranslation()
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState('')

  const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)
  const last = status.lastSyncAt
    ? t('account.lastSync', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(status.lastSyncAt) })
    : t('account.neverSynced')

  const remove = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (typed.trim().toLowerCase() !== status.email) throw new EmailMismatchError()
      await sync.deleteAccount()
    })
  }

  return (
    <>
      <p>{t('account.signedInAs', { email: status.email })}</p>
      <p role="status">{status.syncing ? t('account.syncing') : last}</p>
      {status.usage && <p>{t('account.usage', { used: megabytes(status.usage.bytes), limit: megabytes(status.usage.limit) })}</p>}
      {status.problem && <p role="alert">{t(`account.problem.${status.problem}`)}</p>}
      <p>
        <button type="button" disabled={busy || status.syncing} onClick={() => void run(() => sync.syncNow())}>
          {t('account.syncNow')}
        </button>{' '}
        <button type="button" disabled={busy} onClick={() => void run(() => sync.logout())}>
          {t('account.signOut')}
        </button>{' '}
        <button type="button" onClick={() => setDeleting((d) => !d)}>
          {deleting ? t('account.cancel') : t('account.deleteAccount')}
        </button>
      </p>
      {deleting && (
        <form onSubmit={remove}>
          <Field label={t('account.deleteConfirm')}>
            {(id) => <input id={id} type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />}
          </Field>
          <button type="submit" disabled={busy}>
            {t('account.deleteAction')}
          </button>
        </form>
      )}
    </>
  )
}
