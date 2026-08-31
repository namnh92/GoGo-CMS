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
import type { CmsRoomSummary } from '@/shared/api/contracts'
import { fetchRooms } from './api'
import { styles } from './users.style'

const PAGE_SIZE = 25
const ROOM_STATUSES = ['draft', 'active', 'planning', 'completed', 'archived'] as const

/**
 * Rooms, read-only (GoGo-BE#246 §4). The invite `code` never appears — it is
 * a bearer secret, and this list is exactly the kind of place such a value
 * would be copied out of. The host is an id: identity lives on the
 * access-controlled account detail, not here.
 */
export default function RoomListScreen() {
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
    queryKey: queryKeys.rooms.list(filters),
    queryFn: ({ signal }) => fetchRooms(filters, signal),
    enabled: canRead,
  })

  const columns = useMemo<ColumnDef<CmsRoomSummary, unknown>[]>(
    () => [
      {
        id: 'room',
        header: () => t('rooms.col.room'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.title || t('users.untitledRoom')}</p>
            <p className={styles.mono}>{row.original.id}</p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'type',
        header: () => t('rooms.col.type'),
        cell: ({ row }) => <Badge tone="neutral">{row.original.type}</Badge>,
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('rooms.col.status'),
        cell: ({ row }) => <span className={styles.muted}>{row.original.status}</span>,
        enableSorting: false,
      },
      {
        id: 'decisionMode',
        header: () => t('rooms.col.decisionMode'),
        cell: ({ row }) => <span className={styles.muted}>{row.original.decisionMode}</span>,
        enableSorting: false,
      },
      {
        id: 'members',
        header: () => t('rooms.col.members'),
        cell: ({ row }) => (
          <span className={styles.count}>
            {formatNumber(row.original.memberCount, locale)}/
            {formatNumber(row.original.participantCount, locale)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'plans',
        header: () => t('rooms.col.plans'),
        cell: ({ row }) => (
          <span className={styles.count}>{formatNumber(row.original.planCount, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'host',
        header: () => t('rooms.col.host'),
        // An id, deliberately: the name belongs to the account screen.
        cell: ({ row }) => <span className={styles.mono}>{row.original.hostUserId}</span>,
        enableSorting: false,
      },
      {
        id: 'createdAt',
        header: () => t('rooms.col.createdAt'),
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
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('rooms.title')} />
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
        breadcrumb={[{ label: t('app.suffix') }, { label: t('rooms.breadcrumb') }]}
        title={t('rooms.title')}
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <InlineSelect
              label={t('rooms.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setCursors([null])
                setPageIndex(0)
              }}
            >
              <option value="">{t('rooms.filter.statusAll')}</option>
              {ROOM_STATUSES.map((value) => (
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
            empty={<EmptyState title={t('rooms.empty')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('rooms.title')}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('rooms.pageInfo', {
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
        <p className={styles.privacyNote}>{t('rooms.codeNote')}</p>
      </PageBody>
    </>
  )
}
