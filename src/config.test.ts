import { APP_ID, EXPORT_FORMAT_VERSION } from './config'

test('config constants', () => {
  expect(APP_ID).toBe('diary')
  expect(EXPORT_FORMAT_VERSION).toBe(1)
})
