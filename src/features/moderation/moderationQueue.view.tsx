import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime, formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader, KpiCard } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Badge, StatusBadge, type Tone } from '@/shared/ui/Badge'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { TextArea, TextInput } from '@/shared/ui/Field'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { StarIcon } from '@/shared/ui/icons'
import type { ModerationItem } from '@/shared/api/contracts'
import {
  decideCheckin,
  decideReport,
  decideReview,
  decideSubmission,
  fetchModerationQueue,
  type ModerationDecision,
  type SubmissionDecision,
} from './api'
import { styles } from './moderationQueue.style'

type TabId = 'reviews' | 'reports' | 'submissions' | 'checkins'

const SEVERITY_TONE: Record<string, Tone> = { high: 'danger', medium: 'amber', low: 'mint' }

const MIN_REASON = 3
const MAX_REASON = 500

export default function ModerationQueueScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [tab, setTab] = useState<TabId>('reports')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState('')

  const canDecide = can('moderation.decide')
  const canDecideSubmission = can('submission.decide')

  const query = useQuery({
    queryKey: queryKeys.moderation.queue(50),
    queryFn: ({ signal }) => fetchModerationQueue(50, signal),
    enabled: can('moderation.read') || canDecideSubmission,
  })

  const items: ModerationItem[] = useMemo(() => {
    const queue = query.data
    if (!queue) return []
    if (tab === 'reviews') return queue.reviews
    if (tab === 'reports') return queue.reports
    if (tab === 'checkins') return queue.checkins
    return queue.submissions
  }, [query.data, tab])

  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null

  useEffect(() => {
    setActiveId(null)
    setReason('')
    setMergeTargetId('')
  }, [tab])

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.moderation.all })

  const decide = useMutation({
    mutationFn: async ({ item, decision }: { item: ModerationItem; decision: string }) => {
      if (item.kind === 'review')
        return decideReview(item.id, decision as ModerationDecision, reason)
      if (item.kind === 'report')
        return decideReport(item.id, decision as ModerationDecision, reason)
      if (item.kind === 'checkin')
        return decideCheckin(item.id, decision as ModerationDecision, reason)
      return decideSubmission(
        item.id,
        decision as SubmissionDecision,
        reason,
        mergeTargetId || undefined,
      )
    },
    onSuccess: () => {
      toast.success(t('moderation.detail'))
      setReason('')
      setMergeTargetId('')
      setActiveId(null)
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!can('moderation.read') && !canDecideSubmission) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('moderation.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const queue = query.data
  const tabs: TabItem<TabId>[] = [
    { id: 'reviews', label: t('moderation.tab.reviews'), count: queue?.reviews.length },
    { id: 'reports', label: t('moderation.tab.reports'), count: queue?.reports.length },
    { id: 'submissions', label: t('moderation.tab.submissions'), count: queue?.submissions.length },
    { id: 'checkins', label: t('moderation.tab.checkins'), count: queue?.checkins.length },
  ]

  const reasonInvalid = reason.trim().length < MIN_REASON || reason.length > MAX_REASON
  const allowDecision =
    (tab === 'submissions' ? canDecideSubmission : canDecide) && online && !reasonInvalid

  const decisionsFor = (
    item: ModerationItem,
  ): { key: string; label: string; variant: 'success' | 'danger' | 'secondary' }[] => {
    if (item.kind === 'review') {
      return [
        { key: 'published', label: t('moderation.decide.published'), variant: 'success' },
        { key: 'rejected', label: t('moderation.decide.rejected'), variant: 'danger' },
      ]
    }
    if (item.kind === 'report') {
      return [
        { key: 'actioned', label: t('moderation.decide.actioned'), variant: 'success' },
        { key: 'dismissed', label: t('moderation.decide.dismissed'), variant: 'secondary' },
      ]
    }
    if (item.kind === 'checkin') {
      return [
        { key: 'approved', label: t('moderation.decide.approved'), variant: 'success' },
        { key: 'rejected', label: t('moderation.decide.rejected'), variant: 'danger' },
      ]
    }
    return [
      { key: 'approved', label: t('moderation.decide.approved'), variant: 'success' },
      { key: 'rejected', label: t('moderation.decide.rejected'), variant: 'danger' },
      { key: 'merged', label: t('moderation.decide.merged'), variant: 'secondary' },
    ]
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('moderation.breadcrumb') }]}
        title={t('moderation.title')}
      />
      <PageBody>
        <div className={styles.kpiGrid}>
          <KpiCard
            label={t('moderation.kpi.pending')}
            value={formatNumber(queue?.stats.pending ?? 0, locale)}
          />
          <KpiCard
            label={t('moderation.kpi.response')}
            value={
              queue?.stats.avgResponseMinutes != null
                ? `${formatNumber(Math.round(queue.stats.avgResponseMinutes), locale)}′`
                : '—'
            }
          />
          <KpiCard
            label={t('moderation.kpi.resolved')}
            value={formatNumber(queue?.stats.resolvedToday ?? 0, locale)}
          />
        </div>

        <div className={styles.layout}>
          <Card className={styles.listCol}>
            <Tabs items={tabs} value={tab} onChange={setTab} label={t('moderation.breadcrumb')} />
            <AsyncBoundary
              status={query.status}
              error={query.error}
              data={items}
              isEmpty={(list) => list.length === 0}
              onRetry={() => void query.refetch()}
              empty={<EmptyState title={t('moderation.empty')} hint={null} />}
            >
              {(list) => (
                <ul>
                  {list.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={active?.id === item.id}
                        onClick={() => setActiveId(item.id)}
                        className={`${styles.item} ${active?.id === item.id ? styles.itemActive : styles.itemIdle}`}
                      >
                        <span className={styles.itemHead}>
                          <span className="flex items-center gap-2">
                            <span className={styles.author}>
                              {item.authorLabel ?? t('moderation.reporter')}
                            </span>
                            <span className={styles.time}>
                              {formatRelative(item.createdAt, locale)}
                            </span>
                          </span>
                          <StatusBadge
                            tone={SEVERITY_TONE[item.severity] ?? 'neutral'}
                            shape={item.severity === 'high' ? 'alert' : 'dot'}
                            label={t(`moderation.severity.${item.severity}` as const)}
                          />
                        </span>
                        <span className={`block ${styles.body}`}>{item.body || '—'}</span>
                        <span className={styles.itemFoot}>
                          <span className={styles.place}>{item.placeName ?? '—'}</span>
                          <span className={styles.kind}>
                            {item.kind === 'submission' && item.submissionCount > 1
                              ? t('moderation.submissionCount', { count: item.submissionCount })
                              : t(`moderation.tab.${tab}` as const)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </AsyncBoundary>
          </Card>

          <Card className={styles.detailCol}>
            <CardHeader title={t('moderation.detail')} />
            <CardBody className={styles.detailStack}>
              {!active ? (
                <p className="text-xs text-text-muted">{t('moderation.selectItem')}</p>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                      {t('moderation.content')}
                    </p>
                    <p className={styles.quote}>{active.body || '—'}</p>
                  </div>

                  {active.kind === 'review' && active.rating != null ? (
                    <p className="flex items-center gap-1 text-[13px] text-text-muted">
                      <StarIcon size={13} className="text-amber" />
                      {active.rating.toFixed(1)}
                    </p>
                  ) : null}

                  {active.kind === 'submission' && active.providerSnapshot ? (
                    <div className={styles.snapshot}>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                        {t('moderation.providerSnapshot')}
                      </p>
                      <div className="flex items-start gap-3">
                        {active.providerSnapshot.photoUrl ? (
                          <img
                            src={active.providerSnapshot.photoUrl}
                            alt=""
                            className={styles.snapshotThumb}
                            loading="lazy"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-text">
                            {active.providerSnapshot.name ?? '—'}
                          </p>
                          <p className="text-[11px] text-text-subtle">
                            {active.providerSnapshot.address ?? '—'}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-text-muted">
                            <StarIcon size={11} className="text-amber" />
                            {active.providerSnapshot.rating?.toFixed(1) ?? '—'}
                            {active.providerSnapshot.ratingCount != null
                              ? ` (${formatNumber(active.providerSnapshot.ratingCount, locale)})`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <p className={styles.attribution}>
                        {t('candidate.attribution', {
                          time: formatDateTime(active.providerSnapshot.fetchedAt ?? null, locale),
                        })}
                        {active.providerSnapshot.attributions.length
                          ? ` · ${active.providerSnapshot.attributions.join(', ')}`
                          : ''}
                      </p>
                      {active.submissionCount > 1 ? (
                        <Badge tone="lavender" className="mt-2">
                          {t('moderation.submissionCount', { count: active.submissionCount })}
                        </Badge>
                      ) : null}
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
                    error={
                      reason.length > 0 && reasonInvalid
                        ? t('moderation.reasonRequired')
                        : undefined
                    }
                  />

                  {active.kind === 'submission' ? (
                    <TextInput
                      label={t('moderation.mergeTarget')}
                      value={mergeTargetId}
                      onChange={(event) => setMergeTargetId(event.target.value)}
                      hint={active.matchedPlaceId ? `${active.matchedPlaceId}` : undefined}
                    />
                  ) : null}

                  <div className={styles.decisionGrid}>
                    {decisionsFor(active).map((decision) => (
                      <Button
                        key={decision.key}
                        variant={decision.variant}
                        disabled={
                          !allowDecision ||
                          (decision.key === 'merged' && mergeTargetId.trim().length === 0)
                        }
                        loading={decide.isPending && decide.variables?.decision === decision.key}
                        onClick={() => decide.mutate({ item: active, decision: decision.key })}
                      >
                        {decision.label}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  )
}
