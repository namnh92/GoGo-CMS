import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { apiFetchParsed } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import type { Schemas } from '@/shared/api/generated'

/**
 * `GET /cms/auth/methods`. The type is the generated `CmsAuthMethods`; the zod
 * schema validates the response at runtime and is bound to that type below,
 * so a contract change fails `tsc` instead of passing silently.
 */
export type AuthMethods = Schemas['CmsAuthMethods']
export const authMethodsSchema = z.object({
  password: z.boolean(),
  accessSso: z.boolean(),
  /**
   * GoGo-BE#687 (alpha.70+): the super admin signs in through Access only;
   * `password` still describes every other role. Absent from an older API,
   * which reads as false.
   */
  superAdminSsoOnly: z.boolean().optional(),
})

/**
 * Fails to compile unless the zod shape and the generated type are the same
 * type — the same keys with the same value types. Mutual assignability is not
 * enough: it still admits a generated type that gained an optional field
 * (review F-03). The conditional-generic form below does not.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const authMethodsMatchesContract: Equal<z.infer<typeof authMethodsSchema>, AuthMethods> = true
void authMethodsMatchesContract

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
