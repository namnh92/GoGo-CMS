import { useQuery, type QueryClient } from '@tanstack/react-query'
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

/** One key for every observer, so a fact learned anywhere reaches them all. */
export const AUTH_METHODS_KEY = ['cms', 'auth', 'methods'] as const

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
    queryKey: AUTH_METHODS_KEY,
    queryFn: fetchAuthMethods,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

/**
 * GoGo-BE#687 — the API just answered `403 SUPER_ADMIN_SSO_ONLY` to a password
 * action, so the switch is on whatever `methods` said when it was last read.
 * Write that fact into the cached answer at once, so every super-admin
 * password control (sidebar, change screen, staff-list reset) goes unavailable
 * in the same render rather than after a round trip; then re-read `methods` so
 * the cache carries the server's own answer and not this inference.
 *
 * Only the one field is touched. Without a cached answer there is nothing to
 * patch — the controls were already unavailable (unknown reads as unavailable
 * for the super admin) — and the refetch alone is enough.
 */
export function markSuperAdminSsoOnly(queryClient: QueryClient): void {
  queryClient.setQueryData<AuthMethods>(AUTH_METHODS_KEY, (current) =>
    current ? { ...current, superAdminSsoOnly: true } : undefined,
  )
  void queryClient.invalidateQueries({ queryKey: AUTH_METHODS_KEY })
}
