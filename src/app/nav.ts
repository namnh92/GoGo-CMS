import type { ComponentType, SVGProps } from 'react'
import type { MessageKey } from '@/shared/i18n/vi'
import type { Permission } from '@/shared/auth/permissions'
import {
  AuditIcon,
  DashboardIcon,
  ModerationIcon,
  PlacesIcon,
  SettingsIcon,
} from '@/shared/ui/icons'

/**
 * Reads are hierarchical on the server, so an item is offered whenever the
 * role can at least open the screen — the screen itself then decides which
 * actions to enable. Gating nav on the write permission would hide screens a
 * role is allowed to read.
 *
 * Entries are grouped because the flat list stopped scaling: ten destinations
 * today, and the CMS backlog adds more. A group is pure presentation — it
 * carries no route and no permission of its own. It renders when at least one
 * of its children passes `can(...)`, and each child keeps its own permission,
 * so grouping can never widen or narrow what a role sees.
 */
type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

export type NavLeaf = {
  to: string
  labelKey: MessageKey
  permission: Permission
  /** Keeps the entry active on nested routes. */
  match?: (pathname: string) => boolean
}

export type NavEntry =
  | ({ kind: 'item'; icon: NavIcon } & NavLeaf)
  | { kind: 'group'; id: string; labelKey: MessageKey; icon: NavIcon; children: NavLeaf[] }

const DASHBOARD: NavLeaf = {
  to: '/',
  labelKey: 'nav.dashboard',
  permission: 'ops.dashboard',
  match: (p) => p === '/',
}

const CATALOG: NavLeaf[] = [
  {
    to: '/places',
    labelKey: 'nav.places',
    permission: 'place.read',
    match: (p) => p.startsWith('/places'),
  },
  {
    to: '/taxonomy',
    labelKey: 'nav.taxonomy',
    permission: 'taxonomy.read',
    match: (p) => p.startsWith('/taxonomy'),
  },
  {
    to: '/collections',
    labelKey: 'nav.collections',
    permission: 'collection.read',
    match: (p) => p.startsWith('/collections'),
  },
  {
    to: '/recommendations',
    labelKey: 'nav.recommendations',
    permission: 'recommendation.read',
    match: (p) => p.startsWith('/recommendations'),
  },
  {
    to: '/banners',
    labelKey: 'nav.banners',
    permission: 'banner.read',
    match: (p) => p.startsWith('/banners'),
  },
  {
    to: '/plan-templates',
    labelKey: 'nav.planTemplates',
    permission: 'planTemplate.read',
    match: (p) => p.startsWith('/plan-templates'),
  },
  {
    to: '/imports',
    labelKey: 'nav.imports',
    permission: 'import.read',
    match: (p) => p.startsWith('/imports'),
  },
]

const REVIEW: NavLeaf[] = [
  {
    to: '/moderation',
    labelKey: 'nav.moderation',
    permission: 'moderation.read',
    match: (p) => p.startsWith('/moderation'),
  },
  {
    to: '/submissions',
    labelKey: 'nav.submissions',
    permission: 'submission.read',
    match: (p) => p.startsWith('/submissions'),
  },
]

const OPERATIONS: NavLeaf[] = [
  {
    // Composed here, sent by the worker. `ops_admin` in both directions: a
    // campaign that has gone out cannot be recalled.
    to: '/campaigns',
    labelKey: 'nav.campaigns',
    permission: 'campaign.read',
    match: (p) => p.startsWith('/campaigns'),
  },
  {
    // `ops_admin` in both directions: reads do not climb into this one, so a
    // moderator never sees the entry — the queue they work is /moderation.
    to: '/safety-rules',
    labelKey: 'nav.safetyRules',
    permission: 'safety.read',
    match: (p) => p.startsWith('/safety-rules'),
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    permission: 'ranking.read',
    match: (p) => p.startsWith('/settings'),
  },
  {
    to: '/search-quality',
    labelKey: 'nav.searchQuality',
    permission: 'searchAnalytics.read',
    match: (p) => p.startsWith('/search-quality'),
  },
]

const ADMINISTRATION: NavLeaf[] = [
  {
    // Super-admin only in both directions: who holds which role is the shape
    // of the authorization model itself.
    to: '/settings/accounts',
    labelKey: 'nav.accounts',
    permission: 'admin.read',
    match: (p) => p.startsWith('/settings/accounts'),
  },
  {
    // Read-only description of the fixed RBAC model; every role may read it —
    // knowing what one's own role can do is not a privilege.
    to: '/roles',
    labelKey: 'nav.roles',
    permission: 'audit.read',
    match: (p) => p.startsWith('/roles'),
  },
  {
    // Declared on `editor`, so rank-based read puts the log in every role's
    // nav — which is the point: everyone can answer "who changed this".
    to: '/audit',
    labelKey: 'nav.audit',
    permission: 'audit.read',
    match: (p) => p.startsWith('/audit'),
  },
]

export const NAV_ENTRIES: NavEntry[] = [
  { kind: 'item', icon: DashboardIcon, ...DASHBOARD },
  {
    kind: 'group',
    id: 'catalog',
    labelKey: 'nav.group.catalog',
    icon: PlacesIcon,
    children: CATALOG,
  },
  {
    kind: 'group',
    id: 'review',
    labelKey: 'nav.group.review',
    icon: ModerationIcon,
    children: REVIEW,
  },
  {
    kind: 'group',
    id: 'operations',
    labelKey: 'nav.group.operations',
    icon: SettingsIcon,
    children: OPERATIONS,
  },
  {
    kind: 'group',
    id: 'administration',
    labelKey: 'nav.group.administration',
    icon: AuditIcon,
    children: ADMINISTRATION,
  },
]

/** Every destination, flattened — the command palette indexes this. */
export const NAV_LEAVES: NavLeaf[] = NAV_ENTRIES.flatMap((entry) =>
  entry.kind === 'group' ? entry.children : [entry],
)

export function isLeafActive(leaf: NavLeaf, pathname: string): boolean {
  return leaf.match ? leaf.match(pathname) : pathname === leaf.to
}
