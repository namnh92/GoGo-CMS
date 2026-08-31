import { z } from 'zod'
import { apiFetch } from '@/shared/api/client'
import { adminRoleSchema } from '@/shared/api/contracts'

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
 * Reading accounts back needs `GET /v1/cms/auth/admins`, which does not exist
 * yet — GoGo-BE#220 (BE-CMS-G2), the blocker behind CMS-021.
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
