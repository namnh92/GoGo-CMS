import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { ApiError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import { Drawer, Modal } from '@/shared/ui/Overlay'
import { AsyncBoundary, EmptyState, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import {
  privacyDeliveryMethodSchema,
  type PrivacyDeliveryMethod,
  type PrivacyRequest,
  type PrivacyRequestOutcome,
} from '@/shared/api/contracts'
import {
  acknowledgePrivacyRequest,
  closePrivacyRequest,
  executePrivacyRequest,
  fetchPrivacyRequest,
  holdPrivacyRetention,
  markPrivacyDelivered,
  releasePrivacyRetention,
} from './api'
import { SlaBadge } from './slaBadge'
import { styles } from './privacy.style'

type Dialog = 'close' | 'delivered' | 'hold' | 'release'

const CLOSE_OUTCOMES: Exclude<PrivacyRequestOutcome, 'completed'>[] = [
  'no_account_found',
  'identity_not_verified',
  'rejected',
  'failed',
]

/**
 * One request in the ledger.
 *
 * Every action here is the server's: `execute` runs the erasure or export for
 * **this** request and closes it, `close` ends it unfulfilled with a real
 * outcome, `delivered` records metadata only. Failures the contract names —
 * `ROLE_DENIED`, `NOT_EXECUTABLE`, `IDENTITY_NOT_MATCHED`, `ALREADY_CLOSED` —
 * render as their own explanations rather than a generic error.
 */
export function PrivacyDetailDrawer({
  request,
  onClose,
}: {
  request: PrivacyRequest
  onClose: () => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canManage = can('privacy.manage')
  const canHold = can('privacy.hold')

  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [outcome, setOutcome] =
    useState<Exclude<PrivacyRequestOutcome, 'completed'>>('no_account_found')
  const [note, setNote] = useState('')
  const [delivery, setDelivery] = useState<PrivacyDeliveryMethod>('secure_download')
  const [holdReason, setHoldReason] = useState('')
  const [legalBasis, setLegalBasis] = useState('')
  const [reviewAt, setReviewAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: queryKeys.privacy.detail(request.id),
    queryFn: ({ signal }) => fetchPrivacyRequest(request.id, signal),
    initialData: request,
    staleTime: 15_000,
  })
  const detail = query.data ?? request

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.privacy.all })

  const describeRefusal = (cause: unknown): string => {
    if (cause instanceof ApiError) {
      const known: Record<string, string> = {
        ROLE_DENIED: t('privacy.error.roleDenied'),
        NOT_EXECUTABLE: t('privacy.error.notExecutable'),
        IDENTITY_NOT_MATCHED: t('privacy.error.identity'),
        ALREADY_CLOSED: t('privacy.error.alreadyClosed'),
        NOT_AN_EXPORT: t('privacy.error.notAnExport'),
        REVIEW_IN_PAST: t('privacy.error.reviewInPast'),
        NOT_CLOSED: t('privacy.error.notClosed'),
        ALREADY_HELD: t('privacy.error.alreadyHeld'),
        NOT_HELD: t('privacy.error.notHeld'),
      }
      return known[cause.code] ?? describeError(cause)
    }
    return describeError(cause)
  }

  const run = useMutation({
    mutationFn: async (action: 'acknowledge' | 'execute' | Dialog) => {
      if (action === 'acknowledge') return acknowledgePrivacyRequest(detail.id)
      if (action === 'execute') return executePrivacyRequest(detail.id)
      if (action === 'close') {
        return closePrivacyRequest(detail.id, {
          outcome,
          ...(note.trim() ? { operatorNote: note.trim() } : {}),
        })
      }
      if (action === 'delivered') return markPrivacyDelivered(detail.id, delivery)
      if (action === 'hold') {
        return holdPrivacyRetention(detail.id, {
          reason: holdReason.trim(),
          legalBasis: legalBasis.trim(),
          reviewAt: new Date(reviewAt).toISOString(),
        })
      }
      return releasePrivacyRetention(detail.id, holdReason.trim())
    },
    onSuccess: (result, action) => {
      if (action === 'execute' && 'data' in result && result.data) {
        // The export payload reaches the operator and nowhere else; the ledger
        // records only that it happened.
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `gogo-privacy-export-${detail.id}.json`
        anchor.click()
        URL.revokeObjectURL(url)
      }
      toast.success(t(`privacy.done.${action}` as const))
      setDialog(null)
      setError(null)
      invalidate()
      void query.refetch()
    },
    onError: (cause) => setError(describeRefusal(cause)),
  })

  const closed = detail.status === 'closed'
  const held = Boolean(detail.retentionHold)

  return (
    <Drawer open onClose={onClose} title={t('privacy.detailTitle')} width="md">
      <AsyncBoundary
        status={query.status}
        error={query.error}
        data={[detail]}
        isEmpty={() => false}
        onRetry={() => void query.refetch()}
        empty={<EmptyState />}
      >
        {() => (
          <div className="-mx-5 -my-4">
            <div className={styles.section}>
              <p className={styles.subject}>
                {t(`privacy.type.${detail.type}` as const)} ·{' '}
                {t(`privacy.subjectType.${detail.subject.subjectType}` as const)}
              </p>
              <p className={styles.subjectMeta}>
                {detail.subject.userId ??
                  detail.subject.contactEmail ??
                  detail.subject.externalReference}
              </p>
              <div className={styles.badges}>
                <SlaBadge sla={detail.sla} />
                <Badge tone="neutral">{t(`privacy.status.${detail.status}` as const)}</Badge>
                <Badge tone={detail.subject.identityStatus === 'matched' ? 'mint' : 'amber'}>
                  {t(`privacy.identity.${detail.subject.identityStatus}` as const)}
                </Badge>
                {detail.outcome ? (
                  <Badge tone={detail.outcome === 'completed' ? 'mint' : 'neutral'}>
                    {t(`privacy.outcome.${detail.outcome}` as const)}
                  </Badge>
                ) : null}
              </div>
              <div className={styles.grid}>
                <span>
                  <span className={styles.label}>{t('privacy.col.received')}</span>
                  <br />
                  <span className={styles.value}>{formatDateTime(detail.receivedAt, locale)}</span>
                </span>
                <span>
                  <span className={styles.label}>{t('privacy.ackDue')}</span>
                  <br />
                  <span className={styles.value}>{formatDateTime(detail.ackDueAt, locale)}</span>
                </span>
                <span>
                  <span className={styles.label}>{t('privacy.fulfillmentDue')}</span>
                  <br />
                  <span className={styles.value}>
                    {formatDateTime(detail.extendedDueAt ?? detail.fulfillmentDueAt, locale)}
                    {detail.extendedDueAt ? ` · ${t('privacy.extended')}` : ''}
                  </span>
                </span>
                <span>
                  <span className={styles.label}>{t('privacy.retentionAt')}</span>
                  <br />
                  <span className={styles.value}>
                    {detail.retentionAt
                      ? formatDateTime(detail.retentionAt, locale)
                      : t('privacy.retentionPending')}
                  </span>
                </span>
              </div>
              {detail.operatorNote ? (
                <p className={`${styles.muted} mt-2`}>{detail.operatorNote}</p>
              ) : null}
            </div>

            {detail.retentionHold ? (
              <div className={styles.section}>
                <p className={styles.label}>{t('privacy.hold.title')}</p>
                <div className={`${styles.holdBox} mt-2`}>
                  <span>
                    {t('privacy.hold.reason')}: {detail.retentionHold.reason}
                  </span>
                  <span>
                    {t('privacy.hold.legalBasis')}: {detail.retentionHold.legalBasis}
                  </span>
                  <span>
                    {t('privacy.hold.reviewAt')}:{' '}
                    {formatDateTime(detail.retentionHold.reviewAt, locale)}
                  </span>
                </div>
                {detail.retentionHold.reviewOverdue ? (
                  <p className={`${styles.overdueBox} mt-2`}>
                    <span aria-hidden="true">⚠</span>
                    {t('privacy.hold.overdue')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {canManage ? (
              <div className={styles.section}>
                <p className={styles.label}>{t('privacy.actions')}</p>
                <div className={styles.actionCol}>
                  {detail.status === 'open' ? (
                    <Button
                      variant="secondary"
                      disabled={!online}
                      loading={run.isPending && run.variables === 'acknowledge'}
                      onClick={() => run.mutate('acknowledge')}
                    >
                      {t('privacy.action.acknowledge')}
                    </Button>
                  ) : null}
                  {!closed && detail.type !== 'correction' ? (
                    <Button
                      variant="danger"
                      disabled={!online}
                      loading={run.isPending && run.variables === 'execute'}
                      onClick={() => run.mutate('execute')}
                    >
                      {t(`privacy.action.execute.${detail.type}` as const)}
                    </Button>
                  ) : null}
                  {!closed && detail.type === 'correction' ? (
                    // Correction is worked by hand; the contract refuses
                    // execute outright, so no button pretends otherwise.
                    <p className={styles.muted}>{t('privacy.correctionManual')}</p>
                  ) : null}
                  {!closed ? (
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setDialog('close')}
                    >
                      {t('privacy.action.close')}
                    </Button>
                  ) : null}
                  {detail.type === 'export' && detail.executedAt && !detail.deliveredAt ? (
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setDialog('delivered')}
                    >
                      {t('privacy.action.delivered')}
                    </Button>
                  ) : null}
                  {canHold && closed && !held ? (
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setDialog('hold')}
                    >
                      {t('privacy.action.hold')}
                    </Button>
                  ) : null}
                  {canHold && held ? (
                    <Button
                      variant="secondary"
                      disabled={!online}
                      onClick={() => setDialog('release')}
                    >
                      {t('privacy.action.release')}
                    </Button>
                  ) : null}
                </div>
                {error && !dialog ? (
                  <p role="alert" className={`${styles.dialogError} mt-2`}>
                    <span aria-hidden="true">⚠</span>
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </AsyncBoundary>

      {dialog ? (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={t(`privacy.dialog.${dialog}` as const)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                {t('action.cancel')}
              </Button>
              <Button
                variant={dialog === 'hold' || dialog === 'close' ? 'danger' : 'primary'}
                loading={run.isPending}
                onClick={() => {
                  setError(null)
                  if (dialog === 'hold') {
                    if (holdReason.trim().length < 3 || legalBasis.trim().length < 3) {
                      setError(t('privacy.error.holdFields'))
                      return
                    }
                    if (!reviewAt || new Date(reviewAt).getTime() <= Date.now()) {
                      // The server refuses REVIEW_IN_PAST; say it here first.
                      setError(t('privacy.error.reviewInPast'))
                      return
                    }
                  }
                  if (dialog === 'release' && holdReason.trim().length < 3) {
                    setError(t('users.reasonRequired'))
                    return
                  }
                  run.mutate(dialog)
                }}
              >
                {t(`privacy.dialog.${dialog}` as const)}
              </Button>
            </div>
          }
        >
          <div className={styles.dialogBody}>
            {dialog === 'close' ? (
              <>
                <Select
                  label={t('privacy.outcomeLabel')}
                  value={outcome}
                  onChange={(event) =>
                    setOutcome(event.target.value as Exclude<PrivacyRequestOutcome, 'completed'>)
                  }
                >
                  {CLOSE_OUTCOMES.map((value) => (
                    <option key={value} value={value}>
                      {t(`privacy.outcome.${value}` as const)}
                    </option>
                  ))}
                </Select>
                <p className={styles.dialogHint}>{t('privacy.closeHint')}</p>
              </>
            ) : null}

            {dialog === 'delivered' ? (
              <>
                <Select
                  label={t('privacy.deliveryLabel')}
                  value={delivery}
                  onChange={(event) => setDelivery(event.target.value as PrivacyDeliveryMethod)}
                >
                  {privacyDeliveryMethodSchema.options.map((value) => (
                    <option key={value} value={value}>
                      {t(`privacy.delivery.${value}` as const)}
                    </option>
                  ))}
                </Select>
                <p className={styles.dialogHint}>{t('privacy.deliveryHint')}</p>
              </>
            ) : null}

            {dialog === 'hold' ? (
              <>
                <TextArea
                  label={t('privacy.hold.reason')}
                  rows={2}
                  required
                  value={holdReason}
                  onChange={(event) => setHoldReason(event.target.value)}
                />
                <TextArea
                  label={t('privacy.hold.legalBasis')}
                  rows={2}
                  required
                  value={legalBasis}
                  onChange={(event) => setLegalBasis(event.target.value)}
                />
                <TextInput
                  label={t('privacy.hold.reviewAt')}
                  type="datetime-local"
                  required
                  hint={t('privacy.hold.reviewHint')}
                  value={reviewAt}
                  onChange={(event) => setReviewAt(event.target.value)}
                />
                <p className={styles.dialogHint}>{t('privacy.hold.extendOnly')}</p>
              </>
            ) : null}

            {dialog === 'release' ? (
              <>
                <TextArea
                  label={t('users.reason')}
                  rows={2}
                  required
                  value={holdReason}
                  onChange={(event) => setHoldReason(event.target.value)}
                />
                <p className={styles.dialogHint}>{t('privacy.releaseHint')}</p>
              </>
            ) : null}

            {(dialog === 'close' || dialog === 'delivered') && dialog === 'close' ? (
              <>
                <TextArea
                  label={t('privacy.operatorNote')}
                  rows={2}
                  maxLength={256}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <p className={styles.noteGuidance}>{t('privacy.noteGuidance')}</p>
              </>
            ) : null}

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
