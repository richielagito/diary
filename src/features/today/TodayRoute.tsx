import { useMemo } from 'react'
import { useLocation } from 'react-router'
import { dateKey } from '../../domain/date'
import { DayPage } from './DayPage'

/**
 * Tanggal dikunci per navigasi, jadi tulisan tidak pindah hari saat lewat tengah malam,
 * tapi klik "Hari ini" sesudah tengah malam membuka hari yang baru.
 */
export function TodayRoute() {
  const { key } = useLocation()
  // `key` sengaja jadi pemicu hitung ulang: berubah di setiap navigasi, termasuk / → /.
  const date = useMemo(() => dateKey(), [key])
  return <DayPage key={date} date={date} />
}
