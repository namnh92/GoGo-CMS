import { useMemo } from 'react'
import { useAuthMethods } from './useAuthMethods'

/**
 * Whether a password action on the super admin's account may be offered.
 *
 * - `available` — the subject is not the super admin, or `methods` was read and
 *   the switch is off.
 * - `pending` — `methods` has not answered yet.
 * - `unknown` — `methods` failed; `retry` re-reads it.
 * - `ssoOnly` — the switch is on: the API refuses every password action for the
 *   super admin with `403 SUPER_ADMIN_SSO_ONLY`.
 */
export type SuperAdminPasswordGate =
  | { state: 'available' }
  | { state: 'pending' }
  | { state: 'unknown'; retry: () => void; retrying: boolean }
  | { state: 'ssoOnly' }

/**
 * GoGo-BE#687 (review F-01, round 2) — the one rule for every super-admin
 * password control: sidebar, change screen, staff-list reset.
 *
 * Unknown reads as unavailable. A request sent while `methods` is pending or
 * failed is a request that may only ever answer 403, and the first fix let it
 * through by treating "not yet true" as "false". A control is operable for the
 * super admin only on a read answer that says the switch is off; a refusal
 * learned from a request (`markSuperAdminSsoOnly`) lands in the same cached
 * answer, so it closes every control at once.
 *
 * `subjectIsSuperAdmin` names whose password it is — the caller's own (sidebar,
 * change screen) or the row's (staff list). Every other account keeps its
 * controls whatever `methods` says: the switch is about one account.
 */
export function useSuperAdminPasswordGate(subjectIsSuperAdmin: boolean): SuperAdminPasswordGate {
  const methods = useAuthMethods()
  const ssoOnly = methods.data?.superAdminSsoOnly === true
  const { isPending, isError, isFetching, refetch } = methods
  return useMemo<SuperAdminPasswordGate>(() => {
    if (!subjectIsSuperAdmin) return { state: 'available' }
    // The refusal outranks a failed re-read: once the switch is known to be on,
    // nothing short of a fresh answer saying otherwise re-opens the control.
    if (ssoOnly) return { state: 'ssoOnly' }
    if (isPending) return { state: 'pending' }
    if (isError) return { state: 'unknown', retry: () => void refetch(), retrying: isFetching }
    return { state: 'available' }
  }, [subjectIsSuperAdmin, ssoOnly, isPending, isError, isFetching, refetch])
}
