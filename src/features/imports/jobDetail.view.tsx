import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import type { MessageKey } from '@/shared/i18n/vi'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardHeader, KpiCard, CardBody } from '@/shared/ui/Card'
import { Button, IconButton } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { InlineSelect } from '@/shared/ui/Field'
import { DataTable, Pagination } from '@/shared/ui/DataTable'
import { ProgressBar, ConfidenceMeter } from '@/shared/ui/Progress'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { DownloadIcon, MergeIcon, PlayIcon, RetryIcon, StopIcon } from '@/shared/ui/icons'
import {
  isJobLive,
  isQuotaPaused,
  type ImportRow,
  type ImportRowStatus,
} from '@/shared/api/contracts-import'
import {
  cancelImport,
  confirmCandidate,
  downloadErrorReport,
  fetchImportJob,
  fetchImportRows,
  mergeImportRow,
  publishImport,
  retryImport,
  skipImportRow,
  startImport,
} from './api'
import { JobStatusBadge, RowStatusBadge, ROW_STATUSES } from './status'
import { bucketCounts, VALIDATION_BUCKETS } from './validation'
import { CandidateDrawer } from './candidateDrawer.view'
import { styles } from './jobDetail.style'

const PAGE_SIZE = 25

/**
 * ADM-107 — the administrative identity of one import row.
 *
 * Three outcomes an operator has to be able to tell apart, so each is a
 * different sentence rather than a different shade of the same badge:
 *
 * - **matched automatically** — the resolver decided, and that is *not* a
 *   verification. The row can be imported; it cannot be published on this
 *   basis, and the line says so in words rather than leaving "AUTO_MATCHED"
 *   to be read as approval;
 * - **needs a person** — the evidence was ambiguous or disagreed with itself;
 * - **could not be placed** — nothing put it anywhere.
 *
 * Absent entirely until the row has resolved against the provider, because
 * until then there is no coordinate to classify. That reads as "not yet", not
 * as "nowhere".
 */
function blockReason(
  t: (key: MessageKey) => string,
  block: { code: string; message: string } | null | undefined,
): string {
  if (!block) return t('jobDetail.administrativeBlocks')
  const key = `mapping.block.${block.code}` as MessageKey
  const translated = t(key)
  // A code this build has no phrase for still says something, rather than
  // rendering an enum member at an operator.
  return translated === key ? block.message : translated
}

function AdministrativeCell({ row }: { row: ImportRow }) {
  const t = useT()
  const identity = row.administrative

  if (!identity || !identity.status) {
    return <span className={styles.placeMeta}>{t('jobDetail.administrativePending')}</span>
  }

  if (identity.status === 'NEEDS_REVIEW') {
    return (
      <div className={styles.reasons}>
        <Badge tone="amber">{t('jobDetail.administrativeNeedsReview')}</Badge>
      </div>
    )
  }

  if (identity.status === 'UNMAPPED' || !identity.communeCode) {
    return (
      <div className={styles.reasons}>
        <Badge tone="neutral">{t('jobDetail.administrativeUnmapped')}</Badge>
      </div>
    )
  }

  return (
    <div>
      {/* Name and code together: the name is what a person can judge, the code
          is what gets stored and quoted when something is wrong. */}
      <p className={styles.placeName}>
        {identity.communeName
          ? `${identity.communeName} (${identity.communeCode})`
          : identity.communeCode}
      </p>
      <p className={styles.placeMeta}>
        {identity.provinceName
          ? `${identity.provinceName} (${identity.provinceCode ?? '—'})`
          : (identity.provinceCode ?? '—')}
      </p>
      {/* Said in words, every time. "AUTO_MATCHED" left to speak for itself
          is the one line on this screen most likely to be read as approval. */}
      {identity.status === 'VERIFIED' ? (
        <p className={styles.placeMeta}>{t('jobDetail.administrativeVerified')}</p>
      ) : (
        <p className={styles.placeMeta}>{t('jobDetail.administrativeAuto')}</p>
      )}
      {/*
        The reason comes from the server's approval policy, not from a rule
        written here. A row matching a place a reviewer already verified does
        not block, and a screen that decided that for itself would eventually
        disagree with the publish step.
      */}
      {identity.blocksPublication ? (
        <p className={styles.placeMeta}>{blockReason(t, identity.approvalBlock)}</p>
      ) : (
        <p className={styles.placeMeta}>{t('jobDetail.administrativeClear')}</p>
      )}
    </div>
  )
}

