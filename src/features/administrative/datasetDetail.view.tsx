import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import type { MessageKey } from '@/shared/i18n/vi'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { newIdempotencyKey } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { formatDate, formatDateTime, formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Tabs } from '@/shared/ui/Tabs'
import { ConfirmDialog, type ChangeLine } from '@/shared/ui/Overlay'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { fetchAudit } from '@/features/audit/api'
import type {
  AdministrativeCapability,
  AdministrativeDatasetDetail,
  AdministrativeDatasetDiff,
  AdministrativeTransitionResult,
  AdministrativeValidationFinding,
} from '@/shared/api/contracts-administrative'
import {
  fetchAdministrativeCapability,
  fetchAdministrativeDataset,
  fetchAdministrativeDatasetDiff,
  fetchRestorableAdministrativeDatasets,
  publishAdministrativeDataset,
  rollbackAdministrativeDataset,
  validateAdministrativeDataset,
} from './api'
import { DatasetStatusBadge, SeverityBadge } from './datasetStatus'
import {
  publishBlock,
  rollbackBlock,
  stale,
  validateBlock,
  type ActionBlock,
} from './datasetGuards'
import { BlockedReason, Checksum, Fact, Facts } from './datasetParts'
import { DatasetDiffPanel, DiffHeader } from './datasetDiff.view'
import { styles } from './datasetDetail.style'

/** The audit vocabulary GoGo-BE writes for this resource (ADM-005). */
const AUDIT_RESOURCE = 'administrative_dataset'

type Tab = 'overview' | 'validation' | 'diff' | 'audit'

/**
 * CMS #154 — one dataset version, and the three transitions it can take.
 *
 * The screen's job in a publication is to make the decision reviewable before
 * it is taken: what is active now, what would become active, what the server's
 * own validation found, how many units move, and how many places carry a claim
 * that the move touches. None of it is a permission — GoGo-BE re-reads every
 * gate inside the publishing transaction and refuses on the first disagreement,
 * so a button offered here can still be declined there, and that is the correct
 * direction for the two to disagree in.
 */
export default function AdministrativeDatasetDetailScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { datasetId = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [tab, setTab] = useState<Tab>('overview')
  const [publishOpen, setPublishOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  /*
   * One key per decision, minted when the operator opens the confirmation and
   * kept until that decision is settled. Retrying the same publication replays
   * the original result; opening the dialog again is a different decision and
   * gets a different key. Each action holds its own — a key shared between
   * publish and rollback would make the second one return the first one's
   * answer.
   */
  const [publishKey, setPublishKey] = useState(newIdempotencyKey)
  const [rollbackKey, setRollbackKey] = useState(newIdempotencyKey)
  const [validateKey, setValidateKey] = useState(newIdempotencyKey)

  const allowed = can('administrativeDataset.read')
  const canManage = can('administrativeDataset.manage')

  const dataset = useQuery({
    queryKey: queryKeys.administrativeDataset(datasetId),
    queryFn: ({ signal }) => fetchAdministrativeDataset(datasetId, signal),
    enabled: allowed && Boolean(datasetId),
  })

  const capability = useQuery({
    queryKey: queryKeys.administrativeCapability(),
    queryFn: ({ signal }) => fetchAdministrativeCapability(signal),
    staleTime: 30_000,
    enabled: allowed,
  })

  /**
   * Counts only. `countsByCategory` and `affectedPlaces.total` are complete
   * whatever the entry limit is, so the confirmation can state the size of the
   * change without pulling a five-figure entry list nobody is going to read
   * inside a dialog.
   */
  const diffSummary = useQuery({
    queryKey: queryKeys.administrativeDatasetDiff(datasetId, 1, 0),
    queryFn: ({ signal }) =>
      fetchAdministrativeDatasetDiff(datasetId, { limit: 1, offset: 0 }, signal),
    enabled: allowed && Boolean(datasetId),
  })

  const restorable = useQuery({
    queryKey: queryKeys.administrativeRestorable(),
    queryFn: ({ signal }) => fetchRestorableAdministrativeDatasets(signal),
    enabled: allowed,
  })

  const audit = useQuery({
    queryKey: queryKeys.administrativeDatasetAudit(datasetId),
    queryFn: ({ signal }) =>
      fetchAudit({ resourceType: AUDIT_RESOURCE, resourceId: datasetId, limit: 50 }, signal),
    enabled: allowed && Boolean(datasetId) && can('audit.read'),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.administrativeAll })

  /**
   * Whether a manual retry should carry the same key or a new one.
   *
   * A domain refusal is a decision about state, and GoGo-BE releases the key
   * behind it — so pressing the button again is a new decision and gets a new
   * key. A network or 5xx failure is the opposite: the mutation may already
   * have been applied and the reply lost, and that is exactly the case the key
   * exists for, so it is kept for the retry to replay.
   */
  const settled = (error: unknown): boolean =>
    error instanceof ApiError && error.status >= 400 && error.status < 500

  /**
   * The three ways a transition can be refused for a reason the operator has to
   * read rather than retry through.
   *
   * `ACTIVE_VERSION_CHANGED`: another publication won the race, so the diff on
   * screen describes a baseline that no longer exists.
   * `DATASET_STATE_NOT_VALIDATABLE`: the lifecycle moved under the render —
   * somebody published or rolled back while this screen was open.
   * `DATASET_CHANGED_DURING_VALIDATION`: the staged snapshot moved *during* the
   * run, so the report the server computed was discarded and the validation
   * this screen was about to show never existed.
   *
   * All three refetch and none of them retries: a retry against a baseline the
   * operator has not read is the thing these codes exist to prevent.
   */
  const REFRESH_AND_EXPLAIN: Record<string, MessageKey> = {
    ACTIVE_VERSION_CHANGED: 'administrative.activeVersionChanged',
    DATASET_STATE_NOT_VALIDATABLE: 'administrative.stateNotValidatable',
    DATASET_CHANGED_DURING_VALIDATION: 'administrative.changedDuringValidation',
  }

  const onTransitionError = (error: unknown) => {
    const explained = error instanceof ApiError ? REFRESH_AND_EXPLAIN[error.code] : undefined
    if (explained) {
      invalidate()
      toast.error(t(explained))
      return
    }
    toast.error(describeError(error))
  }

  const announce = (result: AdministrativeTransitionResult, messageKey: 'publish' | 'rollback') => {
    invalidate()
    if (result.cacheWarmed) {
      toast.success(t(`administrative.${messageKey}.done`))
    } else {
      // Not a failed publication: PostgreSQL is authoritative and every other
      // process converges within the 60-second cache TTL.
      toast.push({
        tone: 'info',
        message: t(`administrative.${messageKey}.done`),
        detail: t('administrative.cacheNotWarmed'),
      })
    }
    if (result.staleMappings.total > 0) {
      toast.push({
        tone: 'info',
        message: t('administrative.staleMappings', {
          count: formatNumber(result.staleMappings.total, locale),
        }),
        detail: t('administrative.staleMappingsDetail'),
      })
    }
  }

  const runValidate = useMutation({
    mutationFn: () => validateAdministrativeDataset(datasetId, { idempotencyKey: validateKey }),
    onSuccess: (result) => {
      setValidateKey(newIdempotencyKey())
      invalidate()
      toast.success(
        t('administrative.validate.done'),
        t('administrative.errorsWarnings', {
          errors: formatNumber(result.validation.errors, locale),
          warnings: formatNumber(result.validation.warnings, locale),
        }),
      )
    },
    onError: (error) => {
      // A refused run leaves the stored report and the lifecycle exactly as
      // they were, but the screen's copy of both may now be wrong — the refusal
      // is usually *because* something moved. Refetch rather than keep showing
      // the assumption the request was built on.
      if (settled(error)) setValidateKey(newIdempotencyKey())
      onTransitionError(error)
    },
  })

  const runPublish = useMutation({
    mutationFn: () => publishAdministrativeDataset(datasetId, { idempotencyKey: publishKey }),
    onSuccess: (result) => {
      setPublishOpen(false)
      setPublishKey(newIdempotencyKey())
      announce(result, 'publish')
    },
    onError: (error) => {
      if (settled(error)) setPublishKey(newIdempotencyKey())
      onTransitionError(error)
    },
  })

  const runRollback = useMutation({
    mutationFn: () => rollbackAdministrativeDataset(datasetId, { idempotencyKey: rollbackKey }),
    onSuccess: (result) => {
      setRollbackOpen(false)
      setRollbackKey(newIdempotencyKey())
      announce(result, 'rollback')
    },
    onError: (error) => {
      if (settled(error)) setRollbackKey(newIdempotencyKey())
      onTransitionError(error)
    },
  })

  const isRestorable = useMemo(
    () => (restorable.data?.items ?? []).some((item) => item.id === datasetId),
    [restorable.data, datasetId],
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

  const detail = dataset.data
  // Nothing is decidable until the version is loaded, so the controls are inert
  // and silent rather than inert with a reason that is only "still loading".
  const blockedValidate = detail ? validateBlock(detail, { canManage, online }) : null
  const blockedPublish = detail ? publishBlock(detail, { canManage, online }) : null
  const blockedRollback = detail
    ? rollbackBlock(detail, { canManage, online, restorable: isRestorable })
    : null

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('administrative.dataset.title'), to: '/administrative-data' },
        ]}
        title={detail?.combinedDatasetVersion ?? t('administrative.dataset.title')}
        actions={
          <div className={styles.headerActions}>
            <Button
              size="sm"
              variant="secondary"
              disabled={!detail || Boolean(blockedValidate)}
              loading={runValidate.isPending}
              onClick={() => runValidate.mutate()}
            >
              {t('administrative.validate.action')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!detail || Boolean(blockedPublish)}
              onClick={() => setPublishOpen(true)}
            >
              {t('administrative.publish.action')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={!detail || Boolean(blockedRollback)}
              onClick={() => setRollbackOpen(true)}
            >
              {t('administrative.rollback.action')}
            </Button>
          </div>
        }
      />
      <PageBody>
        <AsyncBoundary
          status={dataset.status}
          error={dataset.error}
          data={dataset.data}
          onRetry={() => void dataset.refetch()}
        >
          {(data) => (
            <div className={styles.stack}>
              {/*
                Every reason a write is unavailable, stated rather than implied
                by a greyed-out button — a read-only role sees the data and the
                reason, not a screen with the controls removed. Deduplicated by
                code: on the active version publish and rollback are refused for
                the same reason, and saying it twice reads as two problems.
              */}
              {distinct([blockedValidate, blockedPublish, blockedRollback]).map((reason) => (
                <BlockedReason key={reason.code} block={reason} />
              ))}

              {stale(data) ? (
                <p className={styles.bannerDanger}>
                  <span aria-hidden="true">⚠</span>
                  {t('administrative.block.VALIDATION_STALE')}
                </p>
              ) : null}

              <Card>
                <Tabs
                  label={t('administrative.dataset.title')}
                  value={tab}
                  onChange={setTab}
                  items={[
                    { id: 'overview', label: t('administrative.tab.overview') },
                    {
                      id: 'validation',
                      label: t('administrative.tab.validation'),
                      // A "0" chip beside a tab is noise; the count is only
                      // worth a badge when there is something in the way.
                      count:
                        data.validation && data.validation.errors > 0
                          ? data.validation.errors
                          : undefined,
                    },
                    { id: 'diff', label: t('administrative.tab.diff') },
                    { id: 'audit', label: t('administrative.tab.audit') },
                  ]}
                />
                {tab === 'overview' ? <Overview data={data} capability={capability.data} /> : null}
                {tab === 'validation' ? <Validation data={data} /> : null}
                {tab === 'diff' ? (
                  <>
                    <DiffHeader />
                    <DatasetDiffPanel datasetId={datasetId} />
                  </>
                ) : null}
                {tab === 'audit' ? (
                  <>
                    <CardHeader
                      title={t('administrative.tab.audit')}
                      hint={t('administrative.audit.hint')}
                    />
                    <CardBody>
                      {can('audit.read') ? (
                        <AsyncBoundary
                          status={audit.status}
                          error={audit.error}
                          data={audit.data}
                          onRetry={() => void audit.refetch()}
                        >
                          {(page) => <AuditTrail entries={page.items} />}
                        </AsyncBoundary>
                      ) : (
                        <PermissionDeniedState />
                      )}
                    </CardBody>
                  </>
                ) : null}
              </Card>
            </div>
          )}
        </AsyncBoundary>
      </PageBody>

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => runPublish.mutate()}
        title={t('administrative.publish.confirmTitle')}
        description={t('administrative.publish.confirmBody')}
        confirmLabel={t('administrative.publish.action')}
        loading={runPublish.isPending}
        changes={transitionChanges(t, locale, detail, capability.data, diffSummary.data, 'publish')}
      />

      <ConfirmDialog
        open={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        onConfirm={() => runRollback.mutate()}
        title={t('administrative.rollback.confirmTitle')}
        description={t('administrative.rollback.confirmBody')}
        confirmLabel={t('administrative.rollback.action')}
        loading={runRollback.isPending}
        changes={transitionChanges(
          t,
          locale,
          detail,
          capability.data,
          diffSummary.data,
          'rollback',
        )}
      />
    </>
  )
}

