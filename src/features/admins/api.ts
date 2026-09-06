import { z } from 'zod'
import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  adminAssignableRoleSchema,
  cmsAdminPageSchema,
  cmsAdminSchema,
  type AdminAssignableRole,
  type AdminRole,
  type AdminStatus,
  type CmsAdmin,
  type CmsAdminPage,
} from '@/shared/api/contracts'

/**
 * `cmsCreateAdmin` — the whole staff-account surface the BFF exposes today.
 *
 * The bounds are the server's, not ours: `password` has a 12-character floor in
 * `openapi/gogo.v1.yaml`, and `role` is `AdminAssignableRole` — the three roles
 * this console grants. `super_admin` is bootstrapped, never created here, and
 * the API answers `409 SUPER_ADMIN_SINGLETON` to anyone who tries (ADR-0018).
 * The form resolver and the request body share this one schema, so a field can
 * never be validated one way and sent another.
 *
 * There is deliberately no response schema: the contract answers `201` with no
 * body, and parsing a shape the server never promised would be inventing one.
 * The created account is read back through `GET /cms/auth/admins` below.
 */
export const newAdminSchema = z.object({
  displayName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(12),
  role: adminAssignableRoleSchema,
})

export type NewAdminInput = z.infer<typeof newAdminSchema>

export function createAdmin(input: NewAdminInput): Promise<unknown> {
  return apiFetch('/cms/auth/admins', { method: 'POST', body: input })
}

/** Every parameter `GET /cms/auth/admins` accepts (GoGo-BE#220). */
export type AdminListFilters = {
  /** Substring of email or display name, case-insensitive. */
  q?: string
  role?: AdminRole
  status?: AdminStatus
  limit?: number
  cursor?: string | null
}

export function fetchAdmins(
  filters: AdminListFilters,
  signal?: AbortSignal,
): Promise<CmsAdminPage> {
  return apiFetchParsed(cmsAdminPageSchema, '/cms/auth/admins', {
    query: {
      q: filters.q || undefined,
      role: filters.role,
      status: filters.status,
      limit: filters.limit ?? 25,
      // Keyset over (createdAt, id): accounts are created while the list is
      // open, so an offset would repeat or skip rows.
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

/*
 * Staff-account lifecycle (GoGo-BE#248). Every mutation carries a mandatory
 * reason (3–500 chars) that lands in the audit log — a row that records what
 * changed but not why answers the easy half of the reviewer's question.
 */

export type AdminUpdateInput = {
  /** Assignable roles only — the `super_admin` role is never granted here. */
  role?: AdminAssignableRole
  displayName?: string
  reason: string
}

/**
 * The server refuses `SELF_ROLE_CHANGE` (another super_admin must change
 * yours), `LAST_SUPER_ADMIN` (the `super_admin` role cannot be given up — there
 * is by construction no second holder to fall back to) and
 * `SUPER_ADMIN_SINGLETON` (nor can it be granted). The UI mirrors all three by
 * not offering the action, but the API is the control.
 */
export function updateAdmin(id: string, input: AdminUpdateInput): Promise<CmsAdmin> {
  return apiFetchParsed(cmsAdminSchema, `/cms/auth/admins/${id}`, { method: 'PATCH', body: input })
}

/** Revokes every session as well as flipping the status. `SELF_SUSPEND` refused. */
export function suspendAdmin(id: string, reason: string): Promise<CmsAdmin> {
  return apiFetchParsed(cmsAdminSchema, `/cms/auth/admins/${id}/suspend`, {
    method: 'POST',
    body: { reason },
  })
}

export function reactivateAdmin(id: string, reason: string): Promise<CmsAdmin> {
  return apiFetchParsed(cmsAdminSchema, `/cms/auth/admins/${id}/reactivate`, {
    method: 'POST',
    body: { reason },
  })
}

export const resetPasswordResultSchema = z.object({
  /** In this response and nowhere else — not logged, not readable again. */
  temporaryPassword: z.string(),
  mustChangePassword: z.literal(true),
})
export type ResetPasswordResult = z.infer<typeof resetPasswordResultSchema>

export function resetAdminPassword(id: string, reason: string): Promise<ResetPasswordResult> {
  return apiFetchParsed(resetPasswordResultSchema, `/cms/auth/admins/${id}/reset-password`, {
    method: 'POST',
    body: { reason },
  })
}

/**
 * The only route reachable while a password change is owed. The current
 * password is still required — it proves the caller is the person the
 * temporary password was handed to.
 */
export function changeOwnPassword(input: {
  currentPassword: string
  newPassword: string
}): Promise<unknown> {
  return apiFetch('/cms/auth/change-password', { method: 'POST', body: input })
}
