import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { newIdempotencyKey } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/format'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { TextArea } from '@/shared/ui/Field'
import { ConfirmDialog, Drawer } from '@/shared/ui/Overlay'
import { AsyncBoundary, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import type { AdministrativeMappingDetail } from '@/shared/api/contracts-administrative'
import {
  correctPlaceMapping,
  fetchPlaceAdministrativeMapping,
  reconcilePlaceMapping,
  rejectPlaceMapping,
  rematchPlaceMapping,
  verifyPlaceMapping,
} from './api'
import {
  ApprovalBlockBadge,
  Confidence,
  MappingStatusBadge,
  StalenessBadge,
  UnitSelector,
} from './mappingParts'
import { styles } from './mapping.style'

/**
 * CMS #156 — one place's administrative mapping, and the decisions a reviewer
 * can take on it.
 *
 * Three roles meet on this screen and none of them may do the others' job. The
 * **moderator** certifies where the place is. The **editor** decides whether it
 * belongs in the catalogue, and sees only the blocker. **Ops** reconciles a
 * mapping against the active dataset and is never recorded as its verifier.
 * Every button below is gated on `permittedActions` from the server rather than
 * on a role name, so the console offers exactly what the API will accept.
 */
type Action = 'verify' | 'correct' | 'reject' | 'rematch' | 'reconcile'

export function MappingDetailDrawer({
  placeId,
  onClose,
}: {
  placeId: string | null
  onClose: () => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const describeError = useErrorMessage()

  const [province, setProvince] = useState<string | null>(null)
  const [commune, setCommune] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState<Action | null>(null)
  /** One key per decision. Minted per row; replaced on a domain refusal. */
  const [key, setKey] = useState(newIdempotencyKey)

  const detail = useQuery({
    queryKey: queryKeys.administrativeMappingDetail(placeId ?? ''),
    queryFn: ({ signal }) => fetchPlaceAdministrativeMapping(placeId!, signal),
    enabled: Boolean(placeId),
  })

  const data = detail.data
  const mapping = data?.mapping
  const expectedUpdatedAt = data?.place.updatedAt ?? ''
  const may = (action: Action) => data?.permittedActions.includes(action) ?? false

  useEffect(() => {
    setReason('')
    setConfirming(null)
    setKey(newIdempotencyKey())
    // Seeded from what the mapping already claims, so "verify" confirms the
    // proposal on screen rather than asking the reviewer to retype it.
    setProvince(mapping?.provinceCode ?? null)
    setCommune(mapping?.communeCode ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, mapping?.provinceCode, mapping?.communeCode])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.administrativeAll })
    // The editor's view of this place changes too: the blocker may be gone.
    void queryClient.invalidateQueries({ queryKey: ['places'] })
  }

  const settled = (error: unknown) =>
    error instanceof ApiError && error.status >= 400 && error.status < 500

  /**
   * `PLACE_MODIFIED` means the row moved under the reviewer — somebody else
   * decided, or an editor saved the place. Retrying would decide about a row
   * they never saw, so the screen refetches and drops the selection.
   */
  const onDecisionError = (error: unknown) => {
    if (settled(error)) setKey(newIdempotencyKey())
    setConfirming(null)
    if (error instanceof ApiError && error.code === 'PLACE_MODIFIED') {
      invalidate()
      toast.error(t('mapping.conflict.modified'))
      return
    }
    if (
      error instanceof ApiError &&
      ['PROVINCE_NOT_CURRENT', 'COMMUNE_NOT_CURRENT', 'HIERARCHY_INVALID'].includes(error.code)
    ) {
      // The active dataset moved while the drawer was open: the identities the
      // reviewer picked are no longer in it.
      void queryClient.invalidateQueries({ queryKey: ['administrative', 'units'] })
      setCommune(null)
      toast.error(describeError(error))
      return
    }
    toast.error(describeError(error))
  }

  const done = (message: string, detailText?: string) => {
    setKey(newIdempotencyKey())
    setReason('')
    setConfirming(null)
    invalidate()
    toast.success(message, detailText)
  }

  const verify = useMutation({
    mutationFn: () =>
      verifyPlaceMapping(
        placeId!,
        { provinceCode: province!, communeCode: commune!, expectedUpdatedAt },
        { idempotencyKey: key },
      ),
    // Verifying certifies where the place is. It does not publish it — that is
    // the editor's decision and a different role entirely.
    onSuccess: () => done(t('mapping.verify.done'), t('mapping.verify.doneDetail')),
    onError: onDecisionError,
  })

  const correct = useMutation({
    mutationFn: () =>
      correctPlaceMapping(
        placeId!,
        {
          provinceCode: province!,
          communeCode: commune!,
          reason: reason.trim(),
          expectedUpdatedAt,
        },
        { idempotencyKey: key },
      ),
    onSuccess: () => done(t('mapping.correct.done'), t('mapping.verify.doneDetail')),
    onError: onDecisionError,
  })

  const reject = useMutation({
    mutationFn: () =>
      rejectPlaceMapping(
        placeId!,
        { reason: reason.trim(), expectedUpdatedAt },
        { idempotencyKey: key },
      ),
    onSuccess: () => done(t('mapping.reject.done'), t('mapping.reject.doneDetail')),
    onError: onDecisionError,
  })

  const rematch = useMutation({
    mutationFn: () =>
      rematchPlaceMapping(
        placeId!,
        { reason: reason.trim(), expectedUpdatedAt },
        { idempotencyKey: key },
      ),
    onSuccess: (result) =>
      // The resolver ran; it did not verify anything, and it may well have
      // landed on UNMAPPED.
      done(
        t('mapping.rematch.done', { status: t(`mapping.status.${result.status}` as const) }),
        t('mapping.rematch.doneDetail'),
      ),
    onError: onDecisionError,
  })

  const reconcile = useMutation({
    mutationFn: () => reconcilePlaceMapping(placeId!, { idempotencyKey: key }),
    onSuccess: (result) =>
      done(
        result.changed ? t('mapping.reconcile.changed') : t('mapping.reconcile.unchanged'),
        t(`mapping.staleReason.${result.verdict.reason}` as const),
      ),
    onError: onDecisionError,
  })

  const pending =
    verify.isPending ||
    correct.isPending ||
    reject.isPending ||
    rematch.isPending ||
    reconcile.isPending

  const identityChosen = Boolean(province && commune)
  const reasonGiven = reason.trim().length > 0

  return (
    <>
      <Drawer
        open={Boolean(placeId)}
        onClose={onClose}
        width="lg"
        title={data?.place.name ?? t('mapping.detail.title')}
        description={t('mapping.detail.subtitle')}
        footer={
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              {t('action.close')}
            </Button>
            {may('reconcile') ? (
              <Button
                variant="secondary"
                loading={reconcile.isPending}
                disabled={pending}
                onClick={() => setConfirming('reconcile')}
              >
                {t('mapping.reconcile.action')}
              </Button>
            ) : null}
            {may('rematch') ? (
              <Button
                variant="secondary"
                disabled={pending || !reasonGiven}
                onClick={() => setConfirming('rematch')}
              >
                {t('mapping.rematch.action')}
              </Button>
            ) : null}
            {may('reject') ? (
              <Button
                variant="danger"
                disabled={pending || !reasonGiven}
                onClick={() => setConfirming('reject')}
              >
                {t('mapping.reject.action')}
              </Button>
            ) : null}
            {may('correct') ? (
              <Button
                variant="primary"
                disabled={pending || !identityChosen || !reasonGiven}
                onClick={() => setConfirming('correct')}
              >
                {t('mapping.correct.action')}
              </Button>
            ) : null}
            {may('verify') ? (
              <Button
                variant="primary"
                disabled={pending || !identityChosen}
                onClick={() => setConfirming('verify')}
              >
                {t('mapping.verify.action')}
              </Button>
            ) : null}
          </div>
        }
      >
        <AsyncBoundary
          status={detail.status}
          error={detail.error}
          data={detail.data}
          onRetry={() => void detail.refetch()}
        >
          {(row) => (
            <div className={styles.stack}>
              <p className={styles.notice}>
                <span aria-hidden="true">ℹ</span>
                {t('mapping.detail.scope')}
              </p>

              <section className={styles.section}>
                <p className={styles.factLabel}>{t('mapping.detail.place')}</p>
                <p className={styles.address}>{row.place.addressText ?? '—'}</p>
                <p className={styles.meta}>
                  {[row.place.district, row.place.city].filter(Boolean).join(' · ') || '—'}
                  {' · '}
                  {row.place.geometry.lat.toFixed(5)}, {row.place.geometry.lng.toFixed(5)}
                </p>
              </section>

              <Facts>
                <Fact label={t('mapping.col.status')}>
                  <MappingStatusBadge status={row.mapping.status} />
                </Fact>
                <Fact label={t('mapping.detail.approval')}>
                  <ApprovalBlockBadge block={row.approval.block} />
                </Fact>
                <Fact label={t('mapping.detail.staleness')}>
                  <StalenessBadge verdict={row.staleness} />
                </Fact>
                <Fact label={t('mapping.detail.province')}>
                  {label(row.mapping.provinceName, row.mapping.provinceCode)}
                </Fact>
                <Fact label={t('mapping.detail.commune')}>
                  {label(row.mapping.communeName, row.mapping.communeCode)}
                </Fact>
                <Fact label={t('mapping.detail.legacyDistrict')}>
                  {label(row.mapping.legacyDistrictName, row.mapping.legacyDistrictCode)}
                </Fact>
                <Fact label={t('mapping.detail.method')}>
                  {row.mapping.method ? (
                    <code className={styles.mono}>{row.mapping.method}</code>
                  ) : (
                    '—'
                  )}
                </Fact>
                <Fact label={t('mapping.detail.confidence')}>
                  <Confidence value={row.mapping.confidence} />
                </Fact>
                <Fact label={t('mapping.detail.reviewer')}>
                  {row.mapping.reviewer?.displayName ?? t('mapping.detail.noReviewer')}
                </Fact>
                <Fact label={t('mapping.detail.datasetVersion')}>
                  <code className={styles.mono}>{row.mapping.datasetVersion ?? '—'}</code>
                </Fact>
                <Fact label={t('mapping.detail.activeVersion')}>
                  <code className={styles.mono}>{row.activeDatasetVersion}</code>
                </Fact>
                <Fact label={t('mapping.detail.boundaryVersion')}>
                  <code className={styles.mono}>{row.mapping.boundaryVersion ?? '—'}</code>
                </Fact>
                <Fact label={t('mapping.detail.mappedAt')}>
                  {row.mapping.mappedAt ? formatDateTime(row.mapping.mappedAt, locale) : '—'}
                </Fact>
                <Fact label={t('mapping.detail.hierarchy')}>
                  <Badge tone={row.hierarchyValid ? 'mint' : 'danger'}>
                    {t(row.hierarchyValid ? 'mapping.hierarchy.ok' : 'mapping.hierarchy.invalid')}
                  </Badge>
                </Fact>
              </Facts>

              {row.unresolvedReason ? (
                <p className={styles.warn}>
                  <span aria-hidden="true">⚠</span>
                  {row.unresolvedReason}
                </p>
              ) : null}

              <section className={styles.section}>
                <p className={styles.factLabel}>{t('mapping.detail.evidence')}</p>
                {row.evidence.length === 0 ? (
                  <p className={styles.meta}>{t('mapping.detail.noEvidence')}</p>
                ) : (
                  <ul className={styles.evidenceList}>
                    {row.evidence.map((item, index) => (
                      <li key={`${item.method}-${index}`} className={styles.evidence}>
                        <div className={styles.evidenceHead}>
                          <code className={styles.evidenceMethod}>{item.method}</code>
                          <span className={styles.blockRow}>
                            <Badge tone={item.deterministic ? 'mint' : 'neutral'}>
                              {t(
                                item.deterministic
                                  ? 'mapping.evidence.deterministic'
                                  : 'mapping.evidence.suggestion',
                              )}
                            </Badge>
                            <Badge tone={item.hierarchyValid ? 'mint' : 'danger'}>
                              {t(
                                item.hierarchyValid
                                  ? 'mapping.hierarchy.ok'
                                  : 'mapping.hierarchy.invalid',
                              )}
                            </Badge>
                            {item.onEdge === true ? (
                              <Badge tone="amber">{t('mapping.evidence.onEdge')}</Badge>
                            ) : null}
                          </span>
                        </div>
                        <p className={styles.evidenceDetail}>{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {row.candidates.length > 0 ? (
                <section className={styles.section}>
                  <p className={styles.factLabel}>{t('mapping.detail.candidates')}</p>
                  <p className={styles.meta}>{t('mapping.detail.candidatesHint')}</p>
                  <ul className={styles.evidenceList}>
                    {row.candidates.map((candidate, index) => (
                      <li key={`${candidate.method}-${index}`} className={styles.evidence}>
                        <code className={styles.evidenceMethod}>
                          {candidate.provinceCode ?? '—'} / {candidate.communeCode ?? '—'}
                        </code>
                        <p className={styles.evidenceDetail}>{candidate.detail}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {may('verify') || may('correct') ? (
                <section className={styles.section}>
                  <p className={styles.factLabel}>{t('mapping.detail.decide')}</p>
                  <UnitSelector
                    provinceCode={province}
                    communeCode={commune}
                    onProvince={setProvince}
                    onCommune={setCommune}
                    disabled={pending}
                  />
                  <p className={styles.meta}>{t('mapping.selector.legacyNote')}</p>
                </section>
              ) : null}

              {may('verify') || may('reject') || may('rematch') || may('correct') ? (
                <TextArea
                  label={t('mapping.detail.reasonLabel')}
                  hint={t('mapping.detail.reasonHint')}
                  rows={3}
                  value={reason}
                  disabled={pending}
                  onChange={(event) => setReason(event.target.value)}
                />
              ) : (
                // An editor sees the blocker and the evidence, and no decision.
                <p className={styles.notice}>
                  <span aria-hidden="true">ℹ</span>
                  {t('mapping.detail.readOnly')}
                </p>
              )}
            </div>
          )}
        </AsyncBoundary>
      </Drawer>

      <ConfirmDialog
        open={confirming === 'verify'}
        onClose={() => setConfirming(null)}
        onConfirm={() => verify.mutate()}
        title={t('mapping.verify.confirmTitle')}
        description={t('mapping.verify.confirmBody')}
        confirmLabel={t('mapping.verify.action')}
        loading={verify.isPending}
        tone="primary"
        irreversible={false}
        changes={identityChanges(data, province, commune, t)}
      />

      {/*
        Replacing a mapping somebody already certified is the strongest thing on
        this screen, so it keeps the destructive treatment and shows both
        identities.
      */}
      <ConfirmDialog
        open={confirming === 'correct'}
        onClose={() => setConfirming(null)}
        onConfirm={() => correct.mutate()}
        title={t('mapping.correct.confirmTitle')}
        description={
          mapping?.status === 'VERIFIED'
            ? t('mapping.correct.confirmVerified')
            : t('mapping.correct.confirmBody')
        }
        confirmLabel={t('mapping.correct.action')}
        loading={correct.isPending}
        tone={mapping?.status === 'VERIFIED' ? 'danger' : 'primary'}
        irreversible={mapping?.status === 'VERIFIED'}
        changes={identityChanges(data, province, commune, t)}
      />

      <ConfirmDialog
        open={confirming === 'reject'}
        onClose={() => setConfirming(null)}
        onConfirm={() => reject.mutate()}
        title={t('mapping.reject.confirmTitle')}
        description={t('mapping.reject.confirmBody')}
        confirmLabel={t('mapping.reject.action')}
        loading={reject.isPending}
        changes={[
          { label: t('mapping.col.status'), from: mapping?.status, to: 'REJECTED' },
          { label: t('mapping.reject.consequenceLabel'), note: t('mapping.reject.consequence') },
        ]}
      />

      <ConfirmDialog
        open={confirming === 'rematch'}
        onClose={() => setConfirming(null)}
        onConfirm={() => rematch.mutate()}
        title={t('mapping.rematch.confirmTitle')}
        description={t('mapping.rematch.confirmBody')}
        confirmLabel={t('mapping.rematch.action')}
        loading={rematch.isPending}
        irreversible={false}
        changes={[
          { label: t('mapping.detail.reviewer'), from: mapping?.reviewer?.displayName, to: '—' },
          { label: t('mapping.rematch.consequenceLabel'), note: t('mapping.rematch.consequence') },
        ]}
      />

      <ConfirmDialog
        open={confirming === 'reconcile'}
        onClose={() => setConfirming(null)}
        onConfirm={() => reconcile.mutate()}
        title={t('mapping.reconcile.confirmTitle')}
        description={t('mapping.reconcile.confirmBody')}
        confirmLabel={t('mapping.reconcile.action')}
        loading={reconcile.isPending}
        tone="primary"
        irreversible={false}
        changes={[
          {
            label: t('mapping.detail.datasetVersion'),
            from: data?.staleness.storedDatasetVersion ?? '—',
            to: data?.staleness.activeDatasetVersion,
          },
          {
            label: t('mapping.reconcile.consequenceLabel'),
            note: t('mapping.reconcile.consequence'),
          },
        ]}
      />
    </>
  )
}

/** Before and after, as identities. A code alone would not say what moved. */
function identityChanges(
  data: AdministrativeMappingDetail | undefined,
  province: string | null,
  commune: string | null,
  t: ReturnType<typeof useT>,
) {
  if (!data) return []
  return [
    {
      label: t('mapping.detail.province'),
      from: label(data.mapping.provinceName, data.mapping.provinceCode),
      to: province ?? '—',
    },
    {
      label: t('mapping.detail.commune'),
      from: label(data.mapping.communeName, data.mapping.communeCode),
      to: commune ?? '—',
    },
    { label: t('mapping.verify.consequenceLabel'), note: t('mapping.verify.consequence') },
  ]
}

function label(name: string | null, code: string | null): string {
  if (!code) return '—'
  return name ? `${name} (${code})` : code
}

function Fact({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{text}</dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  )
}

function Facts({ children }: { children: React.ReactNode }) {
  return <dl className={styles.facts}>{children}</dl>
}
