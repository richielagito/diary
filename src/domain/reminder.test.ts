import { shouldRemindBackup } from './reminder'

const DAY = 86_400_000
const base = { firstEntryAt: 0, lastExportAt: null, reminderDays: 14, persistGranted: true, now: 0 }

test('no entries: never remind', () => {
  expect(shouldRemindBackup({ ...base, firstEntryAt: null, now: 100 * DAY })).toBe(false)
})
test('reminder off: never remind', () => {
  expect(shouldRemindBackup({ ...base, reminderDays: null, now: 100 * DAY })).toBe(false)
})
test('never exported: counts from first entry', () => {
  expect(shouldRemindBackup({ ...base, now: 14 * DAY })).toBe(false)
  expect(shouldRemindBackup({ ...base, now: 14 * DAY + 1 })).toBe(true)
})
test('counts from last export', () => {
  expect(shouldRemindBackup({ ...base, lastExportAt: 10 * DAY, now: 20 * DAY })).toBe(false)
  expect(shouldRemindBackup({ ...base, lastExportAt: 10 * DAY, now: 25 * DAY })).toBe(true)
})
test('persist denied caps interval at 7 days', () => {
  expect(shouldRemindBackup({ ...base, persistGranted: false, now: 8 * DAY })).toBe(true)
  expect(shouldRemindBackup({ ...base, persistGranted: false, reminderDays: 3, now: 4 * DAY })).toBe(true)
})
