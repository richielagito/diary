const DAY_MS = 86_400_000
export const REMINDER_PERSIST_DENIED_DAYS = 7

export function shouldRemindBackup(o: {
  firstEntryAt: number | null
  lastExportAt: number | null
  reminderDays: number | null
  persistGranted: boolean | null
  now: number
}): boolean {
  if (o.firstEntryAt === null || o.reminderDays === null) return false
  const days = o.persistGranted === false ? Math.min(o.reminderDays, REMINDER_PERSIST_DENIED_DAYS) : o.reminderDays
  const since = o.lastExportAt ?? o.firstEntryAt
  return o.now - since > days * DAY_MS
}
