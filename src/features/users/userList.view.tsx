import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { InlineSelect, SearchInput } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import { Badge } from '@/shared/ui/Badge'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { appUserStatusSchema, type AppUserStatus, type CmsAppUser } from '@/shared/api/contracts'
import { fetchAppUsers, type AppUserFilters } from './api'
import { AppUserStatusBadge } from './userStatus'
import { UserDetailDrawer } from './userDetail.view'
import { styles } from './users.style'

const PAGE_SIZE = 25

/**
 * App accounts (GoGo-BE#246 §1). `ops_admin` and above — the server keeps
 * this outside rank-read, and so does the nav.
 *
 * There is deliberately no auth-method filter: one method exists today, and a
 * control that can only return everything is not a control. It shows as a
 * badge instead, so the day a second method lands the data is already there.
 */
export default function UserListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { can } = useSession()

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<CmsAppUser | null>(null)

  const canRead = can('user.read')

  const filters: AppUserFilters = {
    q: q || undefined,
    status: (status || undefined) as AppUserStatus | undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.appUsers.list(filters),
    queryFn: ({ signal }) => fetchAppUsers(filters, signal),
    enabled: canRead,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  const columns = useMemo<ColumnDef<CmsAppUser, unknown>[]>(
    () => [
      {
        id: 'user',
        header: () => t('users.col.user'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.displayName}</p>
            {row.original.email ? (
              <p className={styles.email}>{row.original.email}</p>
            ) : (
              // Null email = deleted account, address freed. Said in words —
              // an em-dash here would read as broken data.
              <p className={styles.deletedEmail}>{t('users.emailFreed')}</p>
            )}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('users.col.status'),
        cell: ({ row }) => <AppUserStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'auth',
        header: () => t('users.col.auth'),
        cell: ({ row }) => (
          <Badge tone="neutral">{t(`users.auth.${row.original.authMethod}` as const)}</Badge>
        ),
        enableSorting: false,
      },
      {
        id: 'rooms',
        header: () => t('users.col.rooms'),
        cell: ({ row }) => (
          <div className="text-center">
            <p className={styles.count}>
              {formatNumber(
                row.original.counters.roomsCreated + row.original.counters.roomsJoined,
                locale,
              )}
            </p>
            <p className={styles.countSub}>
              {t('users.roomsSplit', {
                created: formatNumber(row.original.counters.roomsCreated, locale),
                joined: formatNumber(row.original.counters.roomsJoined, locale),
              })}
            </p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'reviews',
        header: () => t('users.col.reviews'),
        cell: ({ row }) => (
          <span className={styles.count}>
            {formatNumber(row.original.counters.reviews, locale)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'saved',
        header: () => t('users.col.saved'),
        cell: ({ row }) => (
          <span className={styles.count}>
            {formatNumber(row.original.counters.savedPlaces, locale)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'reports',
        header: () => t('users.col.reports'),
        cell: ({ row }) =>
          row.original.reportCount > 0 ? (
            <Badge tone="danger">{formatNumber(row.original.reportCount, locale)}</Badge>
          ) : (
            <span className={styles.muted}>0</span>
          ),
        enableSorting: false,
      },
      {
        id: 'lastActive',
        header: () => t('users.col.lastActive'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.lastActiveAt
              ? formatRelative(row.original.lastActiveAt, locale)
              : t('users.neverActive')}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'createdAt',
        header: () => t('users.col.createdAt'),
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
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('users.title')} />
        <PageBody>
          <PermissionDeniedState hint={t('users.deniedHint')} />
        </PageBody>
      </>
    )
  }

  const page = query.data
  const nextCursor = page?.nextCursor ?? null

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('users.breadcrumb') }]}
        title={t('users.title')}
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <SearchInput
              label={t('users.filter.search')}
              placeholder={t('users.filter.search')}
              className={styles.search}
              value={q}
              onChange={(event) => {
                setQ(event.target.value)
                resetPaging()
              }}
            />
            <InlineSelect
              label={t('users.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('users.filter.statusAll')}</option>
              {appUserStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`users.status.${value}` as const)}
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
            empty={<EmptyState title={t('users.empty')} hint={t('users.emptyHint')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('users.title')}
                  onRowClick={(row) => setSelected(row)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('users.pageInfo', {
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

        {/* No coordinates, no device tokens, no raw preferences: the server
            does not send them, so a console session cannot leak them. */}
        <p className={styles.privacyNote}>{t('users.privacyNote')}</p>
      </PageBody>

      {selected ? <UserDetailDrawer user={selected} onClose={() => setSelected(null)} /> : null}
    </>
  )
}
