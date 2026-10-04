import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useParams } from 'react-router'
import { dateKey, isValidDateKey } from '../domain/date'
import { ArchivePage } from '../features/archive/ArchivePage'
import { ChatRoute } from '../features/chat/ChatRoute'
import { MemoryPage } from '../features/memory/MemoryPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { StatsPage } from '../features/stats/StatsPage'
import { DayPage } from '../features/today/DayPage'
import { TodayRoute } from '../features/today/TodayRoute'
import { WrappedPage } from '../features/wrapped/WrappedPage'
import { parsePeriodId, periodRange } from '../stats/range'
import { needsAttention, useSyncStatus } from './SyncContext'
import { useApplyPreferences } from './useApplyPreferences'

function Layout() {
  const { t } = useTranslation()
  useApplyPreferences()
  const attention = needsAttention(useSyncStatus())

  return (
    <div className="shell">
      <nav className="nav">
        <NavLink to="/" end>
          {t('nav.today')}
        </NavLink>
        <NavLink to="/archive">{t('nav.archive')}</NavLink>
        <NavLink to="/chat">{t('nav.chat')}</NavLink>
        <NavLink to="/stats">{t('nav.stats')}</NavLink>
        <NavLink to="/settings">
          {t('nav.settings')}
          {attention && (
            <>
              {' '}
              <span className="nav-dot" role="img" aria-label={t('account.attention')} />
            </>
          )}
        </NavLink>
      </nav>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}

function DayRoute() {
  const { date = '' } = useParams()
  // A future day cannot have happened yet; today has its own home.
  if (!isValidDateKey(date) || date >= dateKey()) return <Navigate to="/" replace />
  return <DayPage key={date} date={date} />
}

function WrappedRoute() {
  const { period: id = '' } = useParams()
  useApplyPreferences()
  const period = parsePeriodId(id)
  const today = dateKey()
  if (!period || periodRange(period, today).from > today) return <Navigate to="/stats" replace />
  return <WrappedPage key={id} period={period} />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="wrapped/:period" element={<WrappedRoute />} />
      <Route element={<Layout />}>
        <Route index element={<TodayRoute />} />
        <Route path="day/:date" element={<DayRoute />} />
        <Route path="chat" element={<ChatRoute />} />
        <Route path="chat/:date" element={<ChatRoute />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
