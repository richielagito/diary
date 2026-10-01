import type { CreateProvider } from '../ai/provider/createProvider'
import { ProviderError, type ChatRequest, type ProviderErrorKind } from '../ai/provider/types'

/** Provider yang langsung mengalirkan potongan teks. */
export function replyWith(...chunks: string[]): CreateProvider {
  return () => ({
    async *stream() {
      for (const c of chunks) yield c
    },
  })
}

/** Provider yang selalu gagal dengan jenis error tertentu. */
export function failWith(kind: ProviderErrorKind): CreateProvider {
  return () => ({
    // eslint-disable-next-line require-yield
    async *stream() {
      throw new ProviderError(kind)
    },
  })
}

/**
 * Provider yang dikendalikan test: push potongan teks, lalu finish/fail. Abort memicu 'aborted'.
 * push/finish/fail yang dikirim sebelum stream mulai tetap berlaku. finish/fail dipakai habis oleh
 * stream yang menerimanya, jadi tidak bocor ke stream berikutnya; reset() membersihkan semuanya.
 */
export function controllable() {
  const requests: ChatRequest[] = []
  let pending: string[] = []
  let done = false
  let error: ProviderError | null = null
  let wake: (() => void) | null = null
  const notify = () => {
    const w = wake
    wake = null
    w?.()
  }

  const createProvider: CreateProvider = () => ({
    async *stream(req: ChatRequest) {
      requests.push(req)
      if (req.signal.aborted) throw new ProviderError('aborted')
      let aborted = false
      const onAbort = () => {
        aborted = true
        notify()
      }
      req.signal.addEventListener('abort', onAbort)
      try {
        for (;;) {
          while (pending.length) yield pending.shift()!
          if (aborted) throw new ProviderError('aborted')
          if (error) throw error
          if (done) return
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
      } finally {
        req.signal.removeEventListener('abort', onAbort)
        done = false
        error = null
      }
    },
  })

  return {
    createProvider,
    requests,
    push(text: string) {
      pending.push(text)
      notify()
    },
    finish() {
      done = true
      notify()
    },
    fail(kind: ProviderErrorKind) {
      error = new ProviderError(kind)
      notify()
    },
    reset() {
      pending = []
      done = false
      error = null
    },
  }
}
