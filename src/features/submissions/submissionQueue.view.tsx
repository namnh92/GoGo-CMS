import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { TextArea, TextInput } from '@/shared/ui/Field'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { cn } from '@/shared/ui/cn'
import {
  decideSubmission,
  fetchSubmissions,
  type SubmissionDecision,
  type SubmissionStatus,
} from './api'
import { styles } from './submissionQueue.style'

const MIN_REASON = 3
const MAX_REASON = 500

const TAB_STATUSES: SubmissionStatus[] = ['pending', 'approved', 'rejected', 'merged']

/**
 * PI-CMS-007 — places proposed from the app.
 *
 * Its own screen rather than a tab inside moderation: the decisions differ
 * (approve creates a catalog draft, merge points at an existing place) and the
 * queue is prioritised by how many people asked for the same place, which is
 * not how reviews or reports are triaged.
 */
export default function SubmissionQueueScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()

  const [status, setStatus] = useState<SubmissionStatus>('pending')
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')

  const query = useQuery({
    queryKey: queryKeys.submissions.list(status, cursor),
    queryFn: ({ signal }) => fetchSubmissions({ status, cursor }, signal),
    enabled: can('submission.read'),
  })

  const items = query.data?.items ?? []
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0],
    [items, selectedId],
  )

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: SubmissionDecision }) =>
      decideSubmission(input.id, input.decision, reason.trim(), mergeTarget.trim() || undefined),
    onSuccess: (_result, input) => {
      toast.success(t(`submissions.decided.${input.decision}`))
      setReason('')
      setMergeTarget('')
      setSelectedId(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all })
      // Approving creates a catalog place, so the catalog is stale too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
    },
    onError: () => toast.error(t('submissions.decideFailed')),
  })

  if (!can('submission.read')) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('submissions.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const reasonTooShort = reason.trim().length < MIN_REASON
  const mergeMissingTarget = mergeTarget.trim().length === 0
  const canDecide = can('submission.decide') && status === 'pending'

  const tabs: TabItem<SubmissionStatus>[] = TAB_STATUSES.map((value) => ({
    id: value,
    label: t(`submissions.tab.${value}`),
    ...(value === status && query.data ? { count: items.length } : {}),
  }))

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('submissions.breadcrumb') }]}
        title={t('submissions.title')}
      />
      <PageBody>
        <Tabs
          label={t('submissions.tabsLabel')}
          items={tabs}
          value={status}
          onChange={(next) => {
            setStatus(next)
            setCursor(undefined)
            setSelectedId(null)
          }}
        />

        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={query.data}
          isEmpty={(data) => data.items.length === 0}
          onRetry={() => void query.refetch()}
          empty={<EmptyState title={t('submissions.empty')} hint={t('submissions.emptyHint')} />}
        >
          {(data) => (
            <div className={styles.layout}>
              <div className={styles.list}>
                {data.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      styles.row,
                      item.id === selected?.id ? styles.rowActive : styles.rowIdle,
                    )}
                  >
                    <span className={styles.rowTop}>
                      <span className={styles.placeId}>{item.googlePlaceId}</span>
                      {item.submissionCount > 1 ? (
                        <Badge tone="lavender">
                          {t('submissions.count', {
                            n: formatNumber(item.submissionCount, locale),
                          })}
                        </Badge>
                      ) : null}
                    </span>
                    <span className={styles.meta}>
                      <span>{formatRelative(item.createdAt, locale)}</span>
                      {item.categoryKey ? <span>{item.categoryKey}</span> : null}
                      <span>
                        {item.fromRegisteredUser
                          ? t('submissions.fromUser')
                          : t('submissions.fromGuest')}
                      </span>
                    </span>
                    {item.note ? <span className={styles.note}>{item.note}</span> : null}
                  </button>
                ))}

                {data.nextCursor ? (
                  <Button
                    variant="secondary"
                    className={styles.more}
                    onClick={() => setCursor(data.nextCursor ?? undefined)}
                  >
                    {t('submissions.loadMore')}
                  </Button>
                ) : null}
              </div>

              {selected ? (
                <aside className={styles.detail}>
                  <h2 className={styles.detailTitle}>{selected.googlePlaceId}</h2>
                  <dl className={styles.facts}>
                    <Fact
                      label={t('submissions.field.count')}
                      value={String(selected.submissionCount)}
                    />
                    <Fact
                      label={t('submissions.field.source')}
                      value={
                        selected.fromRegisteredUser
                          ? t('submissions.fromUser')
                          : t('submissions.fromGuest')
                      }
                    />
                    {selected.estimatedPrice ? (
                      <Fact
                        label={t('submissions.field.price')}
                        value={`${formatNumber(selected.estimatedPrice.min, locale)}–${formatNumber(
                          selected.estimatedPrice.max,
                          locale,
                        )}`}
                      />
                    ) : null}
                    {selected.vibeKeys.length > 0 ? (
                      <Fact
                        label={t('submissions.field.vibes')}
                        value={selected.vibeKeys.join(', ')}
                      />
                    ) : null}
                    {selected.decisionReason ? (
                      <Fact label={t('submissions.field.reason')} value={selected.decisionReason} />
                    ) : null}
                  </dl>

                  {selected.resultPlaceId ? (
                    <Button
                      variant="secondary"
                      className={styles.more}
                      onClick={() => navigate(`/places/${selected.resultPlaceId}`)}
                    >
                      {t('submissions.openResult', {
                        name: selected.resultPlaceName ?? selected.resultPlaceId,
                      })}
                    </Button>
                  ) : null}

                  {canDecide ? (
                    <div className={styles.actions}>
                      <TextArea
                        label={t('submissions.reason')}
                        value={reason}
                        maxLength={MAX_REASON}
                        onChange={(event) => setReason(event.target.value)}
                        hint={t('submissions.reasonHint')}
                      />
                      <TextInput
                        label={t('submissions.mergeTarget')}
                        value={mergeTarget}
                        onChange={(event) => setMergeTarget(event.target.value)}
                        hint={t('submissions.mergeTargetHint')}
                      />
                      <div className={styles.actionRow}>
                        <Button
                          variant="success"
                          disabled={reasonTooShort || decide.isPending}
                          onClick={() => decide.mutate({ id: selected.id, decision: 'approved' })}
                        >
                          {t('submissions.action.approved')}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={reasonTooShort || decide.isPending}
                          onClick={() => decide.mutate({ id: selected.id, decision: 'rejected' })}
                        >
                          {t('submissions.action.rejected')}
                        </Button>
                        <Button
                          variant="secondary"
                          // The server requires a target for a merge and rejects
                          // the call without one; no point letting it be sent.
                          disabled={reasonTooShort || mergeMissingTarget || decide.isPending}
                          onClick={() => decide.mutate({ id: selected.id, decision: 'merged' })}
                        >
                          {t('submissions.action.merged')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.hint}>
                      <span aria-hidden="true">ℹ</span>
                      {status === 'pending'
                        ? t('submissions.cannotDecide')
                        : t('submissions.alreadyDecided')}
                    </p>
                  )}
                </aside>
              ) : null}
            </div>
          )}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.factRow}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  )
}
