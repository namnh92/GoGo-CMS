import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { newIdempotencyKey } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { formatDateTime, formatNumber } from '@/shared/format'
import { CardBody, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { InlineSelect, TextArea } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import { ConfirmDialog, Modal } from '@/shared/ui/Overlay'
import { AsyncBoundary, EmptyState, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import type {
  AdministrativeDecisionState,
  AdministrativeMaterializeResult,
  AdministrativeQuarantineItem,
} from '@/shared/api/contracts-administrative'
import {
  abandonOverrideSet,
  fetchAdministrativeQuarantine,
  fetchOverrideSet,
  materializeOverrideSet,
} from './api'
import { QuarantineDetailDrawer } from './quarantineDetail.view'
import {
  ClassificationBadge,
  CountGroups,
  DecisionStateBadge,
  Fact,
  Facts,
  Identity,
  OverrideSetBadge,
} from './sourceDriftParts'
import { styles } from './sourceDrift.style'

const PAGE_SIZE = 25

const DECISION_STATES: AdministrativeDecisionState[] = [
  'UNDECIDED',
  'ACCEPTED_DRAFT',
  'REJECTED_DRAFT',
  'SUPERSEDED',
]

/** The quarantine classes the contract declares. Promoted classes never appear here. */
const CLASSIFICATIONS = [
  'DIVIDED_REQUIRES_REVIEW',
  'TARGET_NOT_FOUND',
  'SOURCE_NOT_FOUND',
  'MULTIPLE_TARGETS',
  'HIERARCHY_CONFLICT',
  'DUPLICATE',
  'INVALID',
] as const

/**
 * CMS #155 — the source-drift review queue for one dataset version.
 *
 * The advisory mapping upstream says 471 communes were divided and offers a
 * default successor for each of the 1,033 resulting edges. ADR-0019 forbids
 * trusting that default, so the importer quarantines them and this is where a
 * person works through them.
 *
 * The one thing the screen must never let a reviewer believe is that a decision
 * has taken effect. It has not: decisions accumulate in a draft set, and only
 * materialising them — then validating, then publishing the derived version —
 * changes what the API answers. That sequence is stated on the panel, in the
 * confirmations, and in the toast after every decision.
 */
export function SourceDriftPanel({ datasetId }: { datasetId: string }) {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canManage = can('administrativeDataset.manage')

  /*
   * Filters and the cursor live in the URL. A reviewer working a 1,033-row
   * backlog shares "the rows I am stuck on", and a queue position that exists
   * only in component state cannot be handed to anybody.
   */
  const [params, setParams] = useSearchParams()
  const classification = params.get('class') ?? ''
  const decisionState = params.get('state') ?? 'UNDECIDED'
  const cursor = params.get('cursor')

  const [openRow, setOpenRow] = useState<string | null>(null)
  const [materializeOpen, setMaterializeOpen] = useState(false)
  const [abandonOpen, setAbandonOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [materializeKey, setMaterializeKey] = useState(newIdempotencyKey)
  const [abandonKey, setAbandonKey] = useState(newIdempotencyKey)
  const [derived, setDerived] = useState<AdministrativeMaterializeResult | null>(null)

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Any filter change invalidates the cursor: it keys on the previous page.
    if (key !== 'cursor') next.delete('cursor')
    setParams(next, { replace: true })
  }

  const scope = `${classification}|${decisionState}|${cursor ?? ''}`
  const queue = useQuery({
    queryKey: queryKeys.administrativeQuarantine(datasetId, scope),
    queryFn: ({ signal }) =>
      fetchAdministrativeQuarantine(
        datasetId,
        {
          classification: classification ? [classification] : undefined,
          decisionState: decisionState ? [decisionState as AdministrativeDecisionState] : undefined,
          limit: PAGE_SIZE,
          cursor,
        },
        signal,
      ),
  })

  const overrideSet = useQuery({
    queryKey: queryKeys.administrativeOverrideSet(datasetId),
    queryFn: ({ signal }) => fetchOverrideSet(datasetId, signal),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.administrativeAll })

  const settled = (error: unknown) =>
    error instanceof ApiError && error.status >= 400 && error.status < 500

  const onSetError = (error: unknown) => {
    if (settled(error)) {
      setMaterializeKey(newIdempotencyKey())
      setAbandonKey(newIdempotencyKey())
    }
    if (error instanceof ApiError && error.code === 'OVERRIDE_SET_REVISION_CONFLICT') {
      invalidate()
      toast.error(t('sourceDrift.conflict.revision'))
      return
    }
    if (
      error instanceof ApiError &&
      ['BASE_DATASET_CHANGED', 'OVERRIDE_SET_NOT_DRAFT', 'OVERRIDE_SET_NOT_FOUND'].includes(
        error.code,
      )
    ) {
      invalidate()
      toast.error(t('sourceDrift.conflict.lifecycle'))
      return
    }
    toast.error(describeError(error))
  }

  const draft = overrideSet.data?.draft ?? null
  const revision = draft?.revision ?? 0
  const decisions = overrideSet.data?.counts.decisions ?? {}
  const accepted = decisions.ACCEPTED_DRAFT ?? 0
  const rejected = decisions.REJECTED_DRAFT ?? 0
  const undecided = decisions.UNDECIDED ?? 0
  const effective = accepted + rejected

  const runMaterialize = useMutation({
    mutationFn: () =>
      materializeOverrideSet(
        datasetId,
        { reason: reason.trim(), expectedRevision: revision },
        { idempotencyKey: materializeKey },
      ),
    onSuccess: (result) => {
      setMaterializeOpen(false)
      setMaterializeKey(newIdempotencyKey())
      setReason('')
      setDerived(result)
      invalidate()
    },
    onError: onSetError,
  })

  const runAbandon = useMutation({
    mutationFn: () =>
      abandonOverrideSet(
        datasetId,
        { reason: reason.trim(), expectedRevision: revision },
        { idempotencyKey: abandonKey },
      ),
    onSuccess: () => {
      setAbandonOpen(false)
      setAbandonKey(newIdempotencyKey())
      setReason('')
      invalidate()
      toast.success(t('sourceDrift.abandon.done'), t('sourceDrift.abandon.doneDetail'))
    },
    onError: onSetError,
  })

  const rows = useMemo(() => queue.data?.items ?? [], [queue.data])

  const columns = useMemo<ColumnDef<AdministrativeQuarantineItem, unknown>[]>(
    () => [
      {
        id: 'source',
        header: () => t('sourceDrift.col.source'),
        cell: ({ row }) => (
          <Identity
            unit={{
              code: row.original.source.code ?? null,
              name: row.original.source.name ?? null,
              unitType: null,
              level: null,
              effectiveFrom: null,
              effectiveTo: null,
              parentCode: null,
              status: null,
            }}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'proposed',
        header: () => t('sourceDrift.col.proposed'),
        cell: ({ row }) => (
          <span className={styles.meta}>
            {row.original.proposedTarget.code ?? '—'}
            {row.original.proposedTarget.name ? ` · ${row.original.proposedTarget.name}` : ''}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'classification',
        header: () => t('sourceDrift.col.classification'),
        cell: ({ row }) => <ClassificationBadge value={row.original.classification} />,
        enableSorting: false,
      },
      {
        id: 'decision',
        header: () => t('sourceDrift.col.decisionState'),
        cell: ({ row }) => <DecisionStateBadge state={row.original.decisionState} />,
        enableSorting: false,
      },
      {
        id: 'evidence',
        header: () => t('sourceDrift.col.evidence'),
        cell: ({ row }) => (
          <span className={styles.meta}>
            {row.original.upstreamFlags.isDividedWard === true
              ? t('sourceDrift.evidence.divided')
              : row.original.upstreamFlags.isMergedWard === true
                ? t('sourceDrift.evidence.merged')
                : '—'}
            {' · '}
            {t('sourceDrift.evidence.candidates', {
              count: formatNumber(row.original.candidateCount, locale),
            })}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'affected',
        header: () => t('sourceDrift.col.affected'),
        cell: ({ row }) => (
          <span className={styles.meta}>
            {formatNumber(row.original.affectedPlaceCount, locale)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'decidedAt',
        header: () => t('sourceDrift.col.decidedAt'),
        cell: ({ row }) => (
          <span className={styles.meta}>
            {row.original.decidedAt ? formatDateTime(row.original.decidedAt, locale) : '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => t('administrative.col.actions'),
        cell: ({ row }) => (
          <Button size="sm" variant="secondary" onClick={() => setOpenRow(row.original.id)}>
            {t('sourceDrift.open')}
          </Button>
        ),
        enableSorting: false,
      },
    ],
    [locale, t],
  )

  return (
    <>
      <CardHeader title={t('sourceDrift.title')} hint={t('sourceDrift.hint')} />
      <CardBody className={styles.stack}>
        <p className={styles.notice}>
          <span aria-hidden="true">ℹ</span>
          {t('sourceDrift.draftOnly')}
        </p>

        <AsyncBoundary
          status={overrideSet.status}
          error={overrideSet.error}
          data={overrideSet.data}
          onRetry={() => void overrideSet.refetch()}
        >
          {(data) => (
            <div className={styles.stack}>
              <CountGroups counts={data.counts} />

              <section className={styles.section}>
                <p className={styles.factLabel}>{t('sourceDrift.set.title')}</p>
                <Facts>
                  <Fact label={t('sourceDrift.set.status')}>
                    <OverrideSetBadge status={data.draft ? data.draft.status : 'NONE'} />
                  </Fact>
                  <Fact label={t('sourceDrift.set.revision')}>
                    {data.draft ? formatNumber(data.draft.revision, locale) : '—'}
                  </Fact>
                  <Fact label={t('sourceDrift.set.effective')}>
                    {t('sourceDrift.set.effectiveValue', {
                      accepted: formatNumber(accepted, locale),
                      rejected: formatNumber(rejected, locale),
                      undecided: formatNumber(undecided, locale),
                    })}
                  </Fact>
                  <Fact label={t('sourceDrift.set.updatedAt')}>
                    {data.draft ? formatDateTime(data.draft.updatedAt, locale) : '—'}
                  </Fact>
                </Facts>

                {data.materialized.length > 0 ? (
                  <div>
                    <p className={styles.factLabel}>{t('sourceDrift.set.materialized')}</p>
                    <ul className={styles.countList}>
                      {data.materialized.map((set) => (
                        <li key={set.id} className={styles.countItem}>
                          {set.datasetVersionId ? (
                            <Link to={`/administrative-data/${set.datasetVersionId}`}>
                              {t('sourceDrift.set.openDerived')}
                            </Link>
                          ) : (
                            '—'
                          )}
                          <span className={styles.countValue}>
                            r{formatNumber(set.revision, locale)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!data.draft ? <p className={styles.meta}>{t('sourceDrift.set.none')}</p> : null}

                <div className={styles.actions}>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!canManage || !online || !data.draft}
                    onClick={() => {
                      setReason('')
                      setAbandonOpen(true)
                    }}
                  >
                    {t('sourceDrift.abandon.action')}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canManage || !online || !data.draft || effective === 0}
                    onClick={() => {
                      setReason('')
                      setMaterializeOpen(true)
                    }}
                  >
                    {t('sourceDrift.materialize.action')}
                  </Button>
                </div>
                {data.draft && effective === 0 ? (
                  <p role="status" className={styles.warn}>
                    <span aria-hidden="true">⚠</span>
                    {t('sourceDrift.materialize.empty')}
                  </p>
                ) : null}
                {!canManage ? (
                  <p role="status" className={styles.warn}>
                    <span aria-hidden="true">⚠</span>
                    {t('administrative.block.NO_PERMISSION')}
                  </p>
                ) : null}
              </section>
            </div>
          )}
        </AsyncBoundary>

        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <InlineSelect
              label={t('sourceDrift.filter.state')}
              value={decisionState}
              onChange={(event) => setParam('state', event.target.value || null)}
            >
              <option value="">{t('sourceDrift.filter.all')}</option>
              {DECISION_STATES.map((state) => (
                <option key={state} value={state}>
                  {t(`sourceDrift.decisionState.${state}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('sourceDrift.filter.classification')}
              value={classification}
              onChange={(event) => setParam('class', event.target.value || null)}
            >
              <option value="">{t('sourceDrift.filter.all')}</option>
              {CLASSIFICATIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`sourceDrift.classification.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
          </div>
          {queue.isFetching ? <Badge tone="neutral">{t('state.loading')}</Badge> : null}
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
              title={t('sourceDrift.empty')}
              hint={
                decisionState === 'UNDECIDED'
                  ? t('sourceDrift.emptyUndecided')
                  : t('sourceDrift.emptyFiltered')
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
              getRowId={(row) => row.id}
              caption={t('sourceDrift.title')}
              onRowClick={(row) => setOpenRow(row.id)}
            />
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className={styles.meta}>
                {t('sourceDrift.pageSummary', { shown: formatNumber(rows.length, locale) })}
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

      <QuarantineDetailDrawer
        datasetId={datasetId}
        rowId={openRow}
        onClose={() => setOpenRow(null)}
        canManage={canManage}
        online={online}
      />

      <ConfirmDialog
        open={materializeOpen}
        onClose={() => setMaterializeOpen(false)}
        onConfirm={() => runMaterialize.mutate()}
        title={t('sourceDrift.materialize.confirmTitle')}
        description={t('sourceDrift.materialize.confirmBody')}
        confirmLabel={t('sourceDrift.materialize.action')}
        loading={runMaterialize.isPending}
        tone="primary"
        irreversible={false}
        changes={[
          { label: t('sourceDrift.set.revision'), to: formatNumber(revision, locale) },
          {
            label: t('sourceDrift.materialize.decisions'),
            to: t('sourceDrift.set.effectiveValue', {
              accepted: formatNumber(accepted, locale),
              rejected: formatNumber(rejected, locale),
              undecided: formatNumber(undecided, locale),
            }),
            note: t('sourceDrift.materialize.rejectedNote'),
          },
          {
            label: t('sourceDrift.materialize.resultLabel'),
            note: t('sourceDrift.materialize.stagedOnly'),
          },
        ]}
      />

      <Modal
        open={abandonOpen}
        onClose={() => setAbandonOpen(false)}
        title={t('sourceDrift.abandon.confirmTitle')}
        description={t('sourceDrift.abandon.confirmBody')}
        footer={
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setAbandonOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={runAbandon.isPending}
              disabled={reason.trim().length === 0}
              onClick={() => runAbandon.mutate()}
            >
              {t('sourceDrift.abandon.action')}
            </Button>
          </div>
        }
      >
        <div className={styles.stack}>
          <p className={styles.warn}>
            <span aria-hidden="true">⚠</span>
            {t('sourceDrift.abandon.consequence')}
          </p>
          <TextArea
            label={t('sourceDrift.detail.reasonLabel')}
            hint={t('sourceDrift.abandon.reasonHint')}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </Modal>

      {/*
        The result, not a redirect. Materialising produced a STAGED version and
        nothing else; the operator has to read the diff and publish it, and a
        screen that navigated away would imply the work was finished.
      */}
      <Modal
        open={Boolean(derived)}
        onClose={() => setDerived(null)}
        title={t('sourceDrift.materialize.doneTitle')}
        description={t('sourceDrift.materialize.doneBody')}
        footer={
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setDerived(null)}>
              {t('action.close')}
            </Button>
            {derived ? (
              <Link to={`/administrative-data/${derived.datasetVersionId}`}>
                <Button variant="primary">{t('sourceDrift.materialize.openDataset')}</Button>
              </Link>
            ) : null}
          </div>
        }
      >
        {derived ? (
          <div className={styles.stack}>
            <Facts>
              <Fact label={t('administrative.col.version')}>
                <code className={styles.mono}>{derived.combinedDatasetVersion}</code>
              </Fact>
              <Fact label={t('administrative.col.status')}>
                <Badge tone="neutral">{t('administrative.status.STAGED')}</Badge>
              </Fact>
              <Fact label={t('administrative.overrideRevision')}>
                {formatNumber(derived.overrideRevision, locale)}
              </Fact>
              <Fact label={t('sourceDrift.materialize.edges')}>
                {formatNumber(derived.decisions.edges, locale)}
              </Fact>
            </Facts>
            <p className={styles.warn}>
              <span aria-hidden="true">⚠</span>
              {t('sourceDrift.materialize.sequence')}
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
