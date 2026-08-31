import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  cmsRoomGuestsSchema,
  cmsAppUserDetailSchema,
  cmsAppUserPageSchema,
  cmsPlanPageSchema,
  cmsRoomPageSchema,
  cmsUserStatusResultSchema,
  type AppUserStatus,
  type CmsAppUserDetail,
  type CmsAppUserPage,
  type CmsPlanPage,
  type CmsRoomPage,
  type CmsRoomGuests,
  type CmsUserStatusResult,
} from '@/shared/api/contracts'

/** Every parameter `GET /cms/users` accepts (GoGo-BE#246). */
export type AppUserFilters = {
  /** Display name or email substring. */
  q?: string
  status?: AppUserStatus
  limit?: number
  cursor?: string | null
}

export function fetchAppUsers(
  filters: AppUserFilters,
  signal?: AbortSignal,
): Promise<CmsAppUserPage> {
  return apiFetchParsed(cmsAppUserPageSchema, '/cms/users', {
    query: {
      q: filters.q || undefined,
      status: filters.status,
      // Capped at 100 server-side: every row costs four counter lookups.
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function fetchAppUser(id: string, signal?: AbortSignal): Promise<CmsAppUserDetail> {
  return apiFetchParsed(cmsAppUserDetailSchema, `/cms/users/${id}`, { signal })
}

/**
 * Suspend/ban both revoke every session as well as setting the status —
 * flipping the status alone would leave the account working until its token
 * expired. They are separate verbs because what distinguishes them is whether
 * the account is expected back.
 */
export function suspendAppUser(id: string, reason: string): Promise<CmsUserStatusResult> {
  return apiFetchParsed(cmsUserStatusResultSchema, `/cms/users/${id}/suspend`, {
    method: 'POST',
    body: { reason },
  })
}

export function banAppUser(id: string, reason: string): Promise<CmsUserStatusResult> {
  return apiFetchParsed(cmsUserStatusResultSchema, `/cms/users/${id}/ban`, {
    method: 'POST',
    body: { reason },
  })
}

/** Refused with `USER_DELETED` — a revived deleted account would attach a stranger's history. */
export function reactivateAppUser(id: string, reason: string): Promise<CmsUserStatusResult> {
  return apiFetchParsed(cmsUserStatusResultSchema, `/cms/users/${id}/reactivate`, {
    method: 'POST',
    body: { reason },
  })
}

/**
 * Runs the same erasure as the consumer `DELETE /me` — one implementation,
 * not two. `super_admin` only; the only action here with no undo.
 */
export function deleteAppUser(id: string, reason: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/cms/users/${id}/delete`, { method: 'POST', body: { reason } })
}

/**
 * Subject-access export through support — same payload as `/me/export`; the
 * audit entry is the point. Rate limited per actor.
 */
export function exportAppUser(id: string, reason: string): Promise<Record<string, unknown>> {
  return apiFetch(`/cms/users/${id}/export`, { method: 'POST', body: { reason } })
}

export function fetchRooms(
  filters: { status?: string; limit?: number; cursor?: string | null },
  signal?: AbortSignal,
): Promise<CmsRoomPage> {
  return apiFetchParsed(cmsRoomPageSchema, '/cms/rooms', {
    query: {
      status: filters.status || undefined,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function fetchPlans(
  filters: { status?: string; limit?: number; cursor?: string | null },
  signal?: AbortSignal,
): Promise<CmsPlanPage> {
  return apiFetchParsed(cmsPlanPageSchema, '/cms/plans', {
    query: {
      status: filters.status || undefined,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

/** Every guest membership of one room, removed ones included (GoGo-BE#257). */
export function fetchRoomGuests(roomId: string, signal?: AbortSignal): Promise<CmsRoomGuests> {
  return apiFetchParsed(cmsRoomGuestsSchema, `/cms/rooms/${roomId}/guests`, { signal })
}

/**
 * "Out of the room now" — the active session is revoked (denylist included)
 * and the membership row is marked removed but kept, because votes and
 * reports reference it. **Not a ban**: whoever still holds a valid invite can
 * join again; preventing that is invite rotation, a different action this
 * call does not pretend to include.
 */
export function removeRoomGuest(
  roomId: string,
  memberId: string,
  reason: string,
): Promise<{ memberId: string; removed: boolean }> {
  return apiFetch(`/cms/rooms/${roomId}/guests/${memberId}/remove`, {
    method: 'POST',
    body: { reason },
  })
}
