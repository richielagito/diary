import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useParams } from 'react-router'
import { dateKey, isValidDateKey } from '../domain/date'
import { ArchivePage } from '../features/archive/ArchivePage'
import { ChatInfoRoute, ChatRoute } from '../features/chat/ChatRoute'
import { GuidePage } from '../features/guide/GuidePage'
import { MemoryPage } from '../features/memory/MemoryPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { StatsPage } from '../features/stats/StatsPage'
import { DayPage } from '../features/today/DayPage'
import { TodayRoute } from '../features/today/TodayRoute'
import { WrappedPage } from '../features/wrapped/WrappedPage'
import { parsePeriodId, periodRange } from '../stats/range'
import { needsAttention, useSyncStatus } from './SyncContext'
import { useApplyPreferences } from './useApplyPreferences'
import { useKeyboardOpen } from './useKeyboardOpen'

function Layout() {
  const { t } = useTranslation()
  useApplyPreferences()
  const attention = needsAttention(useSyncStatus())
  const keyboard = useKeyboardOpen()
  // Pages without a tab of their own light the tab they belong to: a past day is the Archive, memory is Curhat's, the guide is Settings'.
  const { pathname } = useLocation()
  const parent = pathname.startsWith('/day/') ? '/archive' : pathname === '/memory' ? '/chat' : pathname === '/guide' ? '/settings' : null
  const tab = (to: string) => ({ isActive }: { isActive: boolean }) => (isActive || parent === to ? 'active' : undefined)

  // A page change is announced like a page load: its name in the title, and focus at the start of the content.
  const { state } = useLocation()
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)
  const name =
    pathname === '/' ? t('nav.today')
    : pathname.startsWith('/day/') ? t('nav.archive')
    : pathname.endsWith('/info') ? t('chat.infoTitle')
    : pathname.startsWith('/chat') ? t('nav.chat')
    : pathname === '/archive' ? t('nav.archive')
    : pathname === '/stats' ? t('nav.stats')
    : pathname === '/settings' ? t('nav.settings')
    : pathname === '/memory' ? t('memory.title')
    : pathname === '/guide' ? t('guide.title')
    : null
  useEffect(() => {
    document.title = name ? `${name} · Diary` : 'Diary'
  }, [name])
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    // A day reached with the arrows puts focus on its own date heading instead.
    if ((state as { stepped?: boolean } | null)?.stepped) return
    main.current?.focus({ preventScroll: true })
  }, [pathname, state])

  return (
    <div className="shell" data-keyboard={keyboard || undefined}>
      <a className="skip-link" href="#main">
        {t('nav.skip')}
      </a>
      <nav className="nav" aria-label={t('nav.label')}>
        <NavLink to="/" end>
          {t('nav.today')}
        </NavLink>
        <NavLink to="/archive" className={tab('/archive')}>
          {t('nav.archive')}
        </NavLink>
        <NavLink to="/chat" className={tab('/chat')}>
          {t('nav.chat')}
        </NavLink>
        <NavLink to="/stats">{t('nav.stats')}</NavLink>
        <NavLink to="/settings" className={tab('/settings')}>
          {t('nav.settings')}
          {attention && (
            <>
              {' '}
              <span className="nav-dot" role="img" aria-label={t('account.attention')} />
            </>
          )}
        </NavLink>
      </nav>
      <main className="page" id="main" tabIndex={-1} ref={main}>
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
        <Route path="chat/:date/info" element={<ChatInfoRoute />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="guide" element={<GuidePage />} />
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