/** One banner per distinct reason, in the order the actions appear. */
function distinct(blocks: (ActionBlock | null)[]): ActionBlock[] {
  const seen = new Set<string>()
  return blocks.filter((block): block is ActionBlock => {
    if (!block || seen.has(block.code)) return false
    seen.add(block.code)
    return true
  })
}

/**
 * What the operator is about to change, as concrete lines.
 *
 * A bare "are you sure?" is not acceptable for either of these: publication
 * swaps what every place approval in the catalogue is validated against, and
 * rollback does the same in the other direction. Both dialogs name the version
 * leaving, the version arriving, what the server's validation found, how big the
 * change is and how many places carry a claim it touches.
 */
function transitionChanges(
  t: ReturnType<typeof useT>,
  locale: 'vi' | 'en',
  detail: AdministrativeDatasetDetail | undefined,
  capability: AdministrativeCapability | undefined,
  diff: AdministrativeDatasetDiff | undefined,
  kind: 'publish' | 'rollback',
): ChangeLine[] {
  if (!detail) return []
  const lines: ChangeLine[] = [
    {
      label: t('administrative.confirm.activeVersion'),
      from: capability?.dataset.version ?? t('administrative.none'),
      to: detail.combinedDatasetVersion,
    },
    {
      label: t('administrative.confirm.effectiveDate'),
      to: formatDate(detail.effectiveDate, locale),
    },
  ]

  if (detail.validation) {
    lines.push({
      label: t('administrative.confirm.validation'),
      to: t('administrative.errorsWarnings', {
        errors: formatNumber(detail.validation.errors, locale),
        warnings: formatNumber(detail.validation.warnings, locale),
      }),
      note:
        detail.validation.warnings > 0
          ? t('administrative.confirm.warningsNote', {
              gates: detail.validation.warningGates.join(', ') || '—',
            })
          : t('administrative.confirm.errorsNote'),
    })
  } else {
    lines.push({
      label: t('administrative.confirm.validation'),
      to: t('administrative.neverValidated'),
    })
  }

  if (diff) {
    const total = Object.values(diff.countsByCategory).reduce((sum, count) => sum + count, 0)
    lines.push({
      label: t('administrative.confirm.diff'),
      to: t('administrative.confirm.diffValue', {
        changes: formatNumber(total, locale),
        categories: formatNumber(
          Object.values(diff.countsByCategory).filter((count) => count > 0).length,
          locale,
        ),
      }),
      note: t('administrative.confirm.affected', {
        count: formatNumber(diff.affectedPlaces.total, locale),
      }),
    })
  }

  if (capability) {
    lines.push({
      label: t('administrative.confirm.quarantine'),
      to: t('administrative.confirm.quarantineValue', {
        quarantined: formatNumber(capability.dataset.quarantined, locale),
        unresolved: formatNumber(capability.dataset.unresolved, locale),
      }),
    })
    lines.push({
      label: t('administrative.capability.publication'),
      to: t(`administrative.publication.${capability.publication}` as const),
    })
  }

  lines.push({
    label: t(`administrative.${kind}.consequenceLabel`),
    note: t(`administrative.${kind}.consequence`),
  })
  return lines
}

