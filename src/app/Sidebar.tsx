import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { useSession } from '@/shared/auth/session'
import { NAV_ITEMS } from './nav'
import { LogoMark, LogoutIcon } from '@/shared/ui/icons'
import { IconButton } from '@/shared/ui/Button'
import { fetchModerationQueue } from '@/features/moderation/api'
import { queryKeys } from '@/shared/api/queryKeys'
import { cn } from '@/shared/ui/cn'

export function Sidebar() {
  const t = useT()
  const { pathname } = useLocation()
  const { session, can, logout } = useSession()

  // Badge count for the moderation entry, exactly like the mockup's "18".
  const moderation = useQuery({
    queryKey: queryKeys.moderation.queue(50),
    queryFn: ({ signal }) => fetchModerationQueue(50, signal),
    enabled: can('moderation.read'),
    staleTime: 30_000,
  })
  // The queue returns four independent lists and no total, so the badge sums
  // what is actually pending rather than reading a stat the API never sends.
  const queue = moderation.data
  const pendingCount = queue
    ? queue.reviews.length +
      queue.reports.length +
      queue.checkins.length +
      queue.communityPlaces.length
    : 0

  const items = NAV_ITEMS.filter((item) => can(item.permission))

  return (
    <aside className="flex h-full w-48 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-4 py-5">
        <LogoMark size={30} />
        <span className="font-display text-base font-extrabold text-text">{t('app.name')}</span>
        <span className="rounded bg-coral-soft px-1.5 py-0.5 text-[10px] font-bold text-coral-deep">
          {t('app.suffix')}
        </span>
      </div>

      <nav aria-label={t('app.mainNav')} className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {items.map((item) => {
          const active = item.match ? item.match(pathname) : pathname === item.to
          const showBadge = item.to === '/moderation' && pendingCount > 0
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-2.5 rounded-compact px-3 text-[13px] font-semibold',
                'transition-colors duration-[var(--duration-fast)]',
                active
                  ? 'bg-coral-soft text-coral-deep'
                  : 'text-text-muted hover:bg-surface-sunken hover:text-text',
              )}
            >
              <item.icon size={17} />
              <span className="flex-1 truncate">{t(item.labelKey)}</span>
              {showBadge ? (
                <span className="rounded-pill bg-coral px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-text-on-accent">
                  {pendingCount}
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-line px-3 py-3">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-coral text-xs font-bold text-text-on-accent"
        >
          {(session?.displayName || '?').trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-text">{session?.displayName || '—'}</p>
          <p className="truncate text-[10px] text-text-subtle">
            {session ? t(`role.${session.role}` as const) : ''}
          </p>
        </div>
        <IconButton label={t('app.signOut')} className="h-9 w-9" onClick={logout}>
          <LogoutIcon size={15} />
        </IconButton>
      </div>
    </aside>
  )
}
