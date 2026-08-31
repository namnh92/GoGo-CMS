import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Badge, StatusBadge } from '@/shared/ui/Badge'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { PlusIcon } from '@/shared/ui/icons'
import {
  adminRoleSchema,
  adminStatusSchema,
  type AdminRole,
  type AdminStatus,
  type CmsAdmin,
} from '@/shared/api/contracts'
import { fetchAdmins, type AdminListFilters } from './api'
import { styles } from './adminList.style'

const PAGE_SIZE = 25
const NEVER = '—'

export default function AdminListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const { can, session } = useSession()

  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  // Keyset paging: remember the cursors walked so "previous" works without an
  // offset the server does not offer.
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)

  // Reading who holds which role is super-admin-only on the server; this is the
  // courtesy, the API is the control.
  const canRead = can('admin.read')
  const canCreate = can('admin.create')

  const filters: AdminListFilters = {
    q: q || undefined,
    role: (role || undefined) as AdminRole | undefined,
    status: (status || undefined) as AdminStatus | undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.admins.list(filters),
    queryFn: ({ signal }) => fetchAdmins(filters, signal),
    enabled: canRead,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  const columns = useMemo<ColumnDef<CmsAdmin, unknown>[]>(
    () => [
      {
        id: 'account',
        header: () => t('admins.col.account'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.displayName}</p>
            {/* Email identifies the account and is the only contact detail the
                server returns — there is nothing else here to withhold. */}
            <p className={styles.email}>{row.original.email}</p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'role',
        header: () => t('admins.col.role'),
        cell: ({ row }) => (
          <Badge tone={row.original.role === 'super_admin' ? 'coral' : 'neutral'}>
            {t(`role.${row.original.role}` as const)}
          </Badge>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('admins.col.status'),
        cell: ({ row }) => (
          <StatusBadge
            tone={row.original.status === 'active' ? 'mint' : 'danger'}
            shape={row.original.status === 'active' ? 'check' : 'alert'}
            label={t(`admins.status.${row.original.status}` as const)}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'lastLoginAt',
        header: () => t('admins.col.lastLogin'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {/* Absent means never signed in — a real fact about the account,
                not a gap in the data. */}
            {row.original.lastLoginAt
              ? formatRelative(row.original.lastLoginAt, locale)
              : t('admins.neverSignedIn')}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'createdAt',
        header: () => t('admins.col.createdAt'),
        cell: ({ row }) => (
          <span className={styles.muted}>{formatDateTime(row.original.createdAt, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'you',
        header: () => <span className="sr-only">{t('admins.col.you')}</span>,
        cell: ({ row }) =>
          // Knowing which row is you matters before you act on a role.
          row.original.displayName === session?.displayName ? (
            <Badge tone="lavender">{t('admins.you')}</Badge>
          ) : (
            <span className={styles.muted}>{NEVER}</span>
          ),
        enableSorting: false,
      },
    ],
    [t, locale, session?.displayName],
  )

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('admins.listTitle')} />
        <PageBody>
          <PermissionDeniedState hint={t('admins.deniedHint')} />
        </PageBody>
      </>
    )
  }

  const page = query.data
  const nextCursor = page?.nextCursor ?? null

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('settings.breadcrumb'), to: '/settings' },
          { label: t('admins.breadcrumb') },
        ]}
        title={t('admins.listTitle')}
        actions={
          canCreate ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={14} />}
              onClick={() => navigate('/settings/accounts/new')}
            >
              {t('admins.new')}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <SearchInput
              label={t('admins.filter.search')}
              placeholder={t('admins.filter.search')}
              className={styles.search}
              value={q}
              onChange={(event) => {
                setQ(event.target.value)
                resetPaging()
              }}
            />
            <InlineSelect
              label={t('admins.col.role')}
              value={role}
              onChange={(event) => {
                setRole(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('admins.filter.roleAll')}</option>
              {adminRoleSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`role.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('admins.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('admins.filter.statusAll')}</option>
              {adminStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`admins.status.${value}` as const)}
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
            empty={<EmptyState title={t('admins.empty')} hint={t('admins.emptyHint')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('admins.listTitle')}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('admins.pageInfo', {
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

        {/* The list is read-only because the contract is: the BFF serves no
            suspend, no role change and no delete. Saying so beats leaving an
            operator hunting for a button that was never built. */}
        <p className={styles.privacyNote}>{t('admins.readOnlyNote')}</p>
      </PageBody>
    </>
  )
}
