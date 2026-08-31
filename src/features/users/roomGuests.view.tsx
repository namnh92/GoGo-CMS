import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { ApiError } from '@/shared/api/errors'
import { formatDateTime, formatRelative } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { TextArea } from '@/shared/ui/Field'
import { Drawer, Modal } from '@/shared/ui/Overlay'
import { AsyncBoundary, EmptyState, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import type { CmsRoomGuest, CmsRoomSummary } from '@/shared/api/contracts'
import { fetchRoomGuests, removeRoomGuest } from './api'
import { styles } from './users.style'

/**
 * The guests of one room (GoGo-BE#257). Room-scoped by design — there is no
 * global guest directory to open. Removal is "out of the room now", session
 * revoked denylist-deep; it is NOT a ban, and both the row and the dialog say
 * so, because whoever still holds a valid invite can join again.
 */
export function RoomGuestsDrawer({ room, onClose }: { room: CmsRoomSummary; onClose: () => void }) {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const describeError = useErrorMessage()

  const canManage = can('user.manage')
  const [removing, setRemoving] = useState<CmsRoomGuest | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: queryKeys.rooms.guests(room.id),
    queryFn: ({ signal }) => fetchRoomGuests(room.id, signal),
  })

  const remove = useMutation({
    mutationFn: (guest: CmsRoomGuest) => removeRoomGuest(room.id, guest.memberId, reason.trim()),
    onSuccess: () => {
      toast.success(t('guests.removed'))
      setRemoving(null)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.guests(room.id) })
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.code === 'ALREADY_REMOVED') {
        setError(t('guests.error.alreadyRemoved'))
      } else if (cause instanceof ApiError && cause.code === 'NOT_A_GUEST') {
        setError(t('guests.error.notAGuest'))
      } else {
        setError(describeError(cause))
      }
    },
  })

  const guestState = (guest: CmsRoomGuest): 'removed' | 'expired' | 'claimed' | 'active' => {
    if (guest.removedAt) return 'removed'
    if (guest.claimed) return 'claimed'
    if (new Date(guest.sessionExpiresAt).getTime() < Date.now()) return 'expired'
    return 'active'
  }

  return (
    <Drawer open onClose={onClose} title={t('guests.title')} width="md">
      <p className={styles.privacyNote}>{t('guests.scopeNote')}</p>

      <AsyncBoundary
        status={query.status}
        error={query.error}
        data={query.data?.guests ?? []}
        isEmpty={(items) => items.length === 0}
        onRetry={() => void query.refetch()}
        empty={<EmptyState title={t('guests.empty')} hint={t('guests.emptyHint')} />}
      >
        {(guests) => (
          <div className="mt-4">
            {guests.map((guest) => {
              const state = guestState(guest)
              return (
                <div key={guest.memberId} className={styles.roomRow}>
                  <div className={styles.roomMain}>
                    <p className={styles.roomTitle}>{guest.displayName}</p>
                    <p className={styles.roomMeta}>
                      {t('guests.joined')} {formatRelative(guest.joinedAt, locale)} ·{' '}
                      {guest.removedAt
                        ? `${t('guests.removedAt')} ${formatDateTime(guest.removedAt, locale)}`
                        : `${t('guests.expires')} ${formatDateTime(guest.sessionExpiresAt, locale)}`}
                    </p>
                    <p className="mt-1">
                      <Badge
                        tone={
                          state === 'active'
                            ? 'mint'
                            : state === 'claimed'
                              ? 'lavender'
                              : state === 'removed'
                                ? 'danger'
                                : 'neutral'
                        }
                      >
                        {t(`guests.state.${state}` as const)}
                      </Badge>
                    </p>
                  </div>
                  {canManage && state === 'active' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRemoving(guest)
                        setReason('')
                        setError(null)
                      }}
                    >
                      {t('guests.remove')}
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </AsyncBoundary>

      {removing ? (
        <Modal
          open
          onClose={() => setRemoving(null)}
          title={t('guests.removeTitle')}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                {t('action.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() => {
                  setError(null)
                  if (reason.trim().length < 3) {
                    setError(t('users.reasonRequired'))
                    return
                  }
                  remove.mutate(removing)
                }}
              >
                {t('guests.remove')}
              </Button>
            </div>
          }
        >
          <div className={styles.dialogBody}>
            <p className={styles.dialogTarget}>{removing.displayName}</p>
            {/* Not a ban, and the dialog does not let anyone believe it is. */}
            <p className={styles.reasonBox}>
              <span aria-hidden="true">ℹ</span>
              {t('guests.notABan')}
            </p>
            <TextArea
              label={t('users.reason')}
              rows={2}
              required
              hint={t('users.reasonHint')}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            {error ? (
              <p role="alert" className={styles.dialogError}>
                <span aria-hidden="true">⚠</span>
                {error}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </Drawer>
  )
}
