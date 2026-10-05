import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { apiFetchParsed } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'

/** `GET /cms/auth/methods` — `CmsAuthMethods` in the contract. */
export const authMethodsSchema = z.object({
  password: z.boolean(),
  accessSso: z.boolean(),
})
export type AuthMethods = z.infer<typeof authMethodsSchema>

/**
 * An API older than GoGo-BE#679 has no `methods` route and only one door: the
 * password form. Treating its 404 as that is the honest reading, not a guess.
 */
const LEGACY_METHODS: AuthMethods = { password: true, accessSso: false }

export async function fetchAuthMethods(): Promise<AuthMethods> {
  try {
    return await apiFetchParsed(authMethodsSchema, '/cms/auth/methods')
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return LEGACY_METHODS
    throw error
  }
}

/**
 * GoGo-BE#679 / ADR-0032 — which sign-in doors this deployment has open, read
 * at runtime. The login screen renders those and nothing else: a password form
 * on an environment that has closed the door could only ever answer "disabled".
 *
 * Never cached across mounts. The point of reading it at runtime is that
 * re-opening the password door is one API setting, and a stale answer here
 * would hide exactly that.
 */
export function useAuthMethods() {
  return useQuery({
    queryKey: ['cms', 'auth', 'methods'],
    queryFn: fetchAuthMethods,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}