function Overview({
  data,
  capability,
}: {
  data: AdministrativeDatasetDetail
  capability: AdministrativeCapability | undefined
}) {
  const t = useT()
  const { locale } = useI18n()
  const counts = data.validationReport?.counts
  return (
    <>
      <CardHeader
        title={t('administrative.tab.overview')}
        hint={t('administrative.overview.hint')}
        actions={<DatasetStatusBadge status={data.status} />}
      />
      <CardBody className="flex flex-col gap-4">
        <Facts>
          <Fact label={t('administrative.col.version')}>
            <code className={styles.version}>{data.combinedDatasetVersion}</code>
          </Fact>
          <Fact label={t('administrative.col.checksum')}>
            <Checksum value={data.combinedChecksum} label={data.combinedDatasetVersion} />
          </Fact>
          <Fact label={t('administrative.col.effectiveDate')}>
            {formatDate(data.effectiveDate, locale)}
          </Fact>
          <Fact label={t('administrative.overrideRevision')}>
            {formatNumber(data.overrideRevision, locale)}
          </Fact>
          <Fact label={t('administrative.source.current')}>
            {data.sources.currentSourceVersion}
          </Fact>
          <Fact label={t('administrative.source.historical')}>
            {data.sources.historicalSourceVersion ?? '—'}
          </Fact>
          <Fact label={t('administrative.source.mapping')}>
            {data.sources.mappingSourceCommit ? (
              <code className={styles.version}>{data.sources.mappingSourceCommit}</code>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label={t('administrative.source.boundary')}>
            {data.sources.boundarySourceVersion ?? '—'}
          </Fact>
          <Fact label={t('administrative.col.imported')}>
            {formatDateTime(data.importedAt, locale)}
          </Fact>
          <Fact label={t('administrative.col.published')}>
            {data.publishedAt
              ? formatDateTime(data.publishedAt, locale)
              : t('administrative.never')}
          </Fact>
          {capability ? (
            <Fact label={t('administrative.capability.activeVersion')}>
              <code className={styles.version}>{capability.dataset.version ?? '—'}</code>
            </Fact>
          ) : null}
        </Facts>

        {counts ? (
          <Facts>
            <Fact label={t('administrative.counts.currentProvinces')}>
              {formatNumber(counts.currentProvinces, locale)}
            </Fact>
            <Fact label={t('administrative.counts.currentCommunes')}>
              {formatNumber(counts.currentCommunes, locale)}
            </Fact>
            <Fact label={t('administrative.counts.historicalProvinces')}>
              {formatNumber(counts.historicalProvinces, locale)}
            </Fact>
            <Fact label={t('administrative.counts.historicalDistricts')}>
              {formatNumber(counts.historicalDistricts, locale)}
            </Fact>
            <Fact label={t('administrative.counts.historicalCommunes')}>
              {formatNumber(counts.historicalCommunes, locale)}
            </Fact>
            <Fact label={t('administrative.counts.canonicalChanges')}>
              {formatNumber(counts.canonicalChanges, locale)}
            </Fact>
            <Fact label={t('administrative.counts.quarantined')}>
              {formatNumber(counts.quarantined, locale)}
            </Fact>
          </Facts>
        ) : (
          <p className={styles.meta}>{t('administrative.counts.needsValidation')}</p>
        )}

        {/*
          The stored diff describes the baseline that was active when this
          version was validated, not today's. Kept, labelled as history, and
          folded away — the Diff tab recomputes against the current active
          version, which is the one a publication would actually change.
        */}
        {data.diffSummary ? (
          <details className={styles.detailsBlock}>
            <summary className={styles.detailsSummary}>
              {t('administrative.overview.storedDiff')}
            </summary>
            <pre className={styles.pre}>{JSON.stringify(data.diffSummary, null, 2)}</pre>
          </details>
        ) : null}
      </CardBody>
    </>
  )
}

function Validation({ data }: { data: AdministrativeDatasetDetail }) {
  const t = useT()
  const { locale } = useI18n()
  const report = data.validationReport
  const summary = data.validation

  if (!report || !summary) {
    return (
      <>
        <CardHeader title={t('administrative.tab.validation')} />
        <CardBody>
          <EmptyState
            title={t('administrative.neverValidated')}
            hint={t('administrative.validate.neverHint')}
          />
        </CardBody>
      </>
    )
  }

  const errors = report.findings.filter((finding) => finding.severity === 'ERROR')
  const warnings = report.findings.filter((finding) => finding.severity === 'WARNING')

  return (
    <>
      <CardHeader
        title={t('administrative.tab.validation')}
        hint={t('administrative.validate.hint')}
        actions={
          <Badge tone={summary.publishable ? 'mint' : 'danger'}>
            {summary.publishable
              ? t('administrative.publishable')
              : t('administrative.notPublishable')}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <Facts>
          <Fact label={t('administrative.validate.ranAt')}>
            {formatDateTime(report.ranAt, locale)}
          </Fact>
          <Fact label={t('administrative.validate.validator')}>{report.validatorVersion}</Fact>
          <Fact label={t('administrative.validate.validationId')}>
            <Checksum
              value={report.validationId}
              label={t('administrative.validate.validationId')}
            />
          </Fact>
          <Fact label={t('administrative.validate.boundTo')}>
            <code className={styles.version}>{report.boundTo.combinedDatasetVersion}</code>
          </Fact>
          <Fact label={t('administrative.validate.fingerprint')}>
            <Checksum
              value={report.boundTo.snapshotFingerprint}
              label={t('administrative.validate.fingerprint')}
            />
          </Fact>
          <Fact label={t('administrative.col.validation')}>
            {t('administrative.errorsWarnings', {
              errors: formatNumber(report.errors, locale),
              warnings: formatNumber(report.warnings, locale),
            })}
          </Fact>
        </Facts>

        <p className={report.errors > 0 ? styles.bannerDanger : styles.banner}>
          <span aria-hidden="true">{report.errors > 0 ? '⚠' : 'ℹ'}</span>
          {report.errors > 0
            ? t('administrative.validate.errorsBlock')
            : t('administrative.validate.warningsDoNotBlock')}
        </p>

        <FindingGroup title={t('administrative.severity.ERROR')} findings={errors} />
        <FindingGroup title={t('administrative.severity.WARNING')} findings={warnings} />
      </CardBody>
    </>
  )
}

function FindingGroup({
  title,
  findings,
}: {
  title: string
  findings: AdministrativeValidationFinding[]
}) {
  const t = useT()
  const { locale } = useI18n()
  return (
    <section className="flex flex-col gap-2">
      <p className={styles.factLabel}>
        {title} · {formatNumber(findings.length, locale)}
      </p>
      {findings.length === 0 ? (
        <p className={styles.meta}>{t('administrative.validate.noneOfThisSeverity')}</p>
      ) : (
        <ul className={styles.findingList}>
          {findings.map((finding) => (
            <li key={`${finding.severity}-${finding.gate}`} className={styles.finding}>
              <div className={styles.findingHead}>
                <code className={styles.findingGate}>{finding.gate}</code>
                <span className="flex items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <span className={styles.meta}>
                    {t('administrative.validate.rowCount', {
                      count: formatNumber(finding.count, locale),
                    })}
                  </span>
                </span>
              </div>
              <p className={styles.findingMessage}>{finding.message}</p>
              {finding.samples.length > 0 ? (
                <ul className={styles.samples}>
                  {finding.samples.map((sample) => (
                    <li key={sample} className={styles.sample}>
                      {sample}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
