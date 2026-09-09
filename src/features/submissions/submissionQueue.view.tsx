import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { cn } from '@/shared/ui/cn'
import { fetchSubmissions, type SubmissionStatus } from './api'
import { SubmissionReviewDrawer } from './submissionReview.view'
import { styles } from './submissionQueue.style'

const TAB_STATUSES: SubmissionStatus[] = ['pending', 'approved', 'rejected', 'merged']

/**
 * PI-CMS-007 — places proposed from the app.
 *
 * Its own screen rather than a tab inside moderation: the decisions differ
 * (approve creates a catalog draft, merge points at an existing place) and the
 * queue is prioritised by how many people asked for the same place, which is
 * not how reviews or reports are triaged.
 */
/**
 * PI-CMS-007 — places proposed from the app.
 *
 * Its own screen rather than a tab inside moderation: the decisions differ
 * (approve creates a catalog draft, merge points at an existing place) and the
 * queue is prioritised by how many people asked for the same place, which is
 * not how reviews or reports are triaged.
 *
 * GoGo-CMS#194 — the queue is a queue again. It used to carry the decision
 * itself, in an aside with a reason box and three buttons, and a Google Place
 * ID for a title; deciding on that meant deciding on an identifier. Everything
 * a decision needs now lives in the review drawer, which the row opens; this
 * screen's job is to say what is waiting and which rows to look at first.
 *
 * The drawer's identity is in the URL (`/submissions/:submissionId`), so a
 * moderator can hand a colleague a link to the exact proposal — the same thing
 * the reviews queue does with `moderation/reviews/:reviewId`.
 */
export default function SubmissionQueueScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const { submissionId } = useParams()
  const { can } = useSession()

  const [status, setStatus] = useState<SubmissionStatus>('pending')
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  const query = useQuery({
    queryKey: queryKeys.submissions.list(status, cursor),
    queryFn: ({ signal }) => fetchSubmissions({ status, cursor }, signal),
    enabled: can('submission.read'),
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

  const items = query.data?.items ?? []

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
            <div className={styles.list}>
              {data.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/submissions/${item.id}`)}
                  className={cn(styles.row, styles.rowIdle)}
                >
                  <span className={styles.rowTop}>
                    <span className={styles.title}>
                      {/*
                       * A name only when GoGo actually has one. Google's name
                       * for a place is not stored, and fetching Details once
                       * per row to fill this column would bill a page of
                       * twenty-five to open the screen — so a fresh proposal
                       * says "no name yet" and offers the review action, which
                       * is the honest answer rather than a Place ID wearing a
                       * title's typography.
                       */}
                      {item.displayName ?? t('submissions.noName')}
                    </span>
                    <span className={styles.badges}>
                      {item.identityConflict ? (
                        <Badge tone="danger">{t('submissions.identityConflict')}</Badge>
                      ) : null}
                      {item.linkedPlaceId && !item.identityConflict ? (
                        <Badge tone="amber">{t('submissions.duplicate')}</Badge>
                      ) : null}
                      {item.hasReview ? (
                        <Badge tone="mint">{t('submissions.hasReview')}</Badge>
                      ) : null}
                      {item.submissionCount > 1 ? (
                        <Badge tone="lavender">
                          {t('submissions.count', {
                            n: formatNumber(item.submissionCount, locale),
                          })}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                  <span className={styles.placeId}>{item.googlePlaceId}</span>
                  <span className={styles.meta}>
                    <span>{formatRelative(item.createdAt, locale)}</span>
                    {item.categoryKey ? <span>{item.categoryKey}</span> : null}
                    <span>
                      {item.fromRegisteredUser
                        ? t('submissions.fromUser')
                        : t('submissions.fromGuest')}
                    </span>
                    {item.displayNameSource ? (
                      <span>{t(`submissions.nameFrom.${item.displayNameSource}`)}</span>
                    ) : (
                      <span>{t('submissions.noNameHint')}</span>
                    )}
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
          )}
        </AsyncBoundary>
      </PageBody>

      <SubmissionReviewDrawer
        submissionId={submissionId ?? null}
        onClose={() => navigate('/submissions')}
      />
    </>
  )
}
