import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { InlineSelect } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import type {
  AdministrativeMappingListItem,
  AdministrativeMappingStatus,
} from '@/shared/api/contracts-administrative'
import { fetchAdministrativeMappings, fetchAdministrativeRemediation } from './api'
import { MappingDetailDrawer } from './mappingDetail.view'
import { MappingStatusBadge, RemediationCounts } from './mappingParts'
import { styles } from './mapping.style'

const PAGE_SIZE = 50

/** A key the catalogue owns; unknown values render as themselves, never blank. */
function placeStatusLabel(t: ReturnType<typeof useT>, status: string): string {
  const key = `placeStatus.${status}` as Parameters<typeof t>[0]
  const label = t(key)
  return label === key ? status : label
}

function statusLabel(t: ReturnType<typeof useT>, status: string): string {
  const key = `mapping.status.${status}` as Parameters<typeof t>[0]
  const label = t(key)
  return label === key ? status : label
}

const STATUSES: AdministrativeMappingStatus[] = [
  'NEEDS_REVIEW',
  'STALE',
  'UNMAPPED',
  'AUTO_MATCHED',
  'VERIFIED',
  'REJECTED',
]

/** What a person has something to decide about. The default view. */
const ACTIONABLE = 'NEEDS_REVIEW,STALE'

/**
 * CMS #156 — the per-place administrative mapping review queue.
 *
 * This screen answers one question about one place: is it where the mapping
 * says it is. It is deliberately not the source-drift queue (#155), which
 * adjudicates the dataset those answers are validated against, and it is not
 * catalogue publication, which is the editor's decision. The three are kept
 * apart in the copy as carefully as in the permissions, because a moderator who
 * reads "verified" as "published" has certified something they did not intend.
 *
 * The default view is NEEDS_REVIEW and STALE — the rows where somebody has
 * something to do. UNMAPPED places are not buried by that: they are one filter
 * away, counted in the summary, and reachable through the blocked-approval view
 * that exists precisely so a place stuck on a mapping nobody can see does not
 * sit there forever.
 */
