import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, EMAIL_CODE_LENGTH, NetworkError } from '../../account/api'
import { useRepos } from '../../app/RepoContext'
import { useSync, useSyncStatus } from '../../app/SyncContext'
import { useExport } from '../../backup/useExport'
import { KeyExistsError, type SyncController, type SyncStatus } from '../../sync/controller'
import { WrongPassphraseError } from '../../sync/crypto'
import { generateRecoveryKey, normalizeRecoveryKey } from '../../sync/recoveryKey'
import { Field } from './Field'

type Navigate = (url: string) => void
type Run = (work: () => Promise<void>) => Promise<void>

class EmailMismatchError extends Error {}

function errorKey(e: unknown): string {
  if (e instanceof WrongPassphraseError) return 'account.error.wrongPassphrase'
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
      {signedIn && status.phase === 'needs-passphrase' && status.problem !== 'plan' && <KeySetup sync={sync} status={status} run={run} busy={busy} />}
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

/** Perangkat yang sudah masuk tapi belum punya kunci: buat kunci pertama, tempel kunci yang ada, atau buat kunci baru. */
function KeySetup({ sync, status, run, busy }: { sync: SyncController; status: SyncStatus; run: Run; busy: boolean }) {
  const { t } = useTranslation()
  const { diary } = useRepos()
  const exportNow = useExport()
  const [typed, setTyped] = useState('')
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

  const unlock = (e: FormEvent) => {
    e.preventDefault()
    void run(() => sync.enterPassphrase(normalizeRecoveryKey(typed)))
  }

  return (
    <>
      <p>{t('account.signedInAs', { email: status.email })}</p>
      {hasDiary && !resetting && (
        <p>
          {t('account.backupFirst')}{' '}
          <button type="button" onClick={() => void exportNow()}>
            {t('account.exportBackup')}
          </button>
        </p>
      )}
      {!status.accountHasKey || resetting ? (
        <NewKey sync={sync} status={status} run={run} busy={busy} reset={resetting} onCancel={resetting ? () => setResetting(false) : undefined} />
      ) : (
        <form onSubmit={unlock}>
          <h3>{t('account.enterTitle')}</h3>
          <p>{t('account.enterHint')}</p>
          <Field label={t('account.recoveryKey')}>
            {(id) => (
              <input
                id={id}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            )}
          </Field>
          <p>
            <button type="submit" disabled={busy}>
              {t('account.unlock')}
            </button>{' '}
            <button type="button" onClick={() => setResetting(true)}>
              {t('account.forgot')}
            </button>
          </p>
        </form>
      )}
      <p>
        <button type="button" disabled={busy} onClick={() => void run(() => sync.logout())}>
          {t('account.signOut')}
        </button>
      </p>
    </>
  )
}

/**
 * Kunci pemulihan baru: dibuat di perangkat, ditampilkan sekali untuk disalin atau diunduh,
 * dan baru dipakai (dikirim terbungkus ke server) setelah user menyatakan sudah menyimpannya.
 */
function NewKey({
  sync,
  status,
  run,
  busy,
  reset,
  onCancel,
  onDone,
}: {
  sync: SyncController
  status: SyncStatus
  run: Run
  busy: boolean
  reset: boolean
  onCancel?: () => void
  onDone?: () => void
}) {
  const { t, i18n } = useTranslation()
  const [key] = useState(generateRecoveryKey)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const file = t('account.keyFile', {
    key,
    email: status.email,
    date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(Date.now()),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const normalized = normalizeRecoveryKey(key)
      await (reset ? sync.resetSync(normalized) : sync.createPassphrase(normalized))
      onDone?.()
    })
  }

  return (
    <form onSubmit={submit}>
      <h3>{reset ? t('account.resetTitle') : t('account.createTitle')}</h3>
      <p>{reset ? t('account.resetWarning') : t('account.createHint')}</p>
      <p>
        <code className="recovery-key" aria-label={t('account.recoveryKey')}>
          {key}
        </code>
      </p>
      <p>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(key).then(() => setCopied(true), () => {})}>
          {copied ? t('account.copied') : t('account.copy')}
        </button>{' '}
        <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(file)}`} download="diary-recovery-key.txt">
          {t('account.download')}
        </a>
      </p>
      <p>{t('account.keepElsewhere')}</p>
      <p>
        <label>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> {t('account.saved')}
        </label>
      </p>
      <p>
        <button type="submit" disabled={busy || !saved}>
          {reset ? t('account.reset') : t('account.create')}
        </button>{' '}
        {onCancel && (
          <button type="button" onClick={onCancel}>
            {t('account.cancel')}
          </button>
        )}
      </p>
    </form>
  )
}

function Active({ sync, status, run, busy }: { sync: SyncController; status: SyncStatus; run: Run; busy: boolean }) {
  const { t, i18n } = useTranslation()
  const [deleting, setDeleting] = useState(false)
  const [rekeying, setRekeying] = useState(false)
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
        {!rekeying && (
          <>
            <button type="button" onClick={() => setRekeying(true)}>
              {t('account.newKey')}
            </button>{' '}
          </>
        )}
        <button type="button" onClick={() => setDeleting((d) => !d)}>
          {deleting ? t('account.cancel') : t('account.deleteAccount')}
        </button>
      </p>
      {rekeying && <NewKey sync={sync} status={status} run={run} busy={busy} reset onCancel={() => setRekeying(false)} onDone={() => setRekeying(false)} />}
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
