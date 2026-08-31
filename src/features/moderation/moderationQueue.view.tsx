import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader, KpiCard } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { InlineSelect, SearchInput, TextArea } from '@/shared/ui/Field'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { ShieldOffIcon, StarIcon } from '@/shared/ui/icons'
import { TakedownDialog } from '@/features/emergency/takedownDialog.view'
import type { TakedownTarget } from '@/features/emergency/api'
import {
  checkinModerationStatusSchema,
  reportStatusSchema,
  reportTargetTypeSchema,
  type CheckinModerationStatus,
  type ReportStatus,
  type ReportTargetType,
} from '@/shared/api/contracts'
import {
  decideCheckin,
  decideReport,
  fetchCommunityPlaces,
  fetchModerationCheckins,
  fetchModerationCounts,
  fetchModerationReports,
} from './api'
import { styles } from './moderationQueue.style'

type TabId = 'reports' | 'checkins' | 'community'

const MIN_REASON = 3
const MAX_REASON = 500
const PAGE_SIZE = 25

/** Decisions each queue accepts, straight from `CmsModerationController`. */
const DECISIONS = {
  reports: [
    { key: 'actioned', variant: 'success' as const },
    { key: 'dismissed', variant: 'secondary' as const },
  ],
  checkins: [
    { key: 'approved', variant: 'success' as const },
    { key: 'rejected', variant: 'danger' as const },
  ],
} as const

type QueueItem = {
  id: string
  title: string
  meta: string
  body: string | null
  /** Set on reports: what the report points at, so it can be taken down. */
  takedown?: { target: TakedownTarget; id: string } | null
}

/** `targetType` on a report maps onto the break-glass routes we have. */
function takedownFor(targetType: string, targetId: string | null | undefined) {
  if (!targetId) return null
  if (targetType === 'review') return { target: 'review' as const, id: targetId }
  if (targetType === 'checkin' || targetType === 'stop_checkin')
    return { target: 'checkin' as const, id: targetId }
  if (targetType === 'place') return { target: 'place' as const, id: targetId }
  return null
}

