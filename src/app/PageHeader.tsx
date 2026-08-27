import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/shared/i18n/i18n'
import { SearchInput } from '@/shared/ui/Field'
import { IconButton } from '@/shared/ui/Button'
import { BellIcon } from '@/shared/ui/icons'

export type Crumb = { label: string; to?: string }

/** Sticky page chrome: breadcrumb + title on the left, tools on the right. */
export function PageHeader({
  breadcrumb,
  title,
  actions,
  showSearch = true,
}: {
  breadcrumb: Crumb[]
  title: string
  actions?: ReactNode
  showSearch?: boolean
}) {
  const t = useT()
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3.5">
      <div className="min-w-0">
        <nav aria-label="breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-[11px] text-text-subtle">
            {breadcrumb.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-text">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="font-display text-xl font-bold text-text">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {showSearch ? (
          <SearchInput
            label={t('app.searchPlaceholder')}
            placeholder={t('app.searchPlaceholder')}
            className="w-64"
          />
        ) : null}
        <IconButton label={t('app.notifications')}>
          <BellIcon size={17} />
        </IconButton>
        {actions}
      </div>
    </header>
  )
}

/** Standard page scaffold so every screen scrolls and pads identically. */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-auto bg-surface-sunken p-6">
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  )
}
