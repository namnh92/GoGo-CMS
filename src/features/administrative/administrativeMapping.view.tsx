import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Checkbox, InlineSelect } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import { useToast } from '@/shared/ui/Toast'
import { newIdempotencyKey } from '@/shared/api/client'
import type {
  AdministrativeMappingListItem,
  AdministrativeMappingStatus,
} from '@/shared/api/contracts-administrative'
import {
  fetchAdministrativeMappings,
  fetchAdministrativeRemediation,
  verifyMappingsBatch,
} from './api'
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

/**
 * What a person has something to decide about. The default view.
 *
 * `AUTO_MATCHED` belongs here and used not to. It is the resolver's proposal,
 * it blocks publication until somebody confirms it (ADR-0019 §7), and while it
 * was a rare state leaving it out cost nothing. A boundary release changes that
 * in one run: GoGo-BE#610 turned 270 unresolved places into 271 proposals, and
 * a queue defined as "needs review + stale" answered that with an empty table
 * while every one of them waited. A default view that hides the only work there
 * is, is not a default — it is a bug with a filter in front of it.
 *
 * `UNMAPPED` still stays out, for the reason it always did: there is nothing
 * for a person to decide about a place the resolver could not place. It is
 * counted, and it is one filter away.
 */
const ACTIONABLE = 'NEEDS_REVIEW,STALE,AUTO_MATCHED'

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
 * The default view is every row that blocks publication and has an answer to
 * confirm — NEEDS_REVIEW, STALE and AUTO_MATCHED. UNMAPPED places are not
 * buried by that: they are one filter away, counted in the summary, and
 * reachable through the blocked-approval view that exists precisely so a place
 * stuck on a mapping nobody can see does not sit there forever.
 */
