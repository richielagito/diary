import { ProviderError, type ChatProvider, type ProviderErrorKind } from './types'

/** `detail` hanya untuk error 'unknown': pesan asli dari provider, supaya penyebabnya terlihat. */
export type ConnectionResult = { ok: true } | { ok: false; kind: ProviderErrorKind; detail?: string }

export async function testConnection(provider: ChatProvider, signal = new AbortController().signal): Promise<ConnectionResult> {
  try {
    for await (const _chunk of provider.stream({
      system: 'This is a connection test. Reply with exactly: OK',
      messages: [{ role: 'user', content: 'OK?' }],
      signal,
    })) {
      // cukup memastikan stream berjalan sampai selesai
    }
    return { ok: true }
  } catch (err) {
    console.error(err)
    const kind = err instanceof ProviderError ? err.kind : 'unknown'
    const message = err instanceof Error ? err.message : String(err)
    return kind === 'unknown' && message && message !== 'unknown' ? { ok: false, kind, detail: message } : { ok: false, kind }
  }
}
