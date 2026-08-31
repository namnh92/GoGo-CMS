import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/shared/i18n/i18n'
import { IconButton } from '@/shared/ui/Button'
import { BellIcon, SearchIcon } from '@/shared/ui/icons'
import { useCommandPalette, usePaletteShortcutLabel } from './CommandPalette'

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
  const palette = useCommandPalette()
  const shortcut = usePaletteShortcutLabel()
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
        {/* A button, not a text field: search opens the palette, and a control
            that looks typable but swallows every keystroke is worse than none.
            Hidden when no palette is mounted rather than rendered inert. */}
        {showSearch && palette.available ? (
          <button
            type="button"
            onClick={palette.open}
            aria-keyshortcuts="Meta+K Control+K"
            className="flex min-h-11 w-64 items-center gap-2 rounded-compact border border-line-strong bg-surface-muted px-3 text-left text-sm text-text-subtle transition-colors duration-[var(--duration-fast)] hover:border-neutral-500 hover:text-text-muted"
          >
            <SearchIcon size={15} />
            {/* Names the action, not the haystack. The long placeholder
                sentence belongs on the palette's own input — as a button label
                it made the header's accessible name collide with unrelated
                controls, and a button should say what it does. */}
            <span className="flex-1 truncate">{t('palette.title')}</span>
            <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-subtle">
              {shortcut}
            </kbd>
          </button>
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
