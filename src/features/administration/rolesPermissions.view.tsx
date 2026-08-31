import { useMemo } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { CheckIcon } from '@/shared/ui/icons'
import {
  ADMIN_ROLES,
  PERMISSION_ENTRIES,
  roleCan,
  type Permission,
} from '@/shared/auth/permissions'
import { styles } from './rolesPermissions.style'

/**
 * The authorization model, made legible — and nothing more.
 *
 * Roles are fixed in code and enforced by GoGo-BE's AdminGuard; there is no
 * mutation API, so this screen is read-only by design rather than by
 * omission. Every cell is computed by the same `roleCan` the UI gates run
 * through, so the matrix cannot drift from the checks that actually decide
 * what a role sees.
 *
 * The Figma mockup draws seven roles and an editable permission editor.
 * Neither exists server-side; drawing them would describe an authorization
 * model GoGo does not have.
 */

/**
 * Domain prefix of a permission key: `place.write` → `place`.
 *
 * Typed as the union of prefixes that actually occur, so a new permission
 * whose domain has no i18n label fails the typecheck here instead of
 * rendering a raw key to an operator.
 */
type PermissionDomain = Permission extends `${infer D}.${string}` ? D : never
function domainOf(permission: Permission): PermissionDomain {
  return permission.split('.')[0] as PermissionDomain
}

export default function RolesPermissionsScreen() {
  const t = useT()

  const groups = useMemo(() => {
    const byDomain = new Map<PermissionDomain, typeof PERMISSION_ENTRIES>()
    for (const entry of PERMISSION_ENTRIES) {
      const domain = domainOf(entry.permission)
      byDomain.set(domain, [...(byDomain.get(domain) ?? []), entry])
    }
    return [...byDomain.entries()]
  }, [])

  /** How many permissions each role holds, counted — never hand-written. */
  const totals = useMemo(
    () =>
      Object.fromEntries(
        ADMIN_ROLES.map((role) => [
          role,
          PERMISSION_ENTRIES.filter((entry) => roleCan(role, entry.permission)).length,
        ]),
      ),
    [],
  )

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('roles.breadcrumb') }]}
        title={t('roles.title')}
      />
      <PageBody>
        <p className={styles.note}>
          <span aria-hidden="true">ℹ</span>
          {t('roles.fixedNote')}
        </p>

        <div className={styles.roleGrid}>
          {ADMIN_ROLES.map((role) => (
            <Card key={role} className={styles.roleCard}>
              <p className={styles.roleName}>{t(`role.${role}` as const)}</p>
              <p className={styles.roleScope}>{t(`roles.scope.${role}` as const)}</p>
              <p className={styles.roleMeta}>
                <span>
                  <span className={styles.roleCount}>{totals[role]}</span>{' '}
                  {t('roles.permissionCount')}
                </span>
              </p>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader title={t('roles.matrixTitle')} hint={t('roles.matrixHint')} />
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <caption className={styles.srOnly}>{t('roles.matrixTitle')}</caption>
              <thead>
                <tr className={styles.headRow}>
                  <th scope="col" className={styles.headCell}>
                    {t('roles.col.permission')}
                  </th>
                  {ADMIN_ROLES.map((role) => (
                    <th key={role} scope="col" className={`${styles.headCell} ${styles.headRole}`}>
                      {t(`role.${role}` as const)}
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map(([domain, entries]) => (
                <tbody key={domain}>
                  <tr className={styles.groupRow}>
                    <td colSpan={ADMIN_ROLES.length + 1} className={styles.groupCell}>
                      {t(`roles.domain.${domain}` as const)}
                    </td>
                  </tr>
                  {entries.map((entry) => (
                    <tr key={entry.permission} className={styles.row}>
                      <th scope="row" className={styles.permCell}>
                        <span className={styles.permKey}>{entry.permission}</span>
                        <span className={styles.permAccess}>
                          <Badge tone={entry.access === 'write' ? 'coral' : 'neutral'}>
                            {t(`roles.access.${entry.access}` as const)}
                          </Badge>
                        </span>
                      </th>
                      {ADMIN_ROLES.map((role) => {
                        const allowed = roleCan(role, entry.permission)
                        return (
                          <td key={role} className={styles.cell}>
                            {allowed ? (
                              <span className={styles.yes}>
                                <CheckIcon size={14} />
                                <span className={styles.srOnly}>{t('roles.allowed')}</span>
                              </span>
                            ) : (
                              <span className={styles.no} aria-hidden="true">
                                —
                              </span>
                            )}
                            {!allowed ? (
                              <span className={styles.srOnly}>{t('roles.denied')}</span>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Card>

        <p className={styles.note}>
          <span aria-hidden="true">ℹ</span>
          {t('roles.rankNote')}
        </p>
      </PageBody>
    </>
  )
}
