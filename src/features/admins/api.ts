import { z } from 'zod'
import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  adminRoleSchema,
  cmsAdminPageSchema,
  type AdminRole,
  type AdminStatus,
  type CmsAdminPage,
} from '@/shared/api/contracts'

/**
 * `cmsCreateAdmin` — the whole staff-account surface the BFF exposes today.
 *
 * The bounds are the server's, not ours: `password` has a 12-character floor in
 * `openapi/gogo.v1.yaml`, and `role` is the four-value `AdminRole` enum. The
 * form resolver and the request body share this one schema, so a field can
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
  role: adminRoleSchema,
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
