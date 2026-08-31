import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime, formatNumber } from '@/shared/format'
import { Drawer } from '@/shared/ui/Overlay'
import { Button } from '@/shared/ui/Button'
import { TextArea } from '@/shared/ui/Field'
import { AsyncBoundary, EmptyState, useErrorMessage } from '@/shared/ui/State'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import { useToast } from '@/shared/ui/Toast'
import { ShieldOffIcon, StarIcon } from '@/shared/ui/icons'
import { TakedownDialog } from '@/features/emergency/takedownDialog.view'
import type { CmsModerationReview } from '@/shared/api/contracts'
import { decideReview, fetchReviewHistory } from './api'
import { ReviewStatusBadge } from './reviewStatus'
import { styles } from './reviewDetail.style'

const MIN_REASON = 3
const MAX_REASON = 500

/**
 * One review, opened from the queue.
 *
 * A drawer rather than its own route with its own fetch, because the contract
 * has no `GET /cms/moderation/reviews/{id}` — a standalone screen could not
 * load the review it was pointed at. Everything shown here comes from the row
 * the list already holds, so nothing is invented and nothing is re-fetched.
 */
export function ReviewDetailDrawer({
  review,
  onClose,
}: {
  review: CmsModerationReview | null
  onClose: () => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [reason, setReason] = useState('')
  const [takedownOpen, setTakedownOpen] = useState(false)

  // A different review deserves a blank reason, never the last one's.
  useEffect(() => {
    setReason('')
  }, [review?.id])

  const canDecide = can('moderation.decide')
  const canTakedown = can('emergency.takedown')

  const history = useQuery({
    queryKey: queryKeys.moderation.history(review?.id ?? ''),
    queryFn: ({ signal }) => fetchReviewHistory(review?.id ?? '', signal),
    enabled: Boolean(review?.id),
    staleTime: 30_000,
  })

  const decide = useMutation({
    mutationFn: (decision: 'published' | 'rejected') =>
      decideReview(review?.id ?? '', decision, reason),
    onSuccess: () => {
      toast.success(t('moderation.detail'))
      setReason('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.moderation.all })
      onClose()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!review) return null

  const reasonInvalid = reason.trim().length < MIN_REASON || reason.length > MAX_REASON
  // Break-glass acts on published content; a pending review is not visible yet,
  // so the button would have nothing to take down.
  const canHide = review.status === 'published'

  return (
    <>
      <Drawer
        open={Boolean(review)}
        onClose={onClose}
        title={t('reviews.detailTitle')}
        description={review.placeName ?? undefined}
        width="lg"
      >
        <div className={styles.stack}>
          <div className={styles.facts}>
            <div>
              <p className={styles.factLabel}>{t('reviews.col.author')}</p>
              <p className={styles.factValue}>{review.authorDisplayName ?? '—'}</p>
            </div>
            <div>
              <p className={styles.factLabel}>{t('reviews.col.place')}</p>
              <p className={styles.factValue}>{review.placeName ?? '—'}</p>
            </div>
            <div>
              <p className={styles.factLabel}>{t('reviews.col.rating')}</p>
              <p className={styles.factValue}>
                <StarIcon size={13} className="text-amber" /> {review.rating}
              </p>
            </div>
            <div>
              <p className={styles.factLabel}>{t('reviews.col.status')}</p>
              <ReviewStatusBadge status={review.status} />
            </div>
            <div>
              <p className={styles.factLabel}>{t('reviews.col.createdAt')}</p>
              <p className={styles.factValue}>{formatDateTime(review.createdAt, locale)}</p>
            </div>
            <div>
              <p className={styles.factLabel}>{t('reviews.updatedAt')}</p>
              <p className={styles.factValue}>{formatDateTime(review.updatedAt, locale)}</p>
            </div>
          </div>

          {review.openReportCount > 0 ? (
            <p className={styles.reported}>
              <span aria-hidden="true">⚠</span>
              {t('reviews.reportedCount', {
                count: formatNumber(review.openReportCount, locale),
              })}
            </p>
          ) : null}

          <div>
            <p className={styles.head}>{t('moderation.content')}</p>
            <p className={styles.quote}>{review.text ?? t('moderation.noText')}</p>
          </div>

          {review.moderationReason ? (
            <div>
              <p className={styles.head}>{t('reviews.lastReason')}</p>
              <p className={styles.quote}>{review.moderationReason}</p>
            </div>
          ) : null}

          <TextArea
            label={t('moderation.reason')}
            hint={t('moderation.reasonRequired')}
            required
            rows={3}
            maxLength={MAX_REASON}
            placeholder={t('moderation.notePlaceholder')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={reason.length > 0 && reasonInvalid ? t('moderation.reasonRequired') : undefined}
          />

          <div className={styles.decisionGrid}>
            <Button
              variant="success"
              disabled={!canDecide || !online || reasonInvalid}
              loading={decide.isPending && decide.variables === 'published'}
              onClick={() => decide.mutate('published')}
            >
              {t('moderation.decide.published')}
            </Button>
            <Button
              variant="danger"
              disabled={!canDecide || !online || reasonInvalid}
              loading={decide.isPending && decide.variables === 'rejected'}
              onClick={() => decide.mutate('rejected')}
            >
              {t('moderation.decide.rejected')}
            </Button>
          </div>

          {canHide ? (
            <Button
              variant="danger"
              iconLeft={<ShieldOffIcon size={14} />}
              disabled={!canTakedown || !online}
              onClick={() => setTakedownOpen(true)}
            >
              {t('emergency.action')}
            </Button>
          ) : null}

          <div>
            <p className={styles.head}>{t('moderation.history')}</p>
            <AsyncBoundary
              status={history.status}
              error={history.error}
              data={history.data?.items ?? []}
              isEmpty={(entries) => entries.length === 0}
              onRetry={() => void history.refetch()}
              empty={<EmptyState title={t('moderation.historyEmpty')} hint={null} />}
            >
              {(entries) => <AuditTrail entries={entries} />}
            </AsyncBoundary>
          </div>

          <p className={styles.privacyNote}>{t('reviews.privacyNote')}</p>
        </div>
      </Drawer>

      <TakedownDialog
        open={takedownOpen && canHide}
        onClose={() => setTakedownOpen(false)}
        target="review"
        resourceId={review.id}
        resourceLabel={review.placeName ?? undefined}
      />
    </>
  )
}
