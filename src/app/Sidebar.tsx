import { useCallback, useId, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { useSession } from '@/shared/auth/session'
import { isLeafActive, NAV_ENTRIES, type NavEntry, type NavLeaf } from './nav'
import { ChevronRightIcon, LockIcon, LogoMark, LogoutIcon } from '@/shared/ui/icons'
import { IconButton } from '@/shared/ui/Button'
import { EnvBadge } from '@/shared/ui/EnvBadge'
import { fetchModerationCounts } from '@/features/moderation/api'
import { queryKeys } from '@/shared/api/queryKeys'
import { cn } from '@/shared/ui/cn'

/**
 * Collapse state is a per-tab convenience, not a preference worth syncing:
 * `sessionStorage` keeps it across reloads of the same tab and forgets it when
 * the operator is done. Groups start open — with four entries, discovery beats
 * tidiness, and a destination nobody can see is a destination nobody uses.
 */
const GROUPS_KEY = 'gogo.cms.nav-groups'

function readStoredGroups(): Record<string, boolean> {
  try {
    const raw = window.sessionStorage.getItem(GROUPS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === 'boolean',
      ),
    ) as Record<string, boolean>
  } catch {
    return {}
  }
}

function writeStoredGroups(groups: Record<string, boolean>): void {
  try {
    window.sessionStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
  } catch {
    // A locked-down browser profile must not break navigation.
  }
}

export function Sidebar() {
  const t = useT()
  const { pathname } = useLocation()
  const { session, can, logout } = useSession()
  const navigate = useNavigate()
  const regionPrefix = useId()

  /**
   * Badge count for the moderation entry.
   *
   * Read from `GET /cms/moderation/counts`, which counts the whole backlog in
   * the database. The previous version summed the four arrays the unified queue
   * returns — a number that was only correct while every queue fitted inside
   * one `limit`, and the review backlog no longer does (GoGo-BE#219 shipped the
   * per-type queues precisely because of that).
   */
  const counts = useQuery({
    queryKey: queryKeys.moderation.counts,
    queryFn: ({ signal }) => fetchModerationCounts(signal),
    enabled: can('moderation.read'),
    staleTime: 30_000,
  })
  const pendingCount = counts.data?.total ?? 0
  const badgeFor = (leaf: NavLeaf): number => (leaf.to === '/moderation' ? pendingCount : 0)

  // Read once: a group holding the current route is forced open on mount, but
  // collapsing it afterwards while standing inside it stays the operator's
  // call rather than being undone on every navigation.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const stored = readStoredGroups()
    const initial: Record<string, boolean> = {}
    for (const entry of NAV_ENTRIES) {
      if (entry.kind !== 'group') continue
      const holdsActiveRoute = entry.children.some((leaf) => isLeafActive(leaf, pathname))
      initial[entry.id] = holdsActiveRoute || (stored[entry.id] ?? true)
    }
    return initial
  })

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((current) => {
      const next = { ...current, [id]: !current[id] }
      writeStoredGroups(next)
      return next
    })
  }, [])

  const visible = NAV_ENTRIES.map((entry): NavEntry | null => {
    if (entry.kind === 'item') return can(entry.permission) ? entry : null
    const children = entry.children.filter((leaf) => can(leaf.permission))
    return children.length > 0 ? { ...entry, children } : null
  }).filter((entry): entry is NavEntry => entry !== null)

  const leafClass = (active: boolean, nested: boolean) =>
    cn(
      'flex min-h-11 items-center gap-2.5 rounded-compact px-3 font-semibold',
      nested ? 'text-[12px]' : 'text-[13px]',
      'transition-colors duration-[var(--duration-fast)]',
      active
        ? 'bg-coral-soft text-coral-ink'
        : 'text-text-muted hover:bg-surface-sunken hover:text-text',
    )

  const countBadge = (count: number) => (
    <span className="rounded-pill bg-coral px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-text-on-accent">
      {count}
    </span>
  )

  return (
    <aside className="flex h-full w-48 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-5">
        <LogoMark size={30} />
        <span className="font-display text-base font-extrabold text-text">{t('app.name')}</span>
        <span className="rounded bg-coral-soft px-1.5 py-0.5 text-[10px] font-bold text-coral-ink">
          {t('app.suffix')}
        </span>
        {/* One instance, always on screen: which deployment is this? */}
        <EnvBadge />
      </div>

      <nav aria-label={t('app.mainNav')} className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {visible.map((entry) => {
          if (entry.kind === 'item') {
            const active = isLeafActive(entry, pathname)
            const count = badgeFor(entry)
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                aria-current={active ? 'page' : undefined}
                className={leafClass(active, false)}
              >
                <entry.icon size={17} />
                <span className="flex-1 truncate">{t(entry.labelKey)}</span>
                {count > 0 ? countBadge(count) : null}
              </NavLink>
            )
          }

          const open = openGroups[entry.id] ?? true
          const holdsActiveRoute = entry.children.some((leaf) => isLeafActive(leaf, pathname))
          const rollup = entry.children.reduce((sum, leaf) => sum + badgeFor(leaf), 0)
          const regionId = `${regionPrefix}-${entry.id}`

          return (
            <div key={entry.id}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={regionId}
                onClick={() => toggleGroup(entry.id)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2.5 rounded-compact px-3 text-[13px] font-semibold',
                  'transition-colors duration-[var(--duration-fast)]',
                  // A closed group still says the current screen lives inside it.
                  holdsActiveRoute && !open
                    ? 'bg-coral-soft text-coral-ink'
                    : 'text-text-muted hover:bg-surface-sunken hover:text-text',
                )}
              >
                <entry.icon size={17} />
                <span className="flex-1 truncate text-left">{t(entry.labelKey)}</span>
                {/* Rolled up only while closed — open, each child shows its own. */}
                {!open && rollup > 0 ? countBadge(rollup) : null}
                <ChevronRightIcon
                  size={14}
                  className={cn(
                    'shrink-0 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                    open && 'rotate-90',
                  )}
                />
              </button>

              {/* `hidden` rather than unmounting: `aria-controls` needs a real
                  target, and a closed group stays out of the a11y tree. */}
              <div
                id={regionId}
                hidden={!open}
                className="mt-0.5 mb-1 ml-3 space-y-0.5 border-l border-line pl-2"
              >
                {entry.children.map((leaf) => {
                  const active = isLeafActive(leaf, pathname)
                  const count = badgeFor(leaf)
                  return (
                    <NavLink
                      key={leaf.to}
                      to={leaf.to}
                      aria-current={active ? 'page' : undefined}
                      className={leafClass(active, true)}
                    >
                      <span className="flex-1 truncate">{t(leaf.labelKey)}</span>
                      {count > 0 ? countBadge(count) : null}
                    </NavLink>
                  )
                })}
              </div>
            </div>
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
        <IconButton
          label={t('app.changePassword')}
          className="h-9 w-9"
          onClick={() => navigate('/account/password')}
        >
          <LockIcon size={15} />
        </IconButton>
        <IconButton label={t('app.signOut')} className="h-9 w-9" onClick={logout}>
          <LogoutIcon size={15} />
        </IconButton>
      </div>
    </aside>
  )
}
