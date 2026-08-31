import type { AdminRole } from '@/shared/api/contracts'

/**
 * Mirror of GoGo-BE's `AdminGuard` (BE-IMP-008, GoGo-BE#144).
 *
 * The four roles are peers, not a chain — `ops_admin` is not a superset of
 * `editor`. The server resolves access as:
 *
 *   allowed = role === 'super_admin'
 *          || routeRoles.includes(role)
 *          || (safeMethod && rank[role] >= min(rank of routeRoles))
 *
 * so **reads are hierarchical and writes are exact**: peers read each other's
 * areas, a higher rank reads below it, nothing reads above it, and every write
 * still needs the exact role.
 *
 * This module reproduces that rule rather than restating its conclusions,
 * because a flattened copy is what drifted last time. It decides what the UI
 * SHOWS and is never the authorization check: every action must still survive
 * a hand-crafted request. If the UI hides a button and the API accepts the
 * call, that is a GoGo-BE bug — report it, do not patch around it here.
 */
const ROLE_RANK: Record<AdminRole, number> = {
  editor: 1,
  moderator: 1,
  ops_admin: 2,
  super_admin: 3,
}

/** `@RequireRole(...)` as declared on each CMS controller/handler. */
const ROUTE_ROLES = {
  /** `CmsCatalogController` — @RequireRole('editor') */
  catalog: ['editor'],
  /** `CmsContentController` — @RequireRole('editor', 'ops_admin') */
  content: ['editor', 'ops_admin'],
  /** `CmsModerationController` — @RequireRole('moderator') */
  moderation: ['moderator'],
  /** `CmsSubmissionController` — @RequireRole('moderator', 'editor') */
  submissions: ['moderator', 'editor'],
  /** `CmsOpsController` + ranking/flags — @RequireRole('ops_admin') */
  ops: ['ops_admin'],
  /** `PlaceImportController` — @RequireRole('editor', 'ops_admin') */
  imports: ['editor', 'ops_admin'],
  /** `PlaceImportController#publish` — handler-level @RequireRole('ops_admin') */
  importPublish: ['ops_admin'],
  /** `CmsAuditController` — @RequireRole('editor'); rank-read opens it to every role. */
  audit: ['editor'],
  /** `EmergencyController` — @RequireRole('editor', 'moderator', 'ops_admin') */
  emergency: ['editor', 'moderator', 'ops_admin'],
  /** `CmsSafetyRulesController` — @RequireRole('ops_admin') */
  safety: ['ops_admin'],
  /** `CmsBannersController` — @RequireRole('editor', 'ops_admin') */
  banners: ['editor', 'ops_admin'],
  /** `CmsCampaignsController` — @RequireRole('ops_admin') */
  campaigns: ['ops_admin'],
  /** `CmsUploadsController` — @RequireRole('editor', 'ops_admin') */
  uploads: ['editor', 'ops_admin'],
  /** `POST /cms/auth/admins` — @RequireRole('super_admin') */
  admins: ['super_admin'],
} as const satisfies Record<string, readonly AdminRole[]>

export type RouteGroup = keyof typeof ROUTE_ROLES

/** Safe methods are the ones the guard lets through on rank. */
export type Access = 'read' | 'write'

export function canAccess(
  role: AdminRole | null | undefined,
  group: RouteGroup,
  access: Access,
): boolean {
  if (!role) return false
  if (role === 'super_admin') return true
  const required = ROUTE_ROLES[group] as readonly AdminRole[]
  if (required.includes(role)) return true
  if (access === 'write') return false
  const lowest = Math.min(...required.map((candidate) => ROLE_RANK[candidate]))
  return ROLE_RANK[role] >= lowest
}

/**
 * Named permissions the UI asks about, each pointing at the route group and
 * method class the server actually gates. Adding one means finding its
 * controller in GoGo-BE, not guessing.
 */
