import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { InlineSelect } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import { Badge } from '@/shared/ui/Badge'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import type { CmsPlanSummary } from '@/shared/api/contracts'
import { fetchPlans } from './api'
import { styles } from './users.style'

const PAGE_SIZE = 25
const PLAN_STATUSES = ['draft', 'current', 'superseded', 'archived'] as const

/** Plans, read-only (GoGo-BE#246 §4). Operational counts, no content. */
export default function PlanListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { can } = useSession()

  const [status, setStatus] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)

  const canRead = can('user.read')

  const filters = {
    status: status || undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }
  const query = useQuery({
    queryKey: queryKeys.plans.list(filters),
    queryFn: ({ signal }) => fetchPlans(filters, signal),
    enabled: canRead,
  })

  const columns = useMemo<ColumnDef<CmsPlanSummary, unknown>[]>(
    () => [
      {
        id: 'plan',
        header: () => t('plans.col.plan'),
        cell: ({ row }) => <span className={styles.mono}>{row.original.id}</span>,
        enableSorting: false,
      },
      {
        id: 'room',
        header: () => t('plans.col.room'),
        cell: ({ row }) => <span className={styles.mono}>{row.original.roomId}</span>,
        enableSorting: false,
      },
      {
        id: 'version',
        header: () => t('plans.col.version'),
        cell: ({ row }) => (
          <span className={styles.count}>v{formatNumber(row.original.version, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('plans.col.status'),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <span className={styles.muted}>{row.original.status}</span>
            {row.original.isStale ? <Badge tone="amber">{t('plans.stale')}</Badge> : null}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'stops',
        header: () => t('plans.col.stops'),
        cell: ({ row }) => (
          <span className={styles.count}>{formatNumber(row.original.stopCount, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'createdAt',
        header: () => t('plans.col.createdAt'),
        cell: ({ row }) => (
          <span className={styles.muted}>{formatDateTime(row.original.createdAt, locale)}</span>
        ),
        enableSorting: false,
      },
    ],
    [t, locale],
  )

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('plans.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const page = query.data
  const nextCursor = page?.nextCursor ?? null

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('plans.breadcrumb') }]}
        title={t('plans.title')}
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <InlineSelect
              label={t('plans.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setCursors([null])
                setPageIndex(0)
              }}
            >
              <option value="">{t('plans.filter.statusAll')}</option>
              {PLAN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </InlineSelect>
          </div>

          <AsyncBoundary
            status={query.status}
            error={query.error}
            data={page?.items ?? []}
            isEmpty={(items) => items.length === 0}
            onRetry={() => void query.refetch()}
            empty={<EmptyState title={t('plans.empty')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('plans.title')}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('plans.pageInfo', {
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
      </PageBody>
    </>
  )
}
