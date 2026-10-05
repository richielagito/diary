import { dateKey, parseDateKey } from '../../domain/date'
import type { DateKey } from '../../domain/types'

/** "Senin, 5 Okt": the year shows only for another year, as on the day page. */
export function chatDate(date: DateKey, language: string) {
  const year = date.slice(0, 4) === dateKey().slice(0, 4) ? undefined : 'numeric'
  return new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'short', year }).format(parseDateKey(date))
}
