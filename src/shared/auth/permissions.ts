import type { AdminRole } from '@/shared/api/contracts'

/**
 * Mirror of the server-side matrix (README "Ma trận quyền").
 *
 * This map decides what the UI SHOWS. It is not, and can never be, the
 * authorization check — every action must survive a hand-crafted request. If
 * the UI hides a button and the API still accepts the call, that is a GoGo-BE
 * bug: report it, do not patch around it here.
 */
export const PERMISSIONS = {
  'place.read': ['editor', 'ops_admin', 'super_admin'],
  'place.write': ['editor', 'ops_admin', 'super_admin'],
  'place.transition': ['editor', 'ops_admin', 'super_admin'],
  'place.merge': ['editor', 'ops_admin', 'super_admin'],
  'place.verifyFreshness': ['editor', 'ops_admin', 'super_admin'],

  'import.read': ['editor', 'ops_admin', 'super_admin'],
  'import.manage': ['editor', 'ops_admin', 'super_admin'],
  /** Publish (import → catalog) is deliberately ops-only. */
  'import.publish': ['ops_admin', 'super_admin'],

  'moderation.read': ['moderator', 'ops_admin', 'super_admin'],
  'moderation.decide': ['moderator', 'ops_admin', 'super_admin'],
  'submission.decide': ['editor', 'moderator', 'ops_admin', 'super_admin'],

  'taxonomy.manage': ['ops_admin', 'super_admin'],
  'collection.manage': ['ops_admin', 'super_admin'],
  'flag.manage': ['ops_admin', 'super_admin'],

  'ranking.draft': ['ops_admin', 'super_admin'],
  /** Four-eyes: the API rejects self-approval, the UI only reflects it. */
  'ranking.approve': ['ops_admin', 'super_admin'],
  'ranking.activate': ['ops_admin', 'super_admin'],
  'ranking.rollback': ['ops_admin', 'super_admin'],

  'ops.dashboard': ['editor', 'moderator', 'ops_admin', 'super_admin'],
  'admin.create': ['super_admin'],
} as const satisfies Record<string, readonly AdminRole[]>

export type Permission = keyof typeof PERMISSIONS

export function roleCan(role: AdminRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return (PERMISSIONS[permission] as readonly AdminRole[]).includes(role)
}

/** Where a role lands after login — the first screen it can actually use. */
export function landingPathFor(role: AdminRole): string {
  if (role === 'moderator') return '/moderation'
  if (role === 'editor') return '/places'
  return '/'
}
