import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { initI18n } from '../i18n'

// Zona waktu tetap supaya test tanggal-lokal deterministik (UTC+7, tanpa DST).
process.env.TZ = 'Asia/Jakarta'

await initI18n('id')
