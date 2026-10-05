import { useMemo } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import { dateKey, isValidDateKey } from '../../domain/date'
import { ChatInfoPage } from './ChatInfoPage'
import { ChatPage } from './ChatPage'

/** Tanggal hari ini dihitung ulang per navigasi, supaya link Curhat benar setelah lewat tengah malam. */
export function ChatRoute() {
  const { date: param } = useParams()
  const { key } = useLocation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => dateKey(), [key])
  if (param !== undefined && !isValidDateKey(param)) return <Navigate to="/chat" replace />
  const date = param ?? today
  return <ChatPage key={date} date={date} />
}

export function ChatInfoRoute() {
  const { date } = useParams()
  if (!date || !isValidDateKey(date)) return <Navigate to="/chat" replace />
  return <ChatInfoPage key={date} date={date} />
}
