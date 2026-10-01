import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/shared/auth/session'
import { roleCan, type Permission } from '@/shared/auth/permissions'
import { PermissionDeniedState } from '@/shared/ui/State'

/** Where an operator carrying a temporary password is allowed to be. */
export const CHANGE_PASSWORD_PATH = '/account/password'

/** Gate for authenticated routes. The API still enforces every action. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  /*
   * #101. GoGo-BE's AdminGuard answers 403 PASSWORD_CHANGE_REQUIRED on every
   * non-exempt route while a temporary password stands, so a console reached
   * by typing a URL, reloading or pressing Back is a dead shell with no way
   * back to the change screen. The obligation is session state, so the guard
   * can send them where the one permitted action lives.
   */
  if (session.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />
  }
  return <>{children}</>
}

/**
 * `RoleGate` hides what a role cannot use. It is never the permission check —
 * if the UI hides a button and the API still accepts the call, that is a
 * GoGo-BE bug to report, not something to patch here.
 */
export function RoleGate({
  permission,
  children,
  fallback,
}: {
  permission: Permission
  children: ReactNode
  fallback?: ReactNode
}) {
  const { role } = useSession()
  if (!roleCan(role, permission)) return <>{fallback ?? <PermissionDeniedState />}</>
  return <>{children}</>
}
