import type { ComponentType, SVGProps } from 'react'
import type { MessageKey } from '@/shared/i18n/vi'
import type { Permission } from '@/shared/auth/permissions'
import {
  CollectionsIcon,
  DashboardIcon,
  ImportIcon,
  ModerationIcon,
  PlacesIcon,
  SettingsIcon,
  TaxonomyIcon,
} from '@/shared/ui/icons'

/**
 * Reads are hierarchical on the server, so an item is offered whenever the
 * role can at least open the screen — the screen itself then decides which
 * actions to enable. Gating nav on the write permission would hide screens a
 * role is allowed to read.
 */
export type NavItem = {
  to: string
  labelKey: MessageKey
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  permission: Permission
  /** Keeps the parent item active on nested routes. */
  match?: (pathname: string) => boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    labelKey: 'nav.dashboard',
    icon: DashboardIcon,
    permission: 'ops.dashboard',
    match: (p) => p === '/',
  },
  {
    to: '/places',
    labelKey: 'nav.places',
    icon: PlacesIcon,
    permission: 'place.read',
    match: (p) => p.startsWith('/places'),
  },
  {
    to: '/moderation',
    labelKey: 'nav.moderation',
    icon: ModerationIcon,
    permission: 'moderation.read',
    match: (p) => p.startsWith('/moderation'),
  },
  {
    to: '/submissions',
    labelKey: 'nav.submissions',
    icon: ModerationIcon,
    permission: 'submission.read',
    match: (p) => p.startsWith('/submissions'),
  },
  {
    to: '/taxonomy',
    labelKey: 'nav.taxonomy',
    icon: TaxonomyIcon,
    permission: 'taxonomy.manage',
    match: (p) => p.startsWith('/taxonomy'),
  },
  {
    to: '/collections',
    labelKey: 'nav.collections',
    icon: CollectionsIcon,
    permission: 'collection.read',
    match: (p) => p.startsWith('/collections'),
  },
  {
    to: '/imports',
    labelKey: 'nav.imports',
    icon: ImportIcon,
    permission: 'import.read',
    match: (p) => p.startsWith('/imports'),
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    icon: SettingsIcon,
    permission: 'ranking.read',
    match: (p) => p.startsWith('/settings'),
  },
]
