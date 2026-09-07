import { Outlet } from 'react-router-dom'
import { useT } from '@/shared/i18n/i18n'
import { useOnline } from '@/shared/ui/useOnline'
import { useSession } from '@/shared/auth/session'
import { Button } from '@/shared/ui/Button'
import { AlertIcon } from '@/shared/ui/icons'
import { getAppEnvironment } from '@/shared/config/env'
import { CommandPaletteProvider } from './CommandPalette'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const t = useT()
  const online = useOnline()
  const { idleSecondsLeft, keepAlive } = useSession()
  const environment = getAppEnvironment()

  return (
    <CommandPaletteProvider>
      <div className="flex h-full flex-col bg-surface-sunken">
        <a href="#main" className="skip-link">
          {t('app.skipToContent')}
        </a>
        {environment === 'production' ? (
          // Spans the sidebar too: on production the warning outranks the
          // chrome. Static, so no live region — it is not an update, it is a
          // standing condition — and deliberately not animated, because a
          // pulsing bar is exactly what `prefers-reduced-motion` is about.
          <p className="flex items-center justify-center gap-2 border-b border-danger/40 bg-danger-soft px-4 py-1.5 text-xs font-bold text-danger-ink">
            <AlertIcon size={13} />
            {t('env.productionWarning')}
          </p>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {!online ? (
              <p
                role="status"
                className="flex items-center justify-center gap-2 bg-amber-soft px-4 py-1.5 text-xs font-semibold text-text"
              >
                <span aria-hidden="true">⚠</span>
                {t('state.offlineHint')}
              </p>
            ) : null}
            {idleSecondsLeft !== null ? (
              // Warned, not ambushed: a half-typed moderation reason survives.
              <div
                role="alert"
                className="flex flex-wrap items-center justify-center gap-3 bg-amber-soft px-4 py-2 text-xs font-semibold text-text"
              >
                <span>
                  <span aria-hidden="true">⏱ </span>
                  {t('auth.idleTitle')} — {t('auth.idleWarning', { seconds: idleSecondsLeft })}
                </span>
                <Button size="sm" variant="secondary" onClick={keepAlive}>
                  {t('auth.idleExtend')}
                </Button>
              </div>
            ) : null}
            <Outlet />
          </main>
        </div>
      </div>
    </CommandPaletteProvider>
  )
}
