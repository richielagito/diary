import { ProviderError } from './types'

type AnyClass = abstract new (...args: never[]) => object

export interface SdkErrorClasses {
  APIError: abstract new (...args: never[]) => { status?: number }
  APIUserAbortError: AnyClass
  APIConnectionError: AnyClass
}

/** Menerjemahkan error dari SDK Anthropic/OpenAI (atau fetch) ke ProviderError. */
export function mapSdkError(err: unknown, sdk: SdkErrorClasses): ProviderError {
  if (err instanceof ProviderError) return err
  if (err instanceof sdk.APIUserAbortError) return new ProviderError('aborted')
  if (err instanceof DOMException && err.name === 'AbortError') return new ProviderError('aborted')
  if (err instanceof sdk.APIConnectionError || err instanceof TypeError) return new ProviderError('network')
  if (err instanceof sdk.APIError) {
    const status = err.status
    if (status === 401 || status === 403) return new ProviderError('auth')
    if (status === 429) return new ProviderError('rateLimit')
    if (status === 404) return new ProviderError('notFound')
    if (status === 400 || status === 422) return new ProviderError('badRequest')
  }
  return new ProviderError('unknown', err instanceof Error ? err.message : String(err))
}
