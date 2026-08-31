import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { AuditTrail } from '@/shared/ui/AuditTrail'
import { TakedownDialog } from '@/features/emergency/takedownDialog.view'
import type { TakedownTarget } from '@/features/emergency/api'
import type { ModerationQueue } from '@/shared/api/contracts'
import {
  decideCheckin,
  decideReport,
  decideReview,
  fetchModerationQueue,
  fetchReviewHistory,
} from './api'
import { styles } from './moderationQueue.style'

type TabId = 'reviews' | 'reports' | 'checkins' | 'community'

const MIN_REASON = 3
const MAX_REASON = 500

/** Decisions each queue accepts, straight from `CmsModerationController`. */
const DECISIONS = {
  reviews: [
    { key: 'published', variant: 'success' as const },
    { key: 'rejected', variant: 'danger' as const },
  ],
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
  /** Reviews only: the star count, kept for the rating filter. */
  rating?: number | null
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

function toItems(
  queue: ModerationQueue | undefined,
  tab: TabId,
  t: ReturnType<typeof useT>,
): QueueItem[] {
  if (!queue) return []
  if (tab === 'reviews') {
    return queue.reviews.map((review) => ({
      id: review.id,
      title:
        review.rating != null
          ? t('moderation.rating', { value: review.rating })
          : t('moderation.tab.reviews'),
      meta: review.createdAt,
      body: review.text ?? null,
      rating: review.rating ?? null,
    }))
  }
  if (tab === 'reports') {
    return queue.reports.map((report) => ({
      id: report.id,
      title: report.reasonCode ?? t('moderation.tab.reports'),
      meta: report.targetType,
      // A report carries no prose — the reason code and target ARE the report,
      // and both are rendered as fields rather than dressed up as content.
      body: null,
      takedown: takedownFor(report.targetType, report.targetId),
    }))
  }
  if (tab === 'checkins') {
    return queue.checkins.map((checkin) => ({
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
  return queue.communityPlaces.map((place) => ({
    id: place.id,
    title: place.name,
    meta: place.createdAt,
    body: null,
  }))
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

  // `/moderation/reviews/:reviewId` is a shareable handle on one review — the
  // "detail view" this queue was missing, without a second screen that would
  // duplicate the decision form, the takedown path and the privacy rules.
  const { reviewId } = useParams<{ reviewId?: string }>()
  const [tab, setTab] = useState<TabId>(reviewId ? 'reviews' : 'reports')
  const [activeId, setActiveId] = useState<string | null>(reviewId ?? null)
  const [reason, setReason] = useState('')
  const [takedownOpen, setTakedownOpen] = useState(false)
  // Narrowing happens over the page already loaded, because the contract has
  // no filter or cursor to push it to the server (GoGo-BE#219).
  const [ratingFilter, setRatingFilter] = useState('all')
  const [reviewSearch, setReviewSearch] = useState('')

  // Reads are hierarchical, so any staff role can open the queue. Deciding is
  // exact-match and belongs to the moderator (and super_admin).
  const canRead = can('moderation.read')
  const canDecide = can('moderation.decide')

  const query = useQuery({
    queryKey: queryKeys.moderation.queue(50),
    queryFn: ({ signal }) => fetchModerationQueue(50, signal),
    enabled: canRead,
  })

  const items = useMemo(() => toItems(query.data, tab, t), [query.data, tab, t])

  const visibleItems = useMemo(() => {
    if (tab !== 'reviews') return items
    const term = reviewSearch.trim().toLocaleLowerCase()
    return items.filter((item) => {
      if (ratingFilter !== 'all' && String(item.rating ?? '') !== ratingFilter) return false
      if (term && !(item.body ?? '').toLocaleLowerCase().includes(term)) return false
      return true
    })
  }, [items, tab, ratingFilter, reviewSearch])

  const active = visibleItems.find((item) => item.id === activeId) ?? visibleItems[0] ?? null

  // Back/forward and a pasted link both land on the right review.
  useEffect(() => {
    if (!reviewId) return
    setTab('reviews')
    setActiveId(reviewId)
  }, [reviewId])

  const changeTab = (next: TabId) => {
    setTab(next)
    setActiveId(null)
    setReason('')
    // Leaving the reviews tab drops the review out of the URL, so a reload
    // does not bounce back to a tab the operator just left.
    if (next !== 'reviews' && reviewId) navigate('/moderation', { replace: true })
  }

  const selectItem = (id: string) => {
    setActiveId(id)
    if (tab === 'reviews') navigate(`/moderation/reviews/${id}`, { replace: true })
  }

  /**
   * Who decided what about this review, from `GET /cms/audit`. The queue lists
   * only pending items, so a trail here means the row was acted on and the
   * list has not refetched yet — worth seeing before deciding again.
   */
  const history = useQuery({
    queryKey: queryKeys.moderation.history(active?.id ?? ''),
    queryFn: ({ signal }) => fetchReviewHistory(active?.id ?? '', signal),
    enabled: canRead && tab === 'reviews' && Boolean(active?.id),
    staleTime: 30_000,
  })

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) => {
      if (tab === 'reviews') return decideReview(id, decision as 'published' | 'rejected', reason)
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

  const queue = query.data
  const tabs: TabItem<TabId>[] = [
    { id: 'reviews', label: t('moderation.tab.reviews'), count: queue?.reviews.length },
    { id: 'reports', label: t('moderation.tab.reports'), count: queue?.reports.length },
    { id: 'checkins', label: t('moderation.tab.checkins'), count: queue?.checkins.length },
    { id: 'community', label: t('moderation.tab.community'), count: queue?.communityPlaces.length },
  ]

  const pending =
    (queue?.reviews.length ?? 0) +
    (queue?.reports.length ?? 0) +
    (queue?.checkins.length ?? 0) +
    (queue?.communityPlaces.length ?? 0)

  const reasonInvalid = reason.trim().length < MIN_REASON || reason.length > MAX_REASON
  const decisions = tab === 'community' ? [] : DECISIONS[tab]

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('moderation.breadcrumb') }]}
        title={t('moderation.title')}
      />
      <PageBody>
        <div className={styles.kpiGrid}>
          <KpiCard label={t('moderation.kpi.pending')} value={formatNumber(pending, locale)} />
          <KpiCard
            label={t('moderation.kpi.reviews')}
            value={formatNumber(queue?.reviews.length ?? 0, locale)}
          />
          <KpiCard
            label={t('moderation.kpi.reports')}
            value={formatNumber(queue?.reports.length ?? 0, locale)}
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
            {tab === 'reviews' ? (
              <div className={styles.filterBar}>
                <InlineSelect
                  label={t('moderation.filter.rating')}
                  value={ratingFilter}
                  onChange={(event) => setRatingFilter(event.target.value)}
                >
                  <option value="all">{t('moderation.filter.ratingAll')}</option>
                  {[5, 4, 3, 2, 1].map((star) => (
                    <option key={star} value={String(star)}>
                      {t('moderation.rating', { value: star })}
                    </option>
                  ))}
                </InlineSelect>
                <SearchInput
                  label={t('moderation.filter.search')}
                  placeholder={t('moderation.filter.search')}
                  className="w-56"
                  value={reviewSearch}
                  onChange={(event) => setReviewSearch(event.target.value)}
                />
                {/* Says what it is: a narrowing of the page in hand, not a
                    server-side query with a total behind it. */}
                <span className={styles.filterCount} role="status" aria-live="polite">
                  {t('moderation.filter.count', {
                    shown: formatNumber(visibleItems.length, locale),
                    loaded: formatNumber(items.length, locale),
                  })}
                </span>
              </div>
            ) : null}
            <AsyncBoundary
              status={query.status}
              error={query.error}
              data={visibleItems}
              isEmpty={(list) => list.length === 0}
              onRetry={() => void query.refetch()}
              empty={
                <EmptyState
                  title={
                    tab === 'reviews' && items.length > 0
                      ? t('moderation.filter.noMatch')
                      : t('moderation.empty')
                  }
                  hint={null}
                />
              }
            >
              {(list) => (
                <ul>
                  {list.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={active?.id === item.id}
                        onClick={() => selectItem(item.id)}
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
                    <p className={styles.quote}>{active.body ?? t('moderation.noText')}</p>
                  </div>

                  {tab === 'checkins' || tab === 'reviews' ? (
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
                      {/* The realistic incident path: a report names a
                          published resource, and break-glass takes it down
                          while the ordinary decision waits. The pending queue
                          itself is no use here — these routes act on
                          `published` content, which the queue never lists. */}
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

                  {tab === 'reviews' ? (
                    <div>
                      <p className={styles.historyHead}>{t('moderation.history')}</p>
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
                  ) : null}

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
