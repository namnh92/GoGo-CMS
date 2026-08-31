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
import { TextArea } from '@/shared/ui/Field'
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
import type { ModerationQueue } from '@/shared/api/contracts'
import { decideCheckin, decideReport, fetchModerationQueue } from './api'
import { styles } from './moderationQueue.style'

type TabId = 'reports' | 'checkins' | 'community'

const MIN_REASON = 3
const MAX_REASON = 500

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

function toItems(
  queue: ModerationQueue | undefined,
  tab: TabId,
  t: ReturnType<typeof useT>,
): QueueItem[] {
  if (!queue) return []
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

  const [tab, setTab] = useState<TabId>('reports')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [takedownOpen, setTakedownOpen] = useState(false)

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

  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null

  const changeTab = (next: TabId) => {
    setTab(next)
    setActiveId(null)
    setReason('')
  }

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

  const queue = query.data
  const tabs: TabItem<TabId>[] = [
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
        actions={
          // Reviews have their own filtered, paged queue now; this is the way in.
          <Button variant="secondary" size="sm" onClick={() => navigate('/moderation/reviews')}>
            {t('reviews.title')}
          </Button>
        }
      />
      <PageBody>
        <div className={styles.kpiGrid}>
          <KpiCard label={t('moderation.kpi.pending')} value={formatNumber(pending, locale)} />
          <KpiCard
            label={t('moderation.kpi.reviews')}
            value={formatNumber(queue?.reviews.length ?? 0, locale)}
            sub={t('moderation.reviewsMoved')}
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
