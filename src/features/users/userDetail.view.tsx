import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime, formatNumber, formatRelative } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { Drawer } from '@/shared/ui/Overlay'
import { AsyncBoundary, EmptyState } from '@/shared/ui/State'
import type { CmsAppUser } from '@/shared/api/contracts'
import { fetchAppUser } from './api'
import { AppUserStatusBadge } from './userStatus'
import { UserActionDialog, type UserAction } from './userActions.view'
import { styles } from './users.style'

/**
 * One account, in a drawer over the list.
 *
 * Shows exactly what the contract returns and nothing more: the status
 * reason comes from the audit log, the room list carries no invite code, and
 * there is no location, device or preference data to show because the server
 * never sends it.
 */
export function UserDetailDrawer({ user, onClose }: { user: CmsAppUser; onClose: () => void }) {
  const t = useT()
  const { locale } = useI18n()
  const { can } = useSession()
  const online = useOnline()
  const [dialog, setDialog] = useState<UserAction | null>(null)

  const canManage = can('user.manage')
  const canDelete = can('user.delete')

  const query = useQuery({
    queryKey: queryKeys.appUsers.detail(user.id),
    queryFn: ({ signal }) => fetchAppUser(user.id, signal),
    staleTime: 30_000,
  })

  return (
    <Drawer open onClose={onClose} title={t('users.detailTitle')} width="md">
      <AsyncBoundary
        status={query.status}
        error={query.error}
        data={query.data ? [query.data] : []}
        isEmpty={(items) => items.length === 0}
        onRetry={() => void query.refetch()}
        empty={<EmptyState />}
      >
        {([detail]) => (
          <div className="-mx-5 -my-4">
            <div className={styles.drawerSection}>
              <p className={styles.drawerName}>{detail!.displayName}</p>
              {detail!.email ? (
                <p className={styles.email}>{detail!.email}</p>
              ) : (
                // Null on a deleted account: the address was freed. A fact,
                // not a gap.
                <p className={styles.deletedEmail}>{t('users.emailFreed')}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <AppUserStatusBadge status={detail!.status} />
                <Badge tone="neutral">{t(`users.auth.${detail!.authMethod}` as const)}</Badge>
                {detail!.reportCount > 0 ? (
                  <Badge tone="danger">
                    {t('users.reportBadge', {
                      count: formatNumber(detail!.reportCount, locale),
                    })}
                  </Badge>
                ) : null}
              </div>
              <div className={styles.drawerMetaGrid}>
                <span>
                  <span className={styles.drawerLabel}>{t('users.col.createdAt')}</span>
                  <br />
                  {formatDateTime(detail!.createdAt, locale)}
                </span>
                <span>
                  <span className={styles.drawerLabel}>{t('users.col.lastActive')}</span>
                  <br />
                  {detail!.lastActiveAt
                    ? formatRelative(detail!.lastActiveAt, locale)
                    : t('users.neverActive')}
                </span>
              </div>
              {detail!.statusReason ? (
                <p className={`${styles.reasonBox} mt-3`}>
                  <span aria-hidden="true">ℹ</span>
                  <span>
                    {t('users.statusReason')}: {detail!.statusReason}
                    {detail!.statusChangedAt
                      ? ` · ${formatDateTime(detail!.statusChangedAt, locale)}`
                      : ''}
                  </span>
                </p>
              ) : null}
            </div>

            <div className={styles.drawerSection}>
              <p className={styles.drawerLabel}>{t('users.activity')}</p>
              <div className={`${styles.statGrid} mt-2`}>
                {(
                  [
                    ['roomsCreated', detail!.counters.roomsCreated],
                    ['roomsJoined', detail!.counters.roomsJoined],
                    ['reviews', detail!.counters.reviews],
                    ['savedPlaces', detail!.counters.savedPlaces],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className={styles.statCard}>
                    <p className={styles.statValue}>{formatNumber(value, locale)}</p>
                    <p className={styles.statLabel}>{t(`users.counter.${key}` as const)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.drawerSection}>
              <p className={styles.drawerLabel}>{t('users.recentRooms')}</p>
              {detail!.rooms.length === 0 ? (
                <p className={`${styles.muted} mt-2`}>{t('users.noRooms')}</p>
              ) : (
                detail!.rooms.map((room) => (
                  <div key={room.id} className={styles.roomRow}>
                    <div className={styles.roomMain}>
                      <p className={styles.roomTitle}>{room.title || t('users.untitledRoom')}</p>
                      <p className={styles.roomMeta}>
                        {room.type} · {room.status} ·{' '}
                        {room.role === 'host' || room.role === 'member' || room.role === 'guest'
                          ? t(`users.roomRole.${room.role}` as const)
                          : room.role}{' '}
                        · {formatNumber(room.participantCount, locale)} {t('users.participants')}
                      </p>
                    </div>
                    <span className={styles.muted}>{formatRelative(room.joinedAt, locale)}</span>
                  </div>
                ))
              )}
            </div>

            {canManage ? (
              <div className={styles.drawerSection}>
                <p className={styles.drawerLabel}>{t('users.actions')}</p>
                <div className={`${styles.actionCol} mt-2`}>
                  {detail!.status === 'active' ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={!online}
                        onClick={() => setDialog('suspend')}
                      >
                        {t('users.action.suspend')}
                      </Button>
                      <Button variant="danger" disabled={!online} onClick={() => setDialog('ban')}>
                        {t('users.action.ban')}
                      </Button>
                    </>
                  ) : null}
                  {detail!.status === 'suspended' || detail!.status === 'banned' ? (
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setDialog('reactivate')}
                    >
                      {t('users.action.reactivate')}
                    </Button>
                  ) : null}
                  {detail!.status !== 'deleted' ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={!online}
                        onClick={() => setDialog('export')}
                      >
                        {t('users.action.export')}
                      </Button>
                      {canDelete ? (
                        <Button
                          variant="danger"
                          disabled={!online}
                          onClick={() => setDialog('delete')}
                        >
                          {t('users.action.delete')}
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    // Deleted is terminal: anonymized, address freed. Nothing
                    // here may pretend otherwise.
                    <p className={styles.dangerBox}>
                      <span aria-hidden="true">ℹ</span>
                      {t('users.deletedTerminal')}
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </AsyncBoundary>

      {dialog ? (
        <UserActionDialog action={dialog} user={user} onClose={() => setDialog(null)} />
      ) : null}
    </Drawer>
  )
}