export default function ModerationQueueScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [tab, setTab] = useState<TabId>('reports')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [takedownOpen, setTakedownOpen] = useState(false)

  // One filter set per queue: the contracts differ, and flattening them would
  // mean sending a parameter the endpoint does not accept.
  const [reportStatus, setReportStatus] = useState<ReportStatus>('open')
  const [reportTarget, setReportTarget] = useState('')
  const [checkinStatus, setCheckinStatus] = useState<CheckinModerationStatus>('pending')
  const [checkinBill, setCheckinBill] = useState('')
  const [communitySearch, setCommunitySearch] = useState('')

  // Keyset paging: the cursors walked, so "previous" works without an offset
  // the server does not offer.
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const cursor = cursors[pageIndex] ?? null

  // Reads are hierarchical, so any staff role can open the queue. Deciding is
  // exact-match and belongs to the moderator (and super_admin).
  const canRead = can('moderation.read')
  const canDecide = can('moderation.decide')

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
    setActiveId(null)
  }

  const changeTab = (next: TabId) => {
    setTab(next)
    setReason('')
    resetPaging()
  }

  /** The backlog behind the KPI row — counted over the queue, not over a page. */
  const counts = useQuery({
    queryKey: queryKeys.moderation.counts,
    queryFn: ({ signal }) => fetchModerationCounts(signal),
    enabled: canRead,
    staleTime: 30_000,
  })

  const reportFilters = {
    status: reportStatus,
    ...(reportTarget ? { targetType: reportTarget as ReportTargetType } : {}),
    limit: PAGE_SIZE,
    cursor,
  }
  const reportsQuery = useQuery({
    queryKey: queryKeys.moderation.reports(reportFilters),
    queryFn: ({ signal }) => fetchModerationReports(reportFilters, signal),
    enabled: canRead && tab === 'reports',
  })

  const checkinFilters = {
    status: checkinStatus,
    ...(checkinBill ? { hasBill: checkinBill === 'true' } : {}),
    limit: PAGE_SIZE,
    cursor,
  }
  const checkinsQuery = useQuery({
    queryKey: queryKeys.moderation.checkins(checkinFilters),
    queryFn: ({ signal }) => fetchModerationCheckins(checkinFilters, signal),
    enabled: canRead && tab === 'checkins',
  })

  const communityFilters = { q: communitySearch || undefined, limit: PAGE_SIZE, cursor }
  const communityQuery = useQuery({
    queryKey: queryKeys.moderation.community(communityFilters),
    queryFn: ({ signal }) => fetchCommunityPlaces(communityFilters, signal),
    enabled: canRead && tab === 'community',
  })

  const activeQuery =
    tab === 'reports' ? reportsQuery : tab === 'checkins' ? checkinsQuery : communityQuery

  const items = useMemo<QueueItem[]>(() => {
    if (tab === 'reports') {
      return (reportsQuery.data?.items ?? []).map((report) => ({
        id: report.id,
        title: report.reasonCode,
        meta: report.targetType,
        // The reporter's note is the only prose a report carries.
        body: report.note ?? null,
        takedown: takedownFor(report.targetType, report.targetId),
      }))
    }
    if (tab === 'checkins') {
      return (checkinsQuery.data?.items ?? []).map((checkin) => ({
        id: checkin.id,
        title:
          checkin.rating != null
            ? t('moderation.rating', { value: checkin.rating })
            : t('moderation.tab.checkins'),
        meta: `${t('moderation.photoCount', { count: checkin.photoCount })} · ${
          checkin.hasBill ? t('moderation.hasBill') : t('moderation.noBill')
        }`,
        body: checkin.note ?? null,
      }))
    }
    return (communityQuery.data?.items ?? []).map((place) => ({
      id: place.id,
      title: place.name,
      meta: place.addressText ?? place.createdAt,
      body: null,
    }))
  }, [tab, reportsQuery.data, checkinsQuery.data, communityQuery.data, t])

  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) => {
      if (tab === 'reports') return decideReport(id, decision as 'actioned' | 'dismissed', reason)
      return decideCheckin(id, decision as 'approved' | 'rejected', reason)
    },
    onSuccess: () => {
      toast.success(t('moderation.detail'))
      setReason('')
      setActiveId(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.moderation.all })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('moderation.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const backlog = counts.data
  const tabs: TabItem<TabId>[] = [
    { id: 'reports', label: t('moderation.tab.reports'), count: backlog?.reports },
    { id: 'checkins', label: t('moderation.tab.checkins'), count: backlog?.checkins },
    { id: 'community', label: t('moderation.tab.community'), count: backlog?.communityPlaces },
  ]

  const reasonInvalid = reason.trim().length < MIN_REASON || reason.length > MAX_REASON
  const decisions = tab === 'community' ? [] : DECISIONS[tab]
  const page = activeQuery.data
  const nextCursor = page?.nextCursor ?? null

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('moderation.breadcrumb') }]}
        title={t('moderation.title')}
        actions={
          // Reviews have their own filtered, paged queue; this is the way in.
          <Button variant="secondary" size="sm" onClick={() => navigate('/moderation/reviews')}>
            {t('reviews.title')}
          </Button>
        }
      />
      <PageBody>
        <div className={styles.kpiGrid}>
          <KpiCard
            label={t('moderation.kpi.pending')}
            value={formatNumber(backlog?.total ?? 0, locale)}
          />
          <KpiCard
            label={t('moderation.kpi.reviews')}
            value={formatNumber(backlog?.reviews ?? 0, locale)}
            sub={t('moderation.reviewsMoved')}
          />
          <KpiCard
            label={t('moderation.kpi.reports')}
            value={formatNumber(backlog?.reports ?? 0, locale)}
          />
        </div>

        <div className={styles.layout}>
          <Card className={styles.listCol}>
            <Tabs
              items={tabs}
              value={tab}
              onChange={changeTab}
              label={t('moderation.breadcrumb')}
            />

            <div className={styles.filterBar}>
              {tab === 'reports' ? (
                <>
                  <InlineSelect
                    label={t('moderation.filter.status')}
                    value={reportStatus}
                    onChange={(event) => {
                      setReportStatus(event.target.value as ReportStatus)
                      resetPaging()
                    }}
                  >
                    {reportStatusSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {t(`moderation.reportStatus.${value}` as const)}
                      </option>
                    ))}
                  </InlineSelect>
                  <InlineSelect
                    label={t('moderation.filter.target')}
                    value={reportTarget}
                    onChange={(event) => {
                      setReportTarget(event.target.value)
                      resetPaging()
                    }}
                  >
                    <option value="">{t('moderation.filter.targetAll')}</option>
                    {reportTargetTypeSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {t(`moderation.target.${value}` as const)}
                      </option>
                    ))}
                  </InlineSelect>
                </>
              ) : null}

              {tab === 'checkins' ? (
                <>
                  <InlineSelect
                    label={t('moderation.filter.status')}
                    value={checkinStatus}
                    onChange={(event) => {
                      setCheckinStatus(event.target.value as CheckinModerationStatus)
                      resetPaging()
                    }}
                  >
                    {checkinModerationStatusSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {t(`moderation.checkinStatus.${value}` as const)}
                      </option>
                    ))}
                  </InlineSelect>
                  <InlineSelect
                    label={t('moderation.filter.bill')}
                    value={checkinBill}
                    onChange={(event) => {
                      setCheckinBill(event.target.value)
                      resetPaging()
                    }}
                  >
                    <option value="">{t('moderation.filter.billAll')}</option>
                    <option value="true">{t('moderation.hasBill')}</option>
                    <option value="false">{t('moderation.noBill')}</option>
                  </InlineSelect>
                </>
              ) : null}

              {tab === 'community' ? (
                <SearchInput
                  label={t('moderation.filter.place')}
                  placeholder={t('moderation.filter.place')}
                  className="w-64"
                  value={communitySearch}
                  onChange={(event) => {
                    setCommunitySearch(event.target.value)
                    resetPaging()
                  }}
                />
              ) : null}

              <span className={styles.filterCount} role="status" aria-live="polite">
                {/* `totalCount` describes the filter, not the page. */}
                {t('moderation.filter.total', {
                  total: formatNumber(page?.totalCount ?? 0, locale),
                })}
              </span>
            </div>

            <AsyncBoundary
              status={activeQuery.status}
              error={activeQuery.error}
              data={items}
              isEmpty={(list) => list.length === 0}
              onRetry={() => void activeQuery.refetch()}
              empty={<EmptyState title={t('moderation.empty')} hint={null} />}
            >
              {(list) => (
                <>
                  <ul>
                    {list.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-pressed={active?.id === item.id}
                          onClick={() => setActiveId(item.id)}
                          className={`${styles.item} ${
                            active?.id === item.id ? styles.itemActive : styles.itemIdle
                          }`}
                        >
                          <span className={styles.itemHead}>
                            <span className={styles.author}>{item.title}</span>
                            <span className={styles.time}>
                              {item.meta.includes('T')
                                ? formatRelative(item.meta, locale)
                                : item.meta}
                            </span>
                          </span>
                          <span className={`block ${styles.body}`}>
                            {item.body ?? t('moderation.noText')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.pager}>
                    <p className={styles.pagerInfo}>
                      {t('moderation.pageInfo', { shown: formatNumber(list.length, locale) })}
                    </p>
                    <div className={styles.pagerActions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pageIndex === 0}
                        onClick={() => {
                          setPageIndex((index) => Math.max(0, index - 1))
                          setActiveId(null)
                        }}
                      >
                        {t('action.previous')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={nextCursor === null}
                        onClick={() => {
                          setCursors((current) => {
                            const next = current.slice(0, pageIndex + 1)
                            next.push(nextCursor)
                            return next
                          })
                          setPageIndex((index) => index + 1)
                          setActiveId(null)
                        }}
                      >
                        {t('action.next')}
                      </Button>
                    </div>
                  </div>
                </>
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
                    <p className="mb-1 text-[11px] font-bold tracking-wide text-text-subtle uppercase">
                      {t('moderation.content')}
                    </p>
                    <p className={styles.quote}>{active.body ?? t('moderation.noText')}</p>
                  </div>

                  {tab === 'checkins' ? (
                    <p className="flex items-center gap-1 text-[13px] text-text-muted">
                      <StarIcon size={13} className="text-amber" />
                      {active.title}
                    </p>
                  ) : null}

                  {tab === 'reports' ? (
                    <>
                      <dl className="grid grid-cols-2 gap-2 text-[12px]">
                        <div>
                          <dt className="text-text-subtle">{t('moderation.reportTarget')}</dt>
                          <dd className="font-medium text-text">{active.meta}</dd>
                        </div>
                        <div>
                          <dt className="text-text-subtle">{t('moderation.reportReason')}</dt>
                          <dd className="font-mono text-text">{active.title}</dd>
                        </div>
                      </dl>
                      {/* The realistic incident path: a report names a published
                          resource, and break-glass takes it down while the
                          ordinary decision waits. */}
                      {active.takedown ? (
                        <Button
                          variant="danger"
                          iconLeft={<ShieldOffIcon size={14} />}
                          disabled={!can('emergency.takedown') || !online}
                          onClick={() => setTakedownOpen(true)}
                        >
                          {t('emergency.action')}
                        </Button>
                      ) : null}
                    </>
                  ) : null}

                  {tab === 'community' ? (
                    <>
                      <p className={styles.contractNote}>
                        <span aria-hidden="true">ℹ</span>
                        {t('moderation.communityHint')}
                      </p>
                      <Button
                        variant="secondary"
                        disabled={!can('place.read')}
                        onClick={() => navigate(`/places/${active.id}`)}
                      >
                        {t('moderation.openPlace')}
                      </Button>
                    </>
                  ) : (
                    <>
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
                      <div className={styles.decisionGrid}>
                        {decisions.map((decision) => (
                          <Button
                            key={decision.key}
                            variant={decision.variant}
                            disabled={!canDecide || !online || reasonInvalid}
                            loading={
                              decide.isPending && decide.variables?.decision === decision.key
                            }
                            onClick={() => decide.mutate({ id: active.id, decision: decision.key })}
                          >
                            {t(`moderation.decide.${decision.key}` as const)}
                          </Button>
                        ))}
                      </div>
                    </>
                  )}

                  <p className={styles.privacyNote}>{t('moderation.privacyNote')}</p>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>

      <TakedownDialog
        open={takedownOpen && Boolean(active?.takedown)}
        onClose={() => setTakedownOpen(false)}
        target={active?.takedown?.target ?? 'review'}
        resourceId={active?.takedown?.id ?? ''}
        resourceLabel={active?.title}
      />
    </>
  )
}
