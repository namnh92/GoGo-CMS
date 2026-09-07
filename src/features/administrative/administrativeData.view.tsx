import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { newIdempotencyKey } from '@/shared/api/client'
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/Field'
import { DataTable, Pagination } from '@/shared/ui/DataTable'
import { Modal } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { PlusIcon } from '@/shared/ui/icons'
import type { AdministrativeDatasetSummary } from '@/shared/api/contracts-administrative'
import {
  fetchAdministrativeCapability,
  fetchAdministrativeDatasets,
  importAdministrativeDataset,
} from './api'
import { DatasetStatusBadge } from './datasetStatus'
import { importBlock } from './datasetGuards'
import { BlockedReason, CapabilityPanel, Checksum } from './datasetParts'
import { styles } from './administrativeData.style'

const PAGE_SIZE = 25

/**
 * CMS #154 — administrative dataset operations.
 *
 * The screen is deliberately two things at once: what this environment can
 * currently do, and every version it has ever imported. They belong together
 * because the first is a consequence of the second — "no place can be approved"
 * and "no version is PUBLISHED" are the same fact seen from two ends, and an
 * operator who sees only one of them goes looking for an outage.
 *
 * Nothing here decides whether a publication is allowed. `publishable` is the
 * server's own result, rendered; the buttons only decline to offer what is
 * already known to fail, and the server re-derives all of it inside the
 * transaction regardless.
 */
