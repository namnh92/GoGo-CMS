import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatNumber, formatPercent, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardHeader, KpiCard } from '@/shared/ui/Card'
import { Button, IconButton } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { DataTable, Pagination } from '@/shared/ui/DataTable'
import { ProgressBar } from '@/shared/ui/Progress'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { DownloadIcon, PlayIcon, PlusIcon, RetryIcon, StopIcon } from '@/shared/ui/icons'
import { isJobLive, isQuotaPaused, type ImportJobSummary } from '@/shared/api/contracts-import'
import { cancelImport, downloadErrorReport, fetchImportJobs, retryImport, startImport } from './api'
import { JobStatusBadge } from './status'
import { styles } from './importList.style'

const PAGE_SIZE = 25

export default function ImportListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()
  const [offset, setOffset] = useState(0)

  const canManage = can('import.manage')

  const query = useQuery({
    queryKey: queryKeys.imports.list(offset, PAGE_SIZE),
    queryFn: ({ signal }) => fetchImportJobs(offset, PAGE_SIZE, signal),
    // Poll while any job on the page is still moving.
    refetchInterval: (result) =>
      (result.state.data?.items ?? []).some((job) => isJobLive(job.status)) ? 3000 : false,
  })

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.imports.all })

  const start = useMutation({
    mutationFn: (jobId: string) => startImport(jobId),
    onSuccess: invalidate,
    onError: (error) => toast.error(describeError(error)),
  })
  const cancel = useMutation({
    mutationFn: (jobId: string) => cancelImport(jobId),
    onSuccess: () => {
      toast.success(t('imports.cancel'), t('imports.cancelExplain'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })
  const retry = useMutation({
    mutationFn: (jobId: string) => retryImport(jobId),
    onSuccess: invalidate,
    onError: (error) => toast.error(describeError(error)),
  })
  const report = useMutation({
    mutationFn: (job: ImportJobSummary) =>
      downloadErrorReport(job.id, `${job.sourceFileName ?? job.id}-errors.csv`),
    onError: (error) => toast.error(describeError(error)),
  })

  const jobs = useMemo(() => query.data?.items ?? [], [query.data])

  const totals = useMemo(() => {
    const rows = jobs.reduce((sum, job) => sum + job.totals.rows, 0)
    const success = jobs.reduce((sum, job) => sum + job.totals.success, 0)
    const processed = jobs.reduce((sum, job) => sum + job.totals.processed, 0)
    const pending = jobs.reduce((sum, job) => sum + job.totals.rows - job.totals.processed, 0)
    return {
      rows,
      success,
      processed,
      pending,
      successRate: processed > 0 ? success / processed : null,
    }
  }, [jobs])

  const columns = useMemo<ColumnDef<ImportJobSummary, unknown>[]>(
    () => [
      {
        id: 'job',
        header: () => t('imports.col.job'),
        cell: ({ row }) => <span className={styles.jobId}>#{row.original.id.slice(0, 8)}</span>,
        enableSorting: false,
      },
      {
        id: 'source',
        header: () => t('imports.col.source'),
        cell: ({ row }) => (
          <span className={styles.fileName} title={row.original.sourceFileName ?? ''}>
            {row.original.sourceFileName ?? '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'sourceType',
        header: () => t('imports.col.sourceType'),
        cell: ({ row }) => (
          <Badge tone="neutral">{t(`importSource.${row.original.sourceType}` as const)}</Badge>
        ),
        enableSorting: false,
      },
      {
        id: 'mode',
        header: () => t('imports.col.mode'),
        cell: ({ row }) => (
          <Badge tone={row.original.mode === 'dry_run' ? 'lavender' : 'coral'}>
            {t(`importMode.${row.original.mode}` as const)}
          </Badge>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('imports.col.status'),
        cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'progress',
        header: () => t('imports.col.progress'),
        cell: ({ row }) => {
          const { processed, rows, failed } = row.original.totals
          return (
            <ProgressBar
              value={processed}
              max={rows}
              tone={failed > 0 ? 'amber' : row.original.status === 'failed' ? 'danger' : 'coral'}
              label={t('imports.col.progress')}
              caption={t('imports.rowsProgress', {
                processed: formatNumber(processed, locale),
                rows: formatNumber(rows, locale),
              })}
            />
          )
        },
        enableSorting: false,
      },
      {
        id: 'createdAt',
        header: () => t('imports.col.createdAt'),
        cell: ({ row }) => (
          <span className={styles.meta}>
            {row.original.createdBy ?? '—'} · {formatRelative(row.original.createdAt, locale)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('imports.col.actions')}</span>,
        cell: ({ row }) => {
          const job = row.original
          const quotaPaused = isQuotaPaused(job.status)
          return (
            <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
              {quotaPaused || job.status === 'uploaded' || job.status === 'review_required' ? (
                <IconButton
                  label={quotaPaused ? t('imports.resume') : t('imports.start')}
                  disabled={!canManage || !online || job.mode === 'dry_run'}
                  onClick={() => start.mutate(job.id)}
                >
                  <PlayIcon size={15} />
                </IconButton>
              ) : null}
              {isJobLive(job.status) ? (
                <IconButton
                  label={t('imports.cancel')}
                  tone="danger"
                  disabled={!canManage || !online}
                  onClick={() => cancel.mutate(job.id)}
                >
                  <StopIcon size={15} />
                </IconButton>
              ) : null}
              {job.status === 'failed' || job.status === 'partial_success' ? (
                <IconButton
                  label={t('imports.retry')}
                  disabled={!canManage || !online}
                  onClick={() => retry.mutate(job.id)}
                >
                  <RetryIcon size={15} />
                </IconButton>
              ) : null}
              {job.totals.failed > 0 || job.totals.warnings > 0 ? (
                <IconButton label={t('imports.errorReport')} onClick={() => report.mutate(job)}>
                  <DownloadIcon size={15} />
                </IconButton>
              ) : null}
            </div>
          )
        },
        enableSorting: false,
      },
    ],
    [t, locale, canManage, online, start, cancel, retry, report],
  )

  if (!can('import.read')) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('imports.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const quotaPausedJobs = jobs.filter((job) => isQuotaPaused(job.status))

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('imports.breadcrumb') }]}
        title={t('imports.title')}
        actions={
          <Button
            size="sm"
            variant="primary"
            iconLeft={<PlusIcon size={14} />}
            disabled={!canManage || !online}
            onClick={() => navigate('/imports/new')}
          >
            {t('imports.new')}
          </Button>
        }
      />
      <PageBody>
        {quotaPausedJobs.length > 0 ? (
          <p role="status" className={styles.quotaNote}>
            <span aria-hidden="true">ℹ</span>
            <span>
              <strong className="font-semibold">{t('imports.quotaTitle')}</strong> —{' '}
              {t('imports.quotaHint')}
            </span>
          </p>
        ) : null}

        <div className={styles.kpiGrid}>
          <KpiCard
            label={t('imports.kpi.jobs')}
            value={formatNumber(jobs.length, locale)}
            sub={t('imports.kpi.jobsSub', { rows: formatNumber(totals.rows, locale) })}
          />
          <KpiCard
            label={t('imports.kpi.success')}
            value={formatPercent(totals.successRate, locale, { digits: 2 })}
            sub={t('imports.kpi.successSub')}
          />
          <KpiCard
            label={t('imports.kpi.pending')}
            value={formatNumber(totals.pending, locale)}
            sub={t('imports.kpi.pendingSub')}
          />
          <KpiCard
            label={t('imports.kpi.created')}
            value={formatNumber(totals.success, locale)}
            sub={t('imports.kpi.createdSub')}
          />
        </div>

        <Card className={styles.tableCard}>
          <CardHeader title={t('imports.table.title')} hint={t('jobDetail.liveHint')} />
          <AsyncBoundary
            status={query.status}
            error={query.error}
            data={jobs}
            isEmpty={(items) => items.length === 0}
            onRetry={() => void query.refetch()}
            empty={<EmptyState title={t('imports.empty')} hint={null} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(job) => job.id}
                  caption={t('imports.table.title')}
                  onRowClick={(job) => navigate(`/imports/${job.id}`)}
                  rowTone={(job) =>
                    job.status === 'failed'
                      ? 'danger'
                      : isQuotaPaused(job.status)
                        ? 'warning'
                        : 'default'
                  }
                />
                <Pagination
                  offset={offset}
                  limit={PAGE_SIZE}
                  hasNext={query.data?.nextOffset != null}
                  onOffsetChange={setOffset}
                  summary={t('imports.rowsProgress', {
                    processed: formatNumber(items.length, locale),
                    rows: formatNumber(totals.rows, locale),
                  })}
                />
              </>
            )}
          </AsyncBoundary>
        </Card>
      </PageBody>
    </>
  )
}
