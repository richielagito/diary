import '@testing-library/jest-dom/vitest'
import { act, configure } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { initI18n } from '../i18n'

// Zona waktu tetap supaya test tanggal-lokal deterministik (UTC+7, tanpa DST).
process.env.TZ = 'Asia/Jakarta'

await initI18n('id')

// Pages read their first data through Suspense, inside navigations that run as transitions. A transition that suspends
// inside a synchronous act is never retried, and Testing Library wraps every event in one. user-event already turns
// the act environment off for its actions: its events then run as in the browser, and the queries wait for React.
// fireEvent keeps its act.
configure({
  eventWrapper: (cb) => {
    if (!(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) return cb()
    let result
    act(() => {
      result = cb()
    })
    return result
  },
})