const PERMISSIONS = {
  // Catalog — everyone reads, only the editor writes.
  'place.read': ['catalog', 'read'],
  'place.write': ['catalog', 'write'],
  'place.transition': ['catalog', 'write'],
  'place.merge': ['catalog', 'write'],
  'place.verifyFreshness': ['catalog', 'write'],

  // Editorial content — editor and ops both write taxonomy and collections.
  'taxonomy.read': ['content', 'read'],
  'taxonomy.manage': ['content', 'write'],
  'collection.read': ['content', 'read'],
  'collection.manage': ['content', 'write'],
  // A recommendation is a targeted collection on the same controller, so it
  // sits in the same route group rather than inventing a permission boundary
  // the server does not have.
  'recommendation.read': ['content', 'read'],
  'recommendation.manage': ['content', 'write'],
  // Plan templates are editorial content on the same controller group.
  'planTemplate.read': ['content', 'read'],
  'planTemplate.manage': ['content', 'write'],

  // Moderation — everyone reads the queue, only the moderator decides.
  'moderation.read': ['moderation', 'read'],
  'moderation.decide': ['moderation', 'write'],
  'submission.read': ['submissions', 'read'],
  'submission.decide': ['submissions', 'write'],

  // Ingestion — editor and ops run jobs; publishing to the catalog is ops-only.
  'import.read': ['imports', 'read'],
  'import.manage': ['imports', 'write'],
  'import.publish': ['importPublish', 'write'],

  // Ops — rank 2 and above, reads included.
  'ops.dashboard': ['ops', 'read'],
  'searchAnalytics.read': ['ops', 'read'],
  'ranking.read': ['ops', 'read'],
  'ranking.evaluate': ['ops', 'read'],
  'ranking.draft': ['ops', 'write'],
  'ranking.approve': ['ops', 'write'],
  'ranking.activate': ['ops', 'write'],
  'ranking.rollback': ['ops', 'write'],
  'flag.read': ['ops', 'read'],
  'flag.manage': ['ops', 'write'],
  'experiment.read': ['ops', 'read'],
  'experiment.manage': ['ops', 'write'],

  // Trust & Safety — its own controller, `ops_admin` in both directions. A
  // rule here can suspend an account with no human in the loop, which is
  // policy rather than day-to-day moderation, so rank-read does not open it
  // to a moderator: `canAccess` lands on the same answer the server does.
  'safety.read': ['safety', 'read'],
  'safety.manage': ['safety', 'write'],

  // Banners — their own controller, editor and ops both write. Uploading the
  // image is the same pair on a separate controller, so it gets its own
  // permission rather than being assumed from `banner.manage`.
  'banner.read': ['banners', 'read'],
  'banner.manage': ['banners', 'write'],

  // Campaigns — `ops_admin` in both directions. A campaign that has gone out
  // cannot be recalled, so reading who is about to be pushed at is not opened
  // to rank-read either.
  'campaign.read': ['campaigns', 'read'],
  'campaign.manage': ['campaigns', 'write'],
  'upload.create': ['uploads', 'write'],

  // Audit — declared on `editor`, so rank-based read opens the log to every
  // role. It is read-only everywhere: the server serves no write route here.
  'audit.read': ['audit', 'read'],

  // Emergency takedown — anyone on shift can pull content down.
  'emergency.takedown': ['emergency', 'write'],

  // Reading who holds which role is the shape of the authorization model, so
  // the server keeps it super-admin-only rather than opening it to rank-read.
  // `canAccess` lands on the same answer: 'admins' asks for super_admin, whose
  // rank nothing else reaches.
  'admin.read': ['admins', 'read'],
  'admin.create': ['admins', 'write'],
} as const satisfies Record<string, readonly [RouteGroup, Access]>

export type Permission = keyof typeof PERMISSIONS

export function roleCan(role: AdminRole | null | undefined, permission: Permission): boolean {
  const [group, access] = PERMISSIONS[permission]
  return canAccess(role, group, access)
}

/**
 * The four roles that exist. The Figma mockup draws seven (Admin, Support,
 * Viewer…) — those have no server-side counterpart and are deliberately not
 * listed anywhere in this client.
 */
export const ADMIN_ROLES: readonly AdminRole[] = ['editor', 'moderator', 'ops_admin', 'super_admin']

/**
 * Every named permission with the route group and method class it maps to —
 * the read-only feed for the Roles & Permissions screen. Derived from the
 * same table `roleCan` answers from, so the screen cannot drift from the
 * checks the UI actually runs.
 */
export const PERMISSION_ENTRIES = (
  Object.entries(PERMISSIONS) as [Permission, readonly [RouteGroup, Access]][]
).map(([permission, [group, access]]) => ({ permission, group, access }))

/**
 * Where a role lands after login — the first screen it can actually act on,
 * not merely read. Reads being hierarchical means everyone can open the
 * catalog now, which would make it a useless landing page for a moderator.
 */
export function landingPathFor(role: AdminRole): string {
  if (role === 'moderator') return '/moderation'
  if (role === 'editor') return '/places'
  return '/'
}
