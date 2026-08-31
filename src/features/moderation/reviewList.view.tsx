import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { InlineSelect, TextInput } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { StarIcon } from '@/shared/ui/icons'
import {
  reviewModerationStatusSchema,
  type CmsModerationReview,
  type ReviewModerationStatus,
} from '@/shared/api/contracts'
import { fetchModerationReview, fetchModerationReviews, type ReviewQueueFilters } from './api'
import { ReviewDetailDrawer } from './reviewDetail.view'
import { ReviewStatusBadge } from './reviewStatus'
import { styles } from './reviewList.style'

const PAGE_SIZE = 25

/** `''` is "not filtered"; every other value is sent to the server verbatim. */
type ReportedFilter = '' | 'true' | 'false'

const EMPTY = '—'

export default function ReviewListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const { reviewId } = useParams<{ reviewId?: string }>()
  const { can } = useSession()

  const [status, setStatus] = useState<ReviewModerationStatus>('pending')
  const [rating, setRating] = useState('')
  const [reported, setReported] = useState<ReportedFilter>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Keyset paging: remember the cursors walked so "previous" works without an
  // offset the server does not offer.
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)

  const canRead = can('moderation.read')

  const filters: ReviewQueueFilters = {
    status,
    rating: rating ? Number(rating) : undefined,
    reported: reported === '' ? undefined : reported === 'true',
    // A date input gives a plain day; the contract wants an instant.
    dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00Z`).toISOString() : undefined,
    // Exclusive upper bound, so picking the same day twice is an empty range
    // rather than a silent off-by-one.
    dateTo: dateTo ? new Date(`${dateTo}T00:00:00Z`).toISOString() : undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.moderation.reviews(filters),
    queryFn: ({ signal }) => fetchModerationReviews(filters, signal),
    enabled: canRead,
  })

  /*
   * BE-CMS-G6: a deep link fetches its review by id, whatever the list's
   * filter and page happen to hold. The row from the current page doubles as
   * initial data so an in-page click opens instantly.
   */
  const selectedQuery = useQuery({
    queryKey: queryKeys.moderation.review(reviewId ?? ''),
    queryFn: ({ signal }) => fetchModerationReview(reviewId!, signal),
    enabled: canRead && Boolean(reviewId),
    initialData: () => query.data?.items.find((item) => item.id === reviewId),
    staleTime: 15_000,
  })

  /** Any filter change invalidates the walked cursors — page 1 is the only safe landing. */
  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  const columns = useMemo<ColumnDef<CmsModerationReview, unknown>[]>(
    () => [
      {
        id: 'author',
        header: () => t('reviews.col.author'),
        cell: ({ row }) => (
          <span className={styles.author}>{row.original.authorDisplayName ?? EMPTY}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'place',
        header: () => t('reviews.col.place'),
        cell: ({ row }) => <span className={styles.place}>{row.original.placeName ?? EMPTY}</span>,
        enableSorting: false,
      },
      {
        id: 'rating',
        header: () => t('reviews.col.rating'),
        cell: ({ row }) => (
          <span className={styles.rating}>
            <StarIcon size={13} className="text-amber" />
            {row.original.rating}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'preview',
        header: () => t('reviews.col.preview'),
        cell: ({ row }) => (
          <span className={styles.preview}>{row.original.text ?? t('moderation.noText')}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('reviews.col.status'),
        cell: ({ row }) => <ReviewStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'reported',
        header: () => t('reviews.col.reported'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {/* A count, not a flag: "3 open reports" is a different situation
                from "1", and the number is what the server actually knows. */}
            {row.original.openReportCount > 0
              ? formatNumber(row.original.openReportCount, locale)
              : EMPTY}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'createdAt',
        header: () => t('reviews.col.createdAt'),
        cell: ({ row }) => (
          <span className={styles.muted}>{formatRelative(row.original.createdAt, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'moderator',
        header: () => t('reviews.col.moderator'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {/* The contract returns the admin's id, not a name. Showing a raw
                uuid helps nobody, so this says whether it was decided at all —
                the audit trail on the detail screen names who. */}
            {row.original.moderatedByAdminId ? t('reviews.decided') : EMPTY}
          </span>
        ),
        enableSorting: false,
      },
    ],
    [t, locale],
  )

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('reviews.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const page = query.data
  const nextCursor = page?.nextCursor ?? null
  const selected = selectedQuery.data ?? null
  // Only a real 404 (`REVIEW_NOT_FOUND`) counts as missing now — the id read
  // is unfiltered, so "not in the current filter" can no longer happen.
  const missingSelection = Boolean(reviewId) && selectedQuery.isError

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('moderation.breadcrumb'), to: '/moderation' },
          { label: t('reviews.breadcrumb') },
        ]}
        title={t('reviews.title')}
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <InlineSelect
              label={t('reviews.filter.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ReviewModerationStatus)
                resetPaging()
              }}
            >
              {reviewModerationStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`reviews.status.${value}` as const)}
                </option>
              ))}
            </InlineSelect>

            <InlineSelect
              label={t('moderation.filter.rating')}
              value={rating}
              onChange={(event) => {
                setRating(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('moderation.filter.ratingAll')}</option>
              {[5, 4, 3, 2, 1].map((star) => (
                <option key={star} value={String(star)}>
                  {t('moderation.rating', { value: star })}
                </option>
              ))}
            </InlineSelect>

            <InlineSelect
              label={t('reviews.filter.reported')}
              value={reported}
              onChange={(event) => {
                setReported(event.target.value as ReportedFilter)
                resetPaging()
              }}
            >
              <option value="">{t('reviews.filter.reportedAll')}</option>
              <option value="true">{t('reviews.filter.reportedOnly')}</option>
              <option value="false">{t('reviews.filter.reportedNone')}</option>
            </InlineSelect>

            <TextInput
              label={t('reviews.filter.from')}
              type="date"
              className={styles.dateField}
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value)
                resetPaging()
              }}
            />
            <TextInput
              label={t('reviews.filter.to')}
              type="date"
              className={styles.dateField}
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value)
                resetPaging()
              }}
            />
          </div>

          <AsyncBoundary
            status={query.status}
            error={query.error}
            data={page?.items ?? []}
            isEmpty={(items) => items.length === 0}
            onRetry={() => void query.refetch()}
            empty={<EmptyState title={t('reviews.empty')} hint={t('reviews.emptyHint')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('reviews.title')}
                  onRowClick={(row) => navigate(`/moderation/reviews/${row.id}`)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {/* `totalCount` is the size of the filtered set, so this is
                        a real total — not the page length #36 had to show. */}
                    {t('reviews.pageInfo', {
                      shown: formatNumber(items.length, locale),
                      total: formatNumber(page?.totalCount ?? 0, locale),
                    })}
                  </p>
                  <div className={styles.pagerActions}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pageIndex === 0}
                      onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
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

        {missingSelection ? (
          <p className={styles.notFound} role="status">
            <span aria-hidden="true">ℹ</span>
            {t('reviews.notOnThisPage')}
          </p>
        ) : null}

        <p className={styles.privacyNote}>{t('reviews.privacyNote')}</p>
      </PageBody>

      <ReviewDetailDrawer review={selected} onClose={() => navigate('/moderation/reviews')} />
    </>
  )
}
