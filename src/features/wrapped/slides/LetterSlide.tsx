import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LetterInput } from '../../../ai/letter/letterInput'
import { cachedLetter, letterFingerprint, writeLetter } from '../../../ai/letter/writeLetter'
import { DEFAULT_PERSONA } from '../../../ai/prompt/persona'
import { ProviderError, type AiConfig, type ProviderErrorKind } from '../../../ai/provider/types'
import { useRepos } from '../../../app/RepoContext'

type Cached = { text: string; fresh: boolean } | null

type State =
  | { kind: 'checking' }
  | { kind: 'sealed'; cached: Cached }
  | { kind: 'writing' }
  | { kind: 'open'; text: string }
  | { kind: 'error'; error: ProviderErrorKind }

/** Amplop surat dari persona Curhat; surat ditulis saat dibuka dan disimpan per periode. */
export function LetterSlide({ input, ai }: { input: LetterInput; ai: AiConfig }) {
  const { t } = useTranslation()
  const { letters, createProvider } = useRepos()
  const [state, setState] = useState<State>({ kind: 'checking' })
  const abortRef = useRef<AbortController | null>(null)
  const name = input.persona.name.trim() || DEFAULT_PERSONA.name
  // Kunci efek = isi (fingerprint), bukan identitas objek: tulisan pengaturan lain
  // membuat input/ai baru dengan isi sama dan tidak boleh menyegel ulang surat yang terbuka.
  const fingerprint = letterFingerprint(input, ai)
  const latest = useRef({ input, ai })
  latest.current = { input, ai }

  useEffect(() => {
    let cancelled = false
    cachedLetter(letters, latest.current.input, latest.current.ai).then(
      (cached) => {
        if (!cancelled) setState({ kind: 'sealed', cached })
      },
      (err: unknown) => {
        console.error(err)
        if (!cancelled) setState({ kind: 'sealed', cached: null })
      },
    )
    return () => {
      cancelled = true
    }
  }, [letters, fingerprint])

  // Pindah slide melepas komponen ini, jadi permintaan yang berjalan dihentikan.
  useEffect(() => () => abortRef.current?.abort(), [])

  const open = useCallback(
    async (cached: Cached) => {
      if (cached?.fresh) return setState({ kind: 'open', text: cached.text })
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState({ kind: 'writing' })
      try {
        const provider = createProvider(ai)
        const text = await writeLetter({ input, ai, provider, letters, signal: controller.signal })
        if (!controller.signal.aborted) setState({ kind: 'open', text })
      } catch (err) {
        // Abort milik kita (pindah slide) diam; 'aborted' dari tempat lain tampil sebagai error
        if (controller.signal.aborted) return
        const kind: ProviderErrorKind = err instanceof ProviderError ? err.kind : 'unknown'
        if (!(err instanceof ProviderError)) console.error(err)
        setState({ kind: 'error', error: kind })
      }
    },
    [ai, createProvider, input, letters],
  )

  if (state.kind === 'checking') return <div className="slide-body" />
  if (state.kind === 'sealed') {
    const { cached } = state
    return (
      <div className="slide-body letter-envelope" data-no-nav>
        <h2 className="slide-lead">{t('wrapped.letterFrom', { name })}</h2>
        <p className="muted">{cached?.fresh ? t('wrapped.letterOpened') : t('wrapped.letterNew')}</p>
        <button type="button" className="wrapped-link" onClick={() => void open(cached)}>
          {t('wrapped.openLetter')}
        </button>
      </div>
    )
  }
  if (state.kind === 'writing') {
    return (
      <div className="slide-body">
        <p role="status" className="slide-lead">
          {t('wrapped.writing', { name })}
        </p>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="slide-body" data-no-nav>
        <p role="alert">{t(`aiError.${state.error}`)}</p>
        <button type="button" className="wrapped-link" onClick={() => void open(null)}>
          {t('wrapped.retry')}
        </button>
      </div>
    )
  }
  return (
    <div className="slide-body letter-paper">
      {state.text.split(/\n\s*\n/).map((p, i) => (
        <p key={i}>{p.trim()}</p>
      ))}
      <p className="letter-signature">{t('wrapped.signature', { name })}</p>
    </div>
  )
}