export default function AdministrativeDataScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [offset, setOffset] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  const [overrideRevision, setOverrideRevision] = useState('0')
  /**
   * Minted when the dialog opens, not when the request is sent. Retrying the
   * same decision replays the original import instead of creating a second
   * version; opening the dialog again is a new decision and gets a new key.
   */
  const [importKey, setImportKey] = useState(newIdempotencyKey)

  const allowed = can('administrativeDataset.read')
  const canManage = can('administrativeDataset.manage')

  const capability = useQuery({
    queryKey: queryKeys.administrativeCapability(),
    queryFn: ({ signal }) => fetchAdministrativeCapability(signal),
    staleTime: 30_000,
    // No request at all without permission: hiding the screen is not the point,
    // not asking is.
    enabled: allowed,
  })

  const datasets = useQuery({
    queryKey: queryKeys.administrativeDatasets(PAGE_SIZE, offset),
    queryFn: ({ signal }) => fetchAdministrativeDatasets({ limit: PAGE_SIZE, offset }, signal),
    enabled: allowed,
  })

  const runImport = useMutation({
    mutationFn: () =>
      importAdministrativeDataset(Number(overrideRevision) || 0, { idempotencyKey: importKey }),
    onSuccess: (report) => {
      setImportOpen(false)
      // A new decision needs a new key; the old one now belongs to a version
      // that exists.
      setImportKey(newIdempotencyKey())
      toast.success(
        t('administrative.import.done'),
        t('administrative.import.doneDetail', { version: report.combinedDatasetVersion }),
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.administrativeAll })
      navigate(`/administrative-data/${report.datasetVersionId}`)
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const blockedImport = importBlock({ canManage, online })

  const rows = useMemo(() => datasets.data?.items ?? [], [datasets.data])

  const columns = useMemo<ColumnDef<AdministrativeDatasetSummary, unknown>[]>(
    () => [
      {
        id: 'version',
        header: () => t('administrative.col.version'),
        // No "active" tag here: the status column sits next to it and already
        // says so, with a glyph. Twice reads as two different facts.
        cell: ({ row }) => (
          <span className={styles.rowVersion} title={row.original.combinedDatasetVersion}>
            {row.original.combinedDatasetVersion}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('administrative.col.status'),
        cell: ({ row }) => <DatasetStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'effectiveDate',
        header: () => t('administrative.col.effectiveDate'),
        cell: ({ row }) => (
          <span className={styles.rowMeta}>{formatDate(row.original.effectiveDate, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'sources',
        header: () => t('administrative.col.sources'),
        cell: ({ row }) => (
          <span className={styles.rowMeta}>
            {row.original.sources.currentSourceVersion}
            {row.original.sources.mappingSourceCommit
              ? ` · ${row.original.sources.mappingSourceCommit.slice(0, 8)}`
              : ''}
            {row.original.overrideRevision > 0
              ? ` · r${formatNumber(row.original.overrideRevision, locale)}`
              : ''}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'checksum',
        header: () => t('administrative.col.checksum'),
        cell: ({ row }) => (
          <Checksum
            value={row.original.combinedChecksum}
            label={row.original.combinedDatasetVersion}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'validation',
        header: () => t('administrative.col.validation'),
        cell: ({ row }) => {
          const validation = row.original.validation
          if (!validation) {
            return <Badge tone="neutral">{t('administrative.neverValidated')}</Badge>
          }
          return (
            <span className={styles.rowMeta}>
              <Badge tone={validation.publishable ? 'mint' : 'danger'}>
                {validation.publishable
                  ? t('administrative.publishable')
                  : t('administrative.notPublishable')}
              </Badge>{' '}
              {t('administrative.errorsWarnings', {
                errors: formatNumber(validation.errors, locale),
                warnings: formatNumber(validation.warnings, locale),
              })}
            </span>
          )
        },
        enableSorting: false,
      },
      {
        id: 'importedAt',
        header: () => t('administrative.col.imported'),
        cell: ({ row }) => (
          <span className={styles.rowMeta} title={formatDateTime(row.original.importedAt, locale)}>
            {formatRelative(row.original.importedAt, locale)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'publishedAt',
        header: () => t('administrative.col.published'),
        cell: ({ row }) => (
          <span className={styles.rowMeta} title={formatDateTime(row.original.publishedAt, locale)}>
            {row.original.publishedAt ? formatRelative(row.original.publishedAt, locale) : '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => t('administrative.col.actions'),
        cell: ({ row }) => (
          <span className={styles.actions}>
            <Button
              size="sm"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation()
                navigate(`/administrative-data/${row.original.id}`)
              }}
            >
              {t('administrative.openDetail')}
            </Button>
          </span>
        ),
        enableSorting: false,
      },
    ],
    [locale, navigate, t],
  )

  if (!allowed) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: t('app.suffix') }]}
          title={t('administrative.dataset.title')}
        />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const total = datasets.data?.total ?? 0

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }]}
        title={t('administrative.dataset.title')}
        actions={
          <Button
            variant="primary"
            iconLeft={<PlusIcon size={14} />}
            disabled={Boolean(blockedImport)}
            onClick={() => setImportOpen(true)}
          >
            {t('administrative.import.action')}
          </Button>
        }
      />
      <PageBody>
        <div className={styles.stack}>
          <Card>
            <CardHeader
              title={t('administrative.capability.title')}
              hint={t('administrative.dataset.subtitle')}
            />
            <CardBody>
              <AsyncBoundary
                status={capability.status}
                error={capability.error}
                data={capability.data}
                onRetry={() => void capability.refetch()}
              >
                {(data) => <CapabilityPanel capability={data} />}
              </AsyncBoundary>
            </CardBody>
          </Card>

          <BlockedReason block={blockedImport} />

          <Card className={styles.tableCard}>
            <CardHeader
              title={t('administrative.list.title')}
              hint={t('administrative.list.hint')}
              actions={
                datasets.isFetching ? <Badge tone="neutral">{t('state.loading')}</Badge> : null
              }
            />
            <AsyncBoundary
              status={datasets.status}
              error={datasets.error}
              data={datasets.data}
              onRetry={() => void datasets.refetch()}
              isEmpty={(page) => page.items.length === 0}
              empty={
                <CardBody>
                  <EmptyState
                    title={t('administrative.list.empty')}
                    hint={t('administrative.list.emptyHint')}
                  />
                </CardBody>
              }
            >
              {() => (
                <>
                  <DataTable
                    data={rows}
                    columns={columns}
                    getRowId={(row) => row.id}
                    caption={t('administrative.list.title')}
                    onRowClick={(row) => navigate(`/administrative-data/${row.id}`)}
                    rowTone={(row) =>
                      row.validation && !row.validation.publishable ? 'warning' : 'default'
                    }
                  />
                  <Pagination
                    offset={offset}
                    limit={PAGE_SIZE}
                    total={total}
                    hasNext={offset + PAGE_SIZE < total}
                    onOffsetChange={setOffset}
                    summary={t('administrative.list.summary', {
                      shown: formatNumber(rows.length, locale),
                      total: formatNumber(total, locale),
                    })}
                  />
                </>
              )}
            </AsyncBoundary>
          </Card>
        </div>
      </PageBody>

      {/*
        Import takes no file. GoGo-BE imports the snapshot set pinned in its own
        manifest, verified by checksum — there is nothing here for an operator to
        upload, and a file picker would be a lie about where the data comes from.
      */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('administrative.import.title')}
        description={t('administrative.import.body')}
        footer={
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => setImportOpen(false)}
              disabled={runImport.isPending}
            >
              {t('action.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={runImport.isPending}
              disabled={Boolean(blockedImport)}
              onClick={() => runImport.mutate()}
            >
              {t('administrative.import.confirm')}
            </Button>
          </div>
        }
      >
        <div className={styles.stack}>
          <p className={styles.rowMeta}>{t('administrative.import.stagedOnly')}</p>
          <TextInput
            label={t('administrative.import.overrideRevision')}
            hint={t('administrative.import.overrideRevisionHint')}
            type="number"
            min={0}
            max={10000}
            value={overrideRevision}
            onChange={(event) => setOverrideRevision(event.target.value)}
          />
          {capability.data ? (
            <p className={styles.rowMeta}>
              {t('administrative.import.currentActive', {
                version: capability.data.dataset.version ?? '—',
              })}
            </p>
          ) : null}
          <BlockedReason block={blockedImport} />
        </div>
      </Modal>
    </>
  )
}