export default function ImportJobScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { jobId = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [rowStatus, setRowStatus] = useState<ImportRowStatus | 'all'>('all')
  const [offset, setOffset] = useState(0)
  const [activeRow, setActiveRow] = useState<ImportRow | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)

  const canManage = can('import.manage')
  const canPublish = can('import.publish')

  const jobQuery = useQuery({
    queryKey: queryKeys.imports.detail(jobId),
    queryFn: ({ signal }) => fetchImportJob(jobId, signal),
    enabled: Boolean(jobId),
    refetchInterval: (result) =>
      result.state.data && isJobLive(result.state.data.status) ? 3000 : false,
  })

  const rowsQuery = useQuery({
    queryKey: queryKeys.imports.rows(jobId, rowStatus, offset),
    queryFn: ({ signal }) => fetchImportRows(jobId, rowStatus, offset, PAGE_SIZE, signal),
    enabled: Boolean(jobId),
    refetchInterval: () => (jobQuery.data && isJobLive(jobQuery.data.status) ? 3000 : false),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.imports.detail(jobId) })
    void queryClient.invalidateQueries({ queryKey: ['imports', 'rows', jobId] })
  }

  const start = useMutation({
    mutationFn: () => startImport(jobId),
    onSuccess: invalidate,
    onError: (error) => toast.error(describeError(error)),
  })
  const cancel = useMutation({
    mutationFn: () => cancelImport(jobId),
    onSuccess: () => {
      toast.success(t('imports.cancel'), t('imports.cancelExplain'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })
  const retry = useMutation({
    mutationFn: () => retryImport(jobId),
    onSuccess: invalidate,
    onError: (error) => toast.error(describeError(error)),
  })
  const confirm = useMutation({
    mutationFn: ({ rowId, googlePlaceId }: { rowId: string; googlePlaceId: string }) =>
      confirmCandidate(jobId, rowId, googlePlaceId),
    onSuccess: () => {
      toast.success(t('jobDetail.confirm'))
      setActiveRow(null)
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })
  const skip = useMutation({
    mutationFn: (rowId: string) => skipImportRow(jobId, rowId),
    onSuccess: () => {
      setActiveRow(null)
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })
  const mergeRow = useMutation({
    mutationFn: ({ rowId, placeId }: { rowId: string; placeId: string }) =>
      mergeImportRow(jobId, rowId, placeId),
    onSuccess: () => {
      toast.success(t('jobDetail.mergeRow'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })
  const publish = useMutation({
    mutationFn: () => publishImport(jobId),
    onSuccess: (result) => {
      setPublishOpen(false)
      toast.success(
        t('jobDetail.publishResult', { created: result.created, failed: result.failed.length }),
      )
      invalidate()
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
    },
    onError: (error) => toast.error(describeError(error)),
  })
  const report = useMutation({
    mutationFn: () => downloadErrorReport(jobId, `${jobId}-errors.csv`),
    onError: (error) => toast.error(describeError(error)),
  })

  const columns = useMemo<ColumnDef<ImportRow, unknown>[]>(
    () => [
      {
        id: 'row',
        header: () => t('jobDetail.col.row'),
        cell: ({ row }) => <span className={styles.rowNumber}>#{row.original.rowNumber}</span>,
        enableSorting: false,
      },
      {
        id: 'place',
        header: () => t('jobDetail.col.place'),
        cell: ({ row }) => {
          const normalized = row.original.normalized as Record<string, unknown>
          return (
            <div>
              <p className={styles.placeName}>{String(normalized.name ?? '—')}</p>
              <p className={styles.placeMeta}>
                {String(normalized.address ?? '')}{' '}
                {normalized.city ? `· ${String(normalized.city)}` : ''}
              </p>
            </div>
          )
        },
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('jobDetail.col.status'),
        cell: ({ row }) => <RowStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        /*
         * ADM-107 — which commune this row lands in.
         *
         * While the job is reviewable this is a preview from the coordinate the
         * provider returned; once the row is `imported` it is what GoGo stored.
         * Same column either way, because it is the same question and the same
         * resolver answered it — and this is the last screen where an operator
         * can still act on the answer.
         */
        id: 'administrative',
        header: () => t('jobDetail.col.administrative'),
        cell: ({ row }) => <AdministrativeCell row={row.original} />,
        enableSorting: false,
      },
      {
        id: 'confidence',
        header: () => t('jobDetail.col.confidence'),
        cell: ({ row }) =>
          row.original.matchConfidence != null ? (
            <ConfidenceMeter
              value={row.original.matchConfidence}
              label={t('jobDetail.col.confidence')}
            />
          ) : (
            <span className="text-[12px] text-text-subtle">—</span>
          ),
        enableSorting: false,
      },
      {
        id: 'reasons',
        header: () => t('jobDetail.col.reasons'),
        cell: ({ row }) => (
          <div className={styles.reasons}>
            {row.original.matchReasons.map((reason) => (
              <span key={reason} className={styles.reason}>
                {reason}
              </span>
            ))}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'messages',
        header: () => t('jobDetail.col.messages'),
        cell: ({ row }) => (
          <div className={styles.messages}>
            {row.original.errors.map((message, index) => (
              <span key={`e${index}`} className={styles.errorMsg}>
                {/*
                  PI-CMS-009 — the code beside the sentence. The message is what
                  an operator acts on; the code is what they quote in a ticket,
                  and `PLACE_ID_URL_MISMATCH` means nothing if the screen only
                  ever showed the prose.
                */}
                ⚠ <span className={styles.errorCode}>{message.code}</span> {message.message ?? ''}
              </span>
            ))}
            {row.original.warnings.map((message, index) => (
              <span key={`w${index}`} className={styles.warnMsg}>
                • {message.message ?? message.code}
              </span>
            ))}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('jobDetail.col.actions')}</span>,
        cell: ({ row }) => {
          const item = row.original
          return (
            <div className={styles.actions}>
              {item.status === 'needs_confirmation' ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canManage || !online}
                  onClick={() => setActiveRow(item)}
                >
                  {t('jobDetail.confirm')}
                </Button>
              ) : null}
              {item.status === 'duplicate' && item.matchedPlaceId ? (
                <IconButton
                  label={t('jobDetail.mergeRow')}
                  disabled={!canManage || !online}
                  onClick={() =>
                    mergeRow.mutate({ rowId: item.id, placeId: item.matchedPlaceId as string })
                  }
                >
                  <MergeIcon size={15} />
                </IconButton>
              ) : null}
              {item.status !== 'imported' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canManage || !online}
                  onClick={() => skip.mutate(item.id)}
                >
                  {t('jobDetail.skipRow')}
                </Button>
              ) : null}
            </div>
          )
        },
        enableSorting: false,
      },
    ],
    [t, canManage, online, mergeRow, skip],
  )

  if (!can('import.read')) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: t('imports.breadcrumb'), to: '/imports' }]}
          title={t('jobDetail.summary')}
        />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const job = jobQuery.data
  const readyCount = job?.rowsByStatus.ready ?? 0

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('imports.breadcrumb'), to: '/imports' },
          { label: `#${jobId.slice(0, 8)}` },
        ]}
        title={job?.sourceFileName ?? t('jobDetail.breadcrumb')}
        showSearch={false}
        actions={
          <div className={styles.headerActions}>
            {job &&
            (isQuotaPaused(job.status) ||
              job.status === 'uploaded' ||
              job.status === 'review_required') ? (
              <Button
                size="sm"
                variant="secondary"
                iconLeft={<PlayIcon size={14} />}
                disabled={!canManage || !online || job.mode === 'dry_run'}
                loading={start.isPending}
                onClick={() => start.mutate()}
              >
                {isQuotaPaused(job.status) ? t('imports.resume') : t('imports.start')}
              </Button>
            ) : null}
            {job && isJobLive(job.status) ? (
              <Button
                size="sm"
                variant="danger"
                iconLeft={<StopIcon size={14} />}
                disabled={!canManage || !online}
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {t('imports.cancel')}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<RetryIcon size={14} />}
              disabled={!canManage || !online}
              loading={retry.isPending}
              onClick={() => retry.mutate()}
            >
              {t('imports.retry')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<DownloadIcon size={14} />}
              loading={report.isPending}
              onClick={() => report.mutate()}
            >
              {t('imports.errorReport')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!canPublish || !online || readyCount === 0}
              onClick={() => setPublishOpen(true)}
            >
              {t('imports.publish')}
            </Button>
          </div>
        }
      />
      <PageBody>
        <AsyncBoundary
          status={jobQuery.status}
          error={jobQuery.error}
          data={job}
          onRetry={() => void jobQuery.refetch()}
        >
          {(detail) => (
            <>
              {isQuotaPaused(detail.status) ? (
                <p role="status" className={styles.quota}>
                  <span aria-hidden="true">ℹ</span>
                  <span>
                    <strong className="font-semibold">{t('imports.quotaTitle')}</strong> —{' '}
                    {t('imports.quotaHint')}
                  </span>
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <JobStatusBadge status={detail.status} />
                <Badge tone={detail.mode === 'dry_run' ? 'lavender' : 'coral'}>
                  {t(`importMode.${detail.mode}` as const)}
                </Badge>
                <Badge tone="neutral">{t(`importSource.${detail.sourceType}` as const)}</Badge>
                {detail.defaultCity ? <Badge tone="neutral">{detail.defaultCity}</Badge> : null}
                <span className="text-[11px] text-text-subtle">
                  {formatRelative(detail.createdAt, locale)}
                </span>
              </div>

              <div className={styles.summaryGrid}>
                <KpiCard
                  label={t('jobDetail.totals.rows')}
                  value={formatNumber(detail.totals.rows, locale)}
                />
                <KpiCard
                  label={t('jobDetail.totals.processed')}
                  value={formatNumber(detail.totals.processed, locale)}
                />
                <KpiCard
                  label={t('jobDetail.totals.success')}
                  value={formatNumber(detail.totals.success, locale)}
                  tone="positive"
                />
                <KpiCard
                  label={t('jobDetail.totals.warnings')}
                  value={formatNumber(detail.totals.warnings, locale)}
                />
                <KpiCard
                  label={t('jobDetail.totals.failed')}
                  value={formatNumber(detail.totals.failed, locale)}
                  tone={detail.totals.failed > 0 ? 'negative' : 'neutral'}
                />
              </div>

              {(() => {
                const { buckets, inFlight, counted } = bucketCounts(detail.rowsByStatus)
                // Nothing to roll up before the server has classified a row —
                // four zeroes would read as "clean file", which is a lie.
                if (counted === 0) return null
                return (
                  <Card>
                    <CardHeader
                      title={t('jobDetail.validation.title')}
                      hint={t('jobDetail.validation.hint')}
                    />
                    <div className={styles.validationGrid}>
                      {VALIDATION_BUCKETS.map((bucket) => (
                        <KpiCard
                          key={bucket}
                          label={t(`jobDetail.validation.${bucket}` as const)}
                          value={formatNumber(buckets[bucket], locale)}
                          // The label names the bucket and the sub-line names
                          // the statuses inside it, so the meaning never rests
                          // on the tone alone.
                          sub={t(`jobDetail.validation.${bucket}Hint` as const)}
                          tone={
                            bucket === 'valid'
                              ? 'positive'
                              : bucket === 'error' && buckets.error > 0
                                ? 'negative'
                                : 'neutral'
                          }
                        />
                      ))}
                    </div>
                    <p className={styles.validationFoot}>
                      {t('jobDetail.validation.scope', {
                        counted: formatNumber(counted, locale),
                        inFlight: formatNumber(inFlight, locale),
                      })}
                    </p>
                  </Card>
                )
              })()}

              <Card>
                <CardHeader
                  title={t('jobDetail.summary')}
                  hint={isJobLive(detail.status) ? t('jobDetail.liveHint') : undefined}
                />
                <div className="px-5 py-4">
                  <ProgressBar
                    value={detail.totals.processed}
                    max={detail.totals.rows}
                    tone={detail.totals.failed > 0 ? 'amber' : 'coral'}
                    label={t('imports.col.progress')}
                    caption={t('imports.rowsProgress', {
                      processed: formatNumber(detail.totals.processed, locale),
                      rows: formatNumber(detail.totals.rows, locale),
                    })}
                  />
                  {detail.missingRequiredColumns.length > 0 ? (
                    <div className="mt-3">
                      <p className="mb-1 text-[11px] font-semibold text-text-muted">
                        {t('jobDetail.missingRequiredColumns')}
                      </p>
                      <div className={styles.unmapped}>
                        {detail.missingRequiredColumns.map((column) => (
                          <span key={column} className={styles.missingChip}>
                            {column}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {detail.unmappedHeaders.length > 0 ? (
                    <div className="mt-3">
                      <p className="mb-1 text-[11px] font-semibold text-text-muted">
                        {t('jobDetail.unmappedHeaders')}
                      </p>
                      <div className={styles.unmapped}>
                        {detail.unmappedHeaders.map((header) => (
                          <span key={header} className={styles.unmappedChip}>
                            {header}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>

              {/*
                PI-CMS-009 — three sources, named.
                
                The rows table mixes values that came from three places and
                looked identical in every column: what the file said, what
                Google answered, and what GoGo worked out from the coordinate.
                An operator reading a wrong address had no way to tell whether
                to fix their sheet, re-check the link, or raise a mapping issue.
              */}
              <Card>
                <CardHeader title={t('jobDetail.sources')} hint={t('jobDetail.sourcesHint')} />
                <CardBody>
                  <dl className={styles.sourceLegend}>
                    <div>
                      <dt className={styles.sourceTerm}>{t('jobDetail.sourceFile')}</dt>
                      <dd className={styles.sourceList}>{t('jobDetail.sourceFileFields')}</dd>
                    </div>
                    <div>
                      <dt className={styles.sourceTerm}>{t('jobDetail.sourceGoogle')}</dt>
                      <dd className={styles.sourceList}>{t('jobDetail.sourceGoogleFields')}</dd>
                    </div>
                    <div>
                      <dt className={styles.sourceTerm}>{t('jobDetail.sourceDerived')}</dt>
                      <dd className={styles.sourceList}>{t('jobDetail.sourceDerivedFields')}</dd>
                    </div>
                  </dl>
                  <p className={styles.sourceNote}>{t('jobDetail.sourceReadOnly')}</p>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title={t('jobDetail.rows')}
                  hint={t('jobDetail.rowsHint')}
                  actions={
                    <div className={styles.filterRow}>
                      <InlineSelect
                        label={t('jobDetail.col.status')}
                        value={rowStatus}
                        onChange={(event) => {
                          setRowStatus(event.target.value as ImportRowStatus | 'all')
                          setOffset(0)
                        }}
                      >
                        <option value="all">{t('places.tab.all')}</option>
                        {ROW_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {t(`rowStatus.${status}` as const)}
                            {detail.rowsByStatus[status] ? ` (${detail.rowsByStatus[status]})` : ''}
                          </option>
                        ))}
                      </InlineSelect>
                    </div>
                  }
                />
                <AsyncBoundary
                  status={rowsQuery.status}
                  error={rowsQuery.error}
                  data={rowsQuery.data?.items ?? []}
                  isEmpty={(items) => items.length === 0}
                  onRetry={() => void rowsQuery.refetch()}
                  empty={<EmptyState />}
                >
                  {(rows) => (
                    <>
                      <DataTable
                        data={rows}
                        columns={columns}
                        getRowId={(row) => row.id}
                        caption={t('jobDetail.rows')}
                        rowTone={(row) =>
                          row.status === 'validation_failed' ||
                          row.status === 'failed' ||
                          row.status === 'unresolved'
                            ? 'danger'
                            : row.status === 'needs_confirmation' || row.status === 'duplicate'
                              ? 'warning'
                              : 'default'
                        }
                      />
                      <Pagination
                        offset={offset}
                        limit={PAGE_SIZE}
                        hasNext={rowsQuery.data?.nextOffset != null}
                        onOffsetChange={setOffset}
                        summary={t('imports.rowsProgress', {
                          processed: formatNumber(rows.length, locale),
                          rows: formatNumber(detail.totals.rows, locale),
                        })}
                      />
                    </>
                  )}
                </AsyncBoundary>
              </Card>
            </>
          )}
        </AsyncBoundary>
      </PageBody>

      <CandidateDrawer
        row={activeRow}
        open={activeRow !== null}
        onClose={() => setActiveRow(null)}
        pending={confirm.isPending || skip.isPending}
        canDecide={canManage && online}
        onConfirm={(googlePlaceId) =>
          activeRow && confirm.mutate({ rowId: activeRow.id, googlePlaceId })
        }
        onSkip={() => activeRow && skip.mutate(activeRow.id)}
      />

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => publish.mutate()}
        title={t('jobDetail.publishPreviewTitle')}
        description={t('jobDetail.publishPreviewHint')}
        tone="primary"
        loading={publish.isPending}
        changes={[
          {
            label: t('rowStatus.ready'),
            to: t('jobDetail.publishSelected', { count: readyCount }),
            note: t(`importMode.${job?.mode ?? 'dry_run'}Hint` as const),
          },
          {
            label: t('imports.col.mode'),
            to: t(`importMode.${job?.mode ?? 'dry_run'}` as const),
          },
        ]}
        confirmLabel={t('imports.publish')}
      />
    </>
  )
}
