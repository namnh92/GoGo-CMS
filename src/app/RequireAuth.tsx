import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/shared/auth/session'
import { roleCan, type Permission } from '@/shared/auth/permissions'
import { PermissionDeniedState } from '@/shared/ui/State'

/** Gate for authenticated routes. The API still enforces every action. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
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