export default function AdministrativeMappingScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { can } = useSession()

  const allowed = can('administrativeMapping.read')

  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ACTIONABLE
  const blockedOnly = params.get('blocked') === 'true'
  const cursor = params.get('cursor')
  const [openPlace, setOpenPlace] = useState<string | null>(null)

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // The cursor keys on the previous page; a filter change invalidates it.
    if (key !== 'cursor') next.delete('cursor')
    setParams(next, { replace: true })
  }

  const scope = `${status}|${blockedOnly}|${cursor ?? ''}`
  const queue = useQuery({
    queryKey: queryKeys.administrativeMappings(scope),
    queryFn: ({ signal }) =>
      fetchAdministrativeMappings(
        {
          status: status ? (status.split(',') as AdministrativeMappingStatus[]) : undefined,
          blockedApprovalOnly: blockedOnly,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        },
        signal,
      ),
    enabled: allowed,
  })

  const remediation = useQuery({
    queryKey: queryKeys.administrativeRemediation(),
    queryFn: ({ signal }) => fetchAdministrativeRemediation(signal),
    enabled: allowed,
    staleTime: 30_000,
  })

  const rows = useMemo(() => queue.data?.items ?? [], [queue.data])

  const columns = useMemo<ColumnDef<AdministrativeMappingListItem, unknown>[]>(
    () => [
      {
        id: 'place',
        header: () => t('mapping.col.place'),
        cell: ({ row }) => (
          <>
            <span className={styles.rowName} title={row.original.name}>
              {row.original.name}
            </span>
            {/* The place's own catalogue status, which is a different thing
                from its mapping status in the next column. */}
            <span className={styles.rowMeta}>{placeStatusLabel(t, row.original.placeStatus)}</span>
          </>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('mapping.col.status'),
        cell: ({ row }) => <MappingStatusBadge status={row.original.mappingStatus} />,
        enableSorting: false,
      },
      {
        id: 'codes',
        header: () => t('mapping.col.codes'),
        cell: ({ row }) => (
          <span className={styles.meta}>
            {row.original.provinceCode ?? '—'} / {row.original.communeCode ?? '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'datasetVersion',
        header: () => t('mapping.col.datasetVersion'),
        cell: ({ row }) => (
          <span className={styles.meta} title={row.original.datasetVersion ?? ''}>
            {row.original.datasetVersion ?? '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'blocks',
        header: () => t('mapping.col.blocks'),
        cell: ({ row }) =>
          row.original.blocksApproval ? (
            <Badge tone="danger">{t('mapping.approval.blocked')}</Badge>
          ) : (
            <Badge tone="mint">{t('mapping.approval.clear')}</Badge>
          ),
        enableSorting: false,
      },
      {
        id: 'updatedAt',
        header: () => t('mapping.col.updatedAt'),
        cell: ({ row }) => (
          <span className={styles.meta}>{formatDateTime(row.original.updatedAt, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => t('administrative.col.actions'),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="secondary"
            data-testid={`open-${row.original.placeId}`}
            onClick={(event) => {
              event.stopPropagation()
              setOpenPlace(row.original.placeId)
            }}
          >
            {t('mapping.open')}
          </Button>
        ),
        enableSorting: false,
      },
    ],
    [locale, t],
  )

  if (!allowed) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: t('app.suffix') }]}
          title={t('administrative.mapping.title')}
        />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const counts = queue.data?.counts ?? {}

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }]}
        title={t('administrative.mapping.title')}
      />
      <PageBody>
        <div className={styles.stack}>
          <Card>
            <CardHeader
              title={t('mapping.remediation.title')}
              hint={t('mapping.remediation.hint')}
            />
            <CardBody className={styles.stack}>
              <p className={styles.notice}>
                <span aria-hidden="true">ℹ</span>
                {t('mapping.remediation.notice')}
              </p>
              <AsyncBoundary
                status={remediation.status}
                error={remediation.error}
                data={remediation.data}
                onRetry={() => void remediation.refetch()}
              >
                {(data) => (
                  <>
                    <RemediationCounts counts={data.counts} />
                    <p className={styles.meta}>
                      {t('mapping.remediation.activeVersion', {
                        version: data.activeDatasetVersion,
                      })}
                    </p>
                  </>
                )}
              </AsyncBoundary>
            </CardBody>
          </Card>

          <Card className={styles.tableCard}>
            <CardHeader
              title={t('mapping.queue.title')}
              hint={t('mapping.queue.hint')}
              actions={queue.isFetching ? <Badge tone="neutral">{t('state.loading')}</Badge> : null}
            />
            <CardBody>
              <div className={styles.toolbar}>
                <div className={styles.filters}>
                  <InlineSelect
                    label={t('mapping.filter.status')}
                    value={status}
                    onChange={(event) => setParam('status', event.target.value || null)}
                  >
                    <option value={ACTIONABLE}>{t('mapping.filter.actionable')}</option>
                    <option value="">{t('mapping.filter.all')}</option>
                    {STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {t(`mapping.status.${value}` as const)}
                      </option>
                    ))}
                  </InlineSelect>
                  <InlineSelect
                    label={t('mapping.filter.blocked')}
                    value={blockedOnly ? 'true' : ''}
                    onChange={(event) => setParam('blocked', event.target.value || null)}
                  >
                    <option value="">{t('mapping.filter.anyApproval')}</option>
                    <option value="true">{t('mapping.filter.blockedOnly')}</option>
                  </InlineSelect>
                </div>
                <ul className={styles.countList}>
                  {Object.entries(counts).map(([key, value]) => (
                    <li key={key} className={styles.countItem}>
                      <span>
                        {key === 'actionable'
                          ? t('mapping.filter.actionable')
                          : statusLabel(t, key)}
                      </span>
                      <strong className={styles.countValue}>{formatNumber(value, locale)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </CardBody>

            <AsyncBoundary
              status={queue.status}
              error={queue.error}
              data={queue.data}
              onRetry={() => void queue.refetch()}
              isEmpty={(page) => page.items.length === 0}
              empty={
                <CardBody>
                  <EmptyState
                    title={t('mapping.queue.empty')}
                    hint={
                      status === ACTIONABLE
                        ? t('mapping.queue.emptyActionable')
                        : t('mapping.queue.emptyFiltered')
                    }
                  />
                </CardBody>
              }
            >
              {(page) => (
                <>
                  <DataTable
                    data={rows}
                    columns={columns}
                    getRowId={(row) => row.placeId}
                    caption={t('mapping.queue.title')}
                    onRowClick={(row) => setOpenPlace(row.placeId)}
                    rowTone={(row) => (row.blocksApproval ? 'warning' : 'default')}
                  />
                  <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                    <p className={styles.meta}>
                      {t('mapping.queue.summary', { shown: formatNumber(rows.length, locale) })}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!cursor}
                        onClick={() => setParam('cursor', null)}
                      >
                        {t('sourceDrift.firstPage')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!page.nextCursor}
                        onClick={() => setParam('cursor', page.nextCursor)}
                      >
                        {t('action.next')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </AsyncBoundary>
          </Card>
        </div>
      </PageBody>

      <MappingDetailDrawer placeId={openPlace} onClose={() => setOpenPlace(null)} />
    </>
  )
}
