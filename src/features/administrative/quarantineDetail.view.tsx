import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { newIdempotencyKey } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { formatDate, formatDateTime, formatNumber } from '@/shared/format'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { TextArea } from '@/shared/ui/Field'
import { Drawer } from '@/shared/ui/Overlay'
import { AsyncBoundary, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import type { AdministrativeOverrideDecisionRecord } from '@/shared/api/contracts-administrative'
import { acceptQuarantineRow, fetchQuarantineRow, rejectQuarantineRow } from './api'
import { ClassificationBadge, DecisionStateBadge, Fact, Facts, Identity } from './sourceDriftParts'
import { styles } from './sourceDrift.style'

/**
 * CMS #155 — one quarantined advisory row, and the two decisions a reviewer can
 * take on it.
 *
 * The screen's job is to make a decision *possible to justify*: what the source
 * actually said, which successors this dataset holds, whether each one's
 * hierarchy resolves, how many places carry the old code, and every opinion
 * anybody has already recorded. It is deliberately not a shortcut — there is no
 * "accept the suggestion" button, because the upstream's default successor for a
 * divided commune is exactly the guess ADR-0019 refuses.
 */
export function QuarantineDetailDrawer({
  datasetId,
  rowId,
  onClose,
  canManage,
  online,
}: {
  datasetId: string
  rowId: string | null
  onClose: () => void
  canManage: boolean
  online: boolean
}) {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const describeError = useErrorMessage()

  /**
   * The chosen candidate, by identity. A code alone is not one (ADR-0019 §2):
   * in the pinned dataset 2,212 of 3,321 current codes also name a *different*
   * unit in the historical set, so a divided commune's candidates routinely
   * come as `00025 Ngọc Khánh (1900, INACTIVE)` and `00025 Giảng Võ (2025,
   * ACTIVE)`. Keyed by code, both lit up and the period sent was whichever
   * came first — the dead one — and the server rightly refused it (#205).
   */
  const [target, setTarget] = useState<{ code: string; effectiveFrom: string } | null>(null)
  const [reason, setReason] = useState('')
  /**
   * One key per decision, minted when the drawer opens on a row. A domain
   * refusal ends that decision and the next attempt gets a new key; a network
   * failure keeps it, because that is the case the key exists for.
   */
  const [key, setKey] = useState(newIdempotencyKey)

  const row = useQuery({
    queryKey: queryKeys.administrativeQuarantineRow(datasetId, rowId ?? ''),
    queryFn: ({ signal }) => fetchQuarantineRow(datasetId, rowId!, signal),
    enabled: Boolean(rowId),
  })

  useEffect(() => {
    setTarget(null)
    setReason('')
    setKey(newIdempotencyKey())
  }, [rowId])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.administrativeAll })
  }

  const settled = (error: unknown) =>
    error instanceof ApiError && error.status >= 400 && error.status < 500

  /**
   * A revision conflict means somebody else decided a row while this drawer was
   * open. Retrying would decide against a draft that has moved, so the screen
   * refetches and asks for the decision again rather than replaying it.
   */
  const onDecisionError = (error: unknown) => {
    if (settled(error)) setKey(newIdempotencyKey())
    if (error instanceof ApiError && error.code === 'OVERRIDE_SET_REVISION_CONFLICT') {
      invalidate()
      toast.error(t('sourceDrift.conflict.revision'))
      return
    }
    if (
      error instanceof ApiError &&
      [
        'BASE_DATASET_CHANGED',
        'OVERRIDE_SET_NOT_DRAFT',
        'OVERRIDE_BASE_ALREADY_MATERIALIZED',
      ].includes(error.code)
    ) {
      invalidate()
      setTarget(null)
      toast.error(t('sourceDrift.conflict.lifecycle'))
      return
    }
    toast.error(describeError(error))
  }

  const detail = row.data
  const revision = detail?.overrideSet.revision ?? 0

  const accept = useMutation({
    mutationFn: () =>
      acceptQuarantineRow(
        datasetId,
        rowId!,
        {
          targetCode: target!.code,
          targetEffectiveFrom: target!.effectiveFrom,
          reason: reason.trim(),
          expectedRevision: revision,
        },
        { idempotencyKey: key },
      ),
    onSuccess: (result) => {
      setKey(newIdempotencyKey())
      setReason('')
      invalidate()
      toast.success(t('sourceDrift.accept.done'), t('sourceDrift.draftOnly'))
      // The server's revision is the one the next decision must send back.
      void result
    },
    onError: onDecisionError,
  })

  const reject = useMutation({
    mutationFn: () =>
      rejectQuarantineRow(
        datasetId,
        rowId!,
        { reason: reason.trim(), expectedRevision: revision },
        { idempotencyKey: key },
      ),
    onSuccess: (result) => {
      setKey(newIdempotencyKey())
      setReason('')
      invalidate()
      if (result.retracts) {
        toast.success(
          t('sourceDrift.retract.done'),
          t('sourceDrift.retract.doneDetail', { code: result.retracts.targetCode }),
        )
      } else {
        toast.success(t('sourceDrift.reject.done'), t('sourceDrift.reject.doneDetail'))
      }
    },
    onError: onDecisionError,
  })

  const pending = accept.isPending || reject.isPending
  const writable = canManage && online && detail?.overrideSet.status !== 'MATERIALIZED'
  /*
   * GoGo-CMS#213 — the decision is about the source. A row another row of the
   * same source settled cannot be accepted elsewhere (the API refuses it with
   * OVERRIDE_SOURCE_ALREADY_RESOLVED); rejecting it stays possible and changes
   * nothing. On the row that was decided, a rejection is a retraction.
   */
  const settledBySibling = detail?.sourceSettled ?? null
  const retractable =
    detail?.materialized?.decision === 'ACCEPT' && !detail.materialized.retracted
      ? detail.materialized.targetCode
      : null

  return (
    <Drawer
      open={Boolean(rowId)}
      onClose={onClose}
      width="lg"
      title={t('sourceDrift.detail.title')}
      description={t('sourceDrift.detail.subtitle')}
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('action.close')}
          </Button>
          <Button
            variant="danger"
            loading={reject.isPending}
            disabled={!writable || reason.trim().length === 0 || pending}
            onClick={() => reject.mutate()}
          >
            {retractable ? t('sourceDrift.retract.action') : t('sourceDrift.reject.action')}
          </Button>
          <Button
            variant="primary"
            loading={accept.isPending}
            disabled={
              !writable ||
              Boolean(settledBySibling) ||
              !target ||
              reason.trim().length === 0 ||
              pending
            }
            onClick={() => accept.mutate()}
          >
            {t('sourceDrift.accept.action')}
          </Button>
        </div>
      }
    >
      <AsyncBoundary
        status={row.status}
        error={row.error}
        data={row.data}
        onRetry={() => void row.refetch()}
      >
        {(data) => (
          <div className={styles.stack}>
            <p className={styles.notice}>
              <span aria-hidden="true">ℹ</span>
              {t('sourceDrift.draftOnly')}
            </p>

            {data.sourceSettled ? (
              <section className={styles.section} aria-label={t('sourceDrift.settled.title')}>
                <p className={styles.factLabel}>{t('sourceDrift.settled.title')}</p>
                <p className={styles.warn}>
                  <span aria-hidden="true">⚠</span>
                  {t('sourceDrift.settled.hint', {
                    source: data.source.code ?? '—',
                    target: data.sourceSettled.targetCode,
                    round: data.sourceSettled.sourceVersion,
                  })}
                </p>
              </section>
            ) : null}

            {data.materialized ? (
              /*
               * GoGo-BE#619 — the decision an earlier round carried into this
               * version. It is not a draft and it is not in the history below,
               * which belongs to the draft set; it is shown first because it
               * is the one thing about this row that has already happened.
               */
              <section className={styles.section} aria-label={t('sourceDrift.detail.materialized')}>
                <p className={styles.factLabel}>{t('sourceDrift.detail.materialized')}</p>
                <p className={styles.meta}>{t('sourceDrift.detail.materializedHint')}</p>
                <div className={styles.historyHead}>
                  <span>
                    <Badge tone={data.materialized.decision === 'ACCEPT' ? 'mint' : 'neutral'}>
                      {t(`sourceDrift.decision.${data.materialized.decision}` as const)}
                    </Badge>{' '}
                    {data.materialized.targetCode ? (
                      <code className={styles.mono}>{data.materialized.targetCode}</code>
                    ) : null}{' '}
                    {data.materialized.retracted ? (
                      <Badge tone="amber">
                        {t('sourceDrift.detail.retracted', {
                          code: data.materialized.retracted.targetCode,
                        })}
                      </Badge>
                    ) : null}
                  </span>
                  {data.materialized.decidedAt ? (
                    <time className={styles.meta} dateTime={data.materialized.decidedAt}>
                      {formatDateTime(data.materialized.decidedAt, locale)}
                    </time>
                  ) : null}
                </div>
                {data.materialized.reason ? (
                  <p className={styles.historyReason}>{data.materialized.reason}</p>
                ) : null}
              </section>
            ) : null}

            <Facts>
              <Fact label={t('sourceDrift.col.classification')}>
                <ClassificationBadge value={data.classification} />
              </Fact>
              <Fact label={t('sourceDrift.col.decisionState')}>
                <DecisionStateBadge state={data.decisionState} />
              </Fact>
              <Fact label={t('sourceDrift.detail.reason')}>{data.validationReason}</Fact>
              <Fact label={t('sourceDrift.detail.source')}>
                <Identity unit={data.source} />
              </Fact>
              <Fact label={t('sourceDrift.detail.baseVersion')}>
                <code className={styles.mono}>{data.combinedDatasetVersion}</code>
              </Fact>
              <Fact label={t('sourceDrift.detail.provenance')}>
                <span className={styles.meta}>{data.sourceProvenance}</span>
              </Fact>
              <Fact label={t('sourceDrift.detail.affected')}>
                {formatNumber(data.affectedPlaces.total, locale)}
              </Fact>
              <Fact label={t('sourceDrift.detail.setRevision')}>
                {formatNumber(data.overrideSet.revision, locale)}
              </Fact>
            </Facts>

            {data.affectedPlaces.samples.length > 0 ? (
              <div>
                <p className={styles.factLabel}>{t('sourceDrift.detail.affectedSamples')}</p>
                <ul className={styles.samples}>
                  {data.affectedPlaces.samples.map((sample) => (
                    <li key={sample.placeId} className={styles.sample}>
                      {sample.name} · {sample.code} · {sample.status}
                    </li>
                  ))}
                </ul>
                {data.affectedPlaces.truncated ? (
                  <p className={styles.meta}>
                    {t('sourceDrift.detail.sampleTruncated', {
                      shown: formatNumber(data.affectedPlaces.samples.length, locale),
                      total: formatNumber(data.affectedPlaces.total, locale),
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}

            <section className={styles.section}>
              <p className={styles.factLabel}>{t('sourceDrift.detail.candidates')}</p>
              <p className={styles.meta}>{t('sourceDrift.detail.candidatesHint')}</p>
              <ul
                className={styles.candidateList}
                role="radiogroup"
                aria-label={t('sourceDrift.detail.candidates')}
              >
                {data.candidates.map((candidate) => {
                  const selectable = candidate.selectable === true
                  const chosen =
                    target?.code === candidate.code &&
                    target?.effectiveFrom === candidate.effectiveFrom
                  return (
                    <li key={`${candidate.code}-${candidate.effectiveFrom}`}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        disabled={!selectable || !writable}
                        onClick={() => {
                          // No effective date, no identity to send — the server
                          // would refuse it, so the click does nothing here too.
                          const { code, effectiveFrom } = candidate
                          if (!code || !effectiveFrom) return
                          setTarget({ code, effectiveFrom })
                        }}
                        className={`${styles.candidate} ${
                          chosen ? styles.candidateOn : selectable ? '' : styles.candidateOff
                        }`}
                      >
                        <span aria-hidden="true">{chosen ? '◉' : '○'}</span>
                        <span className={styles.candidateBody}>
                          <Identity unit={candidate} />
                          <span className={styles.candidateWhy}>
                            {candidate.proposedByUpstream ? (
                              <Badge tone="neutral">{t('sourceDrift.detail.upstreamGuess')}</Badge>
                            ) : null}{' '}
                            {!selectable
                              ? t('sourceDrift.detail.notSelectable')
                              : candidate.hierarchyValid === false
                                ? t('sourceDrift.detail.hierarchyInvalid')
                                : t('sourceDrift.detail.selectable')}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <TextArea
              label={t('sourceDrift.detail.reasonLabel')}
              hint={t('sourceDrift.detail.reasonHint')}
              value={reason}
              rows={3}
              disabled={!writable}
              onChange={(event) => setReason(event.target.value)}
            />

            <p className={styles.warn}>
              <span aria-hidden="true">⚠</span>
              {target && !settledBySibling
                ? t('sourceDrift.accept.consequence', { code: target.code })
                : settledBySibling
                  ? t('sourceDrift.settled.consequence')
                  : retractable
                    ? t('sourceDrift.retract.consequence', { code: retractable })
                    : t('sourceDrift.reject.consequence')}
            </p>

            <section className={styles.section}>
              <p className={styles.factLabel}>{t('sourceDrift.detail.history')}</p>
              {data.history.length === 0 ? (
                <p className={styles.meta}>{t('sourceDrift.detail.historyEmpty')}</p>
              ) : (
                <ol className={styles.history}>
                  {data.history.map((entry) => (
                    <HistoryEntry key={entry.id} entry={entry} />
                  ))}
                </ol>
              )}
            </section>

            {/* Bounded, and folded away: evidence a reviewer opens, not the view. */}
            <details className={styles.detailsBlock}>
              <summary className={styles.detailsSummary}>
                {t('sourceDrift.detail.rawPayload')}
              </summary>
              <pre className={styles.pre}>{JSON.stringify(data.rawPayload.value, null, 2)}</pre>
              {data.rawPayload.truncated ? (
                <p className={styles.meta}>{t('sourceDrift.detail.rawTruncated')}</p>
              ) : null}
            </details>
          </div>
        )}
      </AsyncBoundary>
    </Drawer>
  )
}

/**
 * One opinion, kept whether or not it is still the effective one.
 *
 * A superseded decision is dimmed, never removed: the point of an append-only
 * history is that a reviewer can see somebody changed their mind, and about
 * what.
 */
function HistoryEntry({ entry }: { entry: AdministrativeOverrideDecisionRecord }) {
  const t = useT()
  const { locale } = useI18n()
  const superseded = Boolean(entry.supersededById)
  return (
    <li className={superseded ? styles.historySuperseded : styles.historyItem}>
      <div className={styles.historyHead}>
        <span>
          <Badge tone={entry.decision === 'ACCEPT' ? 'lavender' : 'amber'}>
            {t(`sourceDrift.decision.${entry.decision}` as const)}
          </Badge>{' '}
          {entry.targetCode ? (
            <code className={styles.mono}>
              {entry.targetCode}
              {entry.targetEffectiveFrom
                ? ` · ${formatDate(entry.targetEffectiveFrom, locale)}`
                : ''}
            </code>
          ) : null}
          {superseded ? <Badge tone="neutral">{t('sourceDrift.detail.superseded')}</Badge> : null}
        </span>
        <time className={styles.meta} dateTime={entry.decidedAt}>
          {formatDateTime(entry.decidedAt, locale)}
        </time>
      </div>
      <p className={styles.historyReason}>{entry.reason}</p>
    </li>
  )
}

/**
 * The effective period of the chosen candidate.
 *
 * The contract requires the whole identity, so the code is never sent on its
 * own — and the period is read back from the candidate the reviewer clicked
 * rather than reconstructed, because reconstructing it is how a code ends up
 * meaning the wrong unit.
 */