export default function AdministrativeMappingScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { can } = useSession()

  const allowed = can('administrativeMapping.read')
  /** Deciding is the moderator's, and the batch is a pile of decisions. */
  const canReview = can('administrativeMapping.review')

  const toast = useToast()
  const queryClient = useQueryClient()
  const describeError = useErrorMessage()
  const [selected, setSelected] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  /**
   * Minted when the dialog opens: retrying one decision replays it, while
   * opening the dialog again is a new decision and gets a new key.
   */
  const [bulkKey, setBulkKey] = useState(newIdempotencyKey)

  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ACTIONABLE
  const blockedOnly = params.get('blocked') === 'true'
  const cursor = params.get('cursor')
  /*
   * PI-CMS-033 — the drawer's identity lives in the URL, so a place whose
   * blocker was met somewhere else (the editor's screen, an alert, a message)
   * can be linked to directly. local component state alone made this screen the only door.
   */
  const openPlace = params.get('place')

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // The cursor keys on the previous page, so a *filter* change invalidates
    // it. Opening a row is not a filter change: paging back to where the
    // reviewer was would be losing their place, twice over.
    if (key !== 'cursor' && key !== 'place') next.delete('cursor')
    setParams(next, { replace: true })
  }

  const setOpenPlace = (placeId: string | null) => setParam('place', placeId)

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

  /**
   * A row is selectable only when it already carries a pair to confirm.
   * UNMAPPED has none — "verify" would be asking the reviewer to agree with
   * nothing — and the server refuses it, so offering the checkbox would be
   * offering a button that cannot work.
   */
  const selectable = useMemo(
    () => rows.filter((row) => row.provinceCode && row.communeCode),
    [rows],
  )
  const selectableIds = useMemo(() => selectable.map((row) => row.placeId), [selectable])

  // A filter or a page is a different set of rows; a selection that survived
  // the change would confirm places the reviewer is no longer looking at.
  useEffect(() => setSelected([]), [scope])

  const chosen = useMemo(
    () => selectable.filter((row) => selected.includes(row.placeId)),
    [selectable, selected],
  )

  const runBulkVerify = useMutation({
    mutationFn: () =>
      verifyMappingsBatch(
        chosen.map((row) => ({
          placeId: row.placeId,
          provinceCode: row.provinceCode!,
          communeCode: row.communeCode!,
          // Per row, from the row on screen. The list is the reviewer's
          // photograph of a moment, and each row moves on its own afterwards.
          expectedUpdatedAt: row.updatedAt,
        })),
        { idempotencyKey: bulkKey },
      ),
    onSuccess: (report) => {
      setBulkOpen(false)
      setBulkKey(newIdempotencyKey())
      setSelected([])
      void queryClient.invalidateQueries({ queryKey: queryKeys.administrativeAll })
      // Never "done" when rows fell out: a batch that partly landed is the
      // normal answer, and the reviewer has to know which part.
      const clean = report.conflicts === 0 && report.refused === 0
      toast.success(
        t('mapping.bulk.done', {
          verified: formatNumber(report.verified, locale),
          requested: formatNumber(report.requested, locale),
        }),
        clean
          ? t('mapping.bulk.doneClean')
          : t('mapping.bulk.donePartial', {
              conflicts: formatNumber(report.conflicts, locale),
              refused: formatNumber(report.refused, locale),
            }),
      )
    },
    onError: (error) => {
      setBulkKey(newIdempotencyKey())
      toast.error(describeError(error))
    },
  })

  const columns = useMemo<ColumnDef<AdministrativeMappingListItem, unknown>[]>(
    () => [
      ...(canReview
        ? [
            {
              id: 'select',
              header: () => (
                <Checkbox
                  label={t('mapping.bulk.selectAll')}
                  checked={selectableIds.length > 0 && selected.length === selectableIds.length}
                  indeterminate={selected.length > 0}
                  onChange={(checked) => setSelected(checked ? selectableIds : [])}
                />
              ),
              cell: ({ row }: { row: { original: AdministrativeMappingListItem } }) =>
                row.original.provinceCode && row.original.communeCode ? (
                  <span onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      label={row.original.name}
                      checked={selected.includes(row.original.placeId)}
                      onChange={(checked) =>
                        setSelected((current) =>
                          checked
                            ? [...current, row.original.placeId]
                            : current.filter((id) => id !== row.original.placeId),
                        )
                      }
                    />
                  </span>
                ) : null,
              enableSorting: false,
            } as ColumnDef<AdministrativeMappingListItem, unknown>,
          ]
        : []),
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
    [canReview, locale, selected, selectableIds, t],
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
                  {canReview && selectableIds.length > 0 && (
                    <div className={styles.toolbar}>
                      <p className={styles.meta}>{t('mapping.bulk.hint')}</p>
                      <div className={styles.actions}>
                        <span className={styles.meta}>
                          {t('mapping.bulk.selected', {
                            count: formatNumber(selected.length, locale),
                          })}
                        </span>
                        <Button
                          size="sm"
                          disabled={selected.length === 0 || runBulkVerify.isPending}
                          onClick={() => setBulkOpen(true)}
                        >
                          {t('mapping.bulk.action', {
                            count: formatNumber(selected.length, locale),
                          })}
                        </Button>
                      </div>
                    </div>
                  )}
                  <DataTable
                    data={rows}
                    columns={columns}
                    selectedIds={selected}
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

      <ConfirmDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={() => runBulkVerify.mutate()}
        title={t('mapping.bulk.confirmTitle', { count: formatNumber(chosen.length, locale) })}
        description={t('mapping.bulk.confirmBody')}
        confirmLabel={t('mapping.bulk.action', { count: formatNumber(chosen.length, locale) })}
        loading={runBulkVerify.isPending}
        tone="primary"
        irreversible={false}
        changes={[
          {
            label: t('mapping.col.status'),
            from: t('mapping.status.AUTO_MATCHED'),
            to: t('mapping.status.VERIFIED'),
          },
          {
            label: t('mapping.bulk.selected', { count: formatNumber(chosen.length, locale) }),
            to: chosen
              .slice(0, 3)
              .map((row) => row.name)
              .join(', '),
            note: chosen.length > 3 ? '…' : undefined,
          },
        ]}
      />
      <MappingDetailDrawer placeId={openPlace} onClose={() => setOpenPlace(null)} />
    </>
  )
}
