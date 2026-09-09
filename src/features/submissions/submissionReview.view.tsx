import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import type { MessageKey } from '@/shared/i18n/vi'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatNumber, formatRelative } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import { Drawer } from '@/shared/ui/Overlay'
import { AsyncBoundary } from '@/shared/ui/State'
import { UnsavedChangesDialog } from '@/shared/ui/UnsavedChangesGuard'
import { useToast } from '@/shared/ui/Toast'
import { CloseIcon } from '@/shared/ui/icons'
import { ApiError } from '@/shared/api/errors'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import { fetchPlaces } from '@/features/places/api'
import type { SubmissionReviewDraft } from '@/shared/api/contracts'
import {
  decideSubmission,
  fetchSubmission,
  previewSubmissionProvider,
  saveSubmissionReview,
  type SubmissionDecision,
} from './api'
import {
  EMPTY_REVIEW_FORM,
  PRICE_UNITS,
  changedReviewFields,
  reviewFormFrom,
  toReviewDraft,
  type ReviewForm,
} from './reviewForm'
import { styles } from './submissionReview.style'

const MIN_REASON = 3
const MAX_REASON = 500

/** One label per box, so the leave guard can name what is unsaved. */
const REVIEW_FIELD_LABEL = {
  name: 'submissions.review.name',
  description: 'submissions.review.description',
  addressText: 'submissions.review.address',
  phone: 'submissions.review.phone',
  website: 'submissions.review.website',
  avgVisitMinutes: 'submissions.review.avgVisitMinutes',
  priceMin: 'submissions.review.priceMin',
  priceMax: 'submissions.review.priceMax',
  priceUnit: 'submissions.review.priceUnit',
} as const satisfies Record<keyof ReviewForm, MessageKey>

/**
 * GoGo-BE#528 / PI-CMS-008 — reviewing one contribution.
 *
 * The queue used to be the whole surface: a Google Place ID for a title, a
 * reason box and three buttons. Deciding on that meant deciding on an
 * identifier — the reviewer could not see the place, could not tell it from one
 * the catalogue already held, and could not improve it before approval turned
 * it into a catalogue row.
 *
 * Three things this screen keeps deliberately apart, because conflating any of
 * them is how the old one went wrong:
 *
 * - **What GoGo holds** (identity, the contributor's input, the history) is
 *   free to look at and is always shown.
 * - **What Google says** costs a provider request and is therefore an action
 *   the reviewer takes, never something that happens because a panel opened.
 *   It is rendered, attributed, and stored nowhere.
 * - **What the reviewer decides** — the supplement, saved on its own, and then
 *   the decision. Saving does not approve; approving does not silently take
 *   unsaved edits with it.
 */
export function SubmissionReviewDrawer({
  submissionId,
  onClose,
}: {
  submissionId: string | null
  onClose: () => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()

  const [form, setForm] = useState<ReviewForm>(EMPTY_REVIEW_FORM)
  const [baseline, setBaseline] = useState<ReviewForm>(EMPTY_REVIEW_FORM)
  const [taxonomyIds, setTaxonomyIds] = useState<string[]>([])
  const [taxonomyBaseline, setTaxonomyBaseline] = useState<string>('')
  const [reason, setReason] = useState('')
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string } | null>(null)
  const [leaving, setLeaving] = useState(false)

  const detail = useQuery({
    queryKey: queryKeys.submissions.detail(submissionId ?? ''),
    queryFn: ({ signal }) => fetchSubmission(submissionId!, signal),
    enabled: Boolean(submissionId) && can('submission.read'),
  })

  const taxonomies = useQuery({
    queryKey: queryKeys.taxonomies.all,
    queryFn: ({ signal }) => fetchTaxonomies({}, signal),
    enabled: Boolean(submissionId) && can('submission.decide'),
    staleTime: 5 * 60_000,
  })
  const taxonomyById = useMemo(
    () => new Map((taxonomies.data ?? []).map((item) => [item.id, item])),
    [taxonomies.data],
  )

  const savedDraft = detail.data?.review?.draft ?? null

  // Seed the boxes from the stored draft, once per submission and once per
  // save — never on every render, or a reviewer's typing would be reset by a
  // background refetch.
  const seededFrom = `${submissionId ?? ''}:${detail.data?.updatedAt ?? ''}`
  const [seeded, setSeeded] = useState('')
  useEffect(() => {
    if (!detail.data || seeded === seededFrom) return
    const next = reviewFormFrom(savedDraft)
    setForm(next)
    setBaseline(next)
    const ids = savedDraft?.taxonomyIds ?? []
    setTaxonomyIds(ids)
    setTaxonomyBaseline(ids.slice().sort().join(','))
    setSeeded(seededFrom)
  }, [detail.data, savedDraft, seeded, seededFrom])

  const dirtyFields = changedReviewFields(form, baseline)
  const taxonomyDirty = taxonomyIds.slice().sort().join(',') !== taxonomyBaseline
  const dirty = dirtyFields.length > 0 || taxonomyDirty

  /**
   * One `quality` Place Details, on request. Cached under the submission id so
   * that closing and reopening the same proposal in one sitting does not buy
   * the same answer twice, and `enabled: false` so nothing happens until the
   * reviewer asks.
   */
  const provider = useQuery({
    queryKey: queryKeys.submissions.provider(submissionId ?? ''),
    queryFn: () => previewSubmissionProvider(submissionId!),
    enabled: false,
    gcTime: 10 * 60_000,
    staleTime: 10 * 60_000,
    retry: false,
  })

  const save = useMutation({
    mutationFn: () => {
      const draft: SubmissionReviewDraft = {
        ...toReviewDraft(form, savedDraft),
        taxonomyIds,
      }
      return saveSubmissionReview(submissionId!, draft, detail.data?.updatedAt)
    },
    onSuccess: () => {
      toast.success(t('submissions.review.saved'))
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all })
    },
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : undefined
      toast.error(
        code === 'SUBMISSION_MODIFIED'
          ? t('submissions.review.stale')
          : t('submissions.review.saveFailed'),
      )
    },
  })

  const decide = useMutation({
    mutationFn: (decision: SubmissionDecision) =>
      decideSubmission(submissionId!, decision, reason.trim(), mergeTarget?.id),
    onSuccess: (_result, decision) => {
      toast.success(t(`submissions.decided.${decision}`))
      setReason('')
      setMergeTarget(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all })
      // Approving creates a catalog place, so the catalog is stale too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
    },
    onError: () => toast.error(t('submissions.decideFailed')),
  })

  const mergeResults = useQuery({
    queryKey: ['submissions', 'merge-search', mergeQuery] as const,
    queryFn: ({ signal }) => fetchPlaces({ q: mergeQuery, limit: 8 }, signal),
    enabled: mergeQuery.trim().length >= 2 && can('submission.decide'),
  })

  const data = detail.data
  const canDecide = can('submission.decide') && data?.status === 'pending'
  const reasonTooShort = reason.trim().length < MIN_REASON

  const close = () => {
    if (dirty) {
      setLeaving(true)
      return
    }
    onClose()
  }

  return (
    <>
      <Drawer
        open={Boolean(submissionId)}
        onClose={close}
        width="lg"
        title={t('submissions.reviewTitle')}
        description={data ? data.googlePlaceId : undefined}
        footer={
          <div className={styles.footer}>
            {dirty ? <Badge tone="amber">{t('submissions.review.unsaved')}</Badge> : null}
            <Button variant="secondary" onClick={close}>
              {t('action.close')}
            </Button>
            {canDecide ? (
              <Button
                variant="secondary"
                disabled={!dirty || save.isPending}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                {t('submissions.review.save')}
              </Button>
            ) : null}
          </div>
        }
      >
        <AsyncBoundary
          status={detail.status}
          error={detail.error}
          data={data}
          onRetry={() => void detail.refetch()}
        >
          {(submission) => (
            <div className={styles.body}>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{t('submissions.section.identity')}</h3>
                <dl className={styles.facts}>
                  <Fact label={t('submissions.field.placeId')}>
                    <span className={styles.mono}>{submission.googlePlaceId}</span>
                  </Fact>
                  <Fact label={t('submissions.field.googleLink')}>
                    <a
                      className={styles.link}
                      href={submission.googleMapsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {t('submissions.openMap')}
                    </a>
                  </Fact>
                  <Fact label={t('submissions.field.createdAt')}>
                    {formatRelative(submission.createdAt, locale)}
                  </Fact>
                  <Fact label={t('submissions.field.source')}>
                    {submission.fromRegisteredUser
                      ? t('submissions.fromUser')
                      : t('submissions.fromGuest')}
                  </Fact>
                  <Fact label={t('submissions.field.count')}>
                    {formatNumber(submission.submissionCount, locale)}
                  </Fact>
                  <Fact label={t('submissions.field.status')}>
                    {t(`submissions.tab.${submission.status}`)}
                  </Fact>
                </dl>
                {submission.identityConflict && submission.identityConflict.length > 0 ? (
                  <p className={styles.warn}>
                    <span aria-hidden="true">⚠</span>
                    {t('submissions.identityConflictHint')}
                  </p>
                ) : null}
                {submission.existingPlace ? (
                  <div className={styles.note}>
                    <div>
                      <strong>{t('submissions.existingPlace')}:</strong>{' '}
                      {submission.existingPlace.name}
                    </div>
                    <a className={styles.link} href={`/places/${submission.existingPlace.id}`}>
                      {t('submissions.openPlace')}
                    </a>
                  </div>
                ) : null}
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{t('submissions.section.provider')}</h3>
                <p className={styles.hint}>
                  <span aria-hidden="true">ℹ</span>
                  {t('submissions.providerCost')}
                </p>
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={provider.isFetching}
                    onClick={() => void provider.refetch()}
                  >
                    {provider.data
                      ? t('submissions.reloadProvider')
                      : t('submissions.loadProvider')}
                  </Button>
                </div>
                {provider.isError ? (
                  <p className={styles.warn}>
                    <span aria-hidden="true">⚠</span>
                    {t('submissions.providerFailed')}
                  </p>
                ) : null}
                {provider.data?.candidate ? (
                  <ProviderFacts data={provider.data} locale={locale} />
                ) : provider.isFetching ? null : (
                  <p className={styles.hint}>{t('submissions.providerEmpty')}</p>
                )}
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{t('submissions.section.contribution')}</h3>
                <dl className={styles.facts}>
                  {submission.contribution.categoryKey ? (
                    <Fact label={t('submissions.field.category')}>
                      {submission.contribution.categoryKey}
                    </Fact>
                  ) : null}
                  {submission.contribution.estimatedPrice ? (
                    <Fact label={t('submissions.field.price')}>
                      {`${formatNumber(submission.contribution.estimatedPrice.min, locale)}–${formatNumber(
                        submission.contribution.estimatedPrice.max,
                        locale,
                      )} / ${submission.contribution.estimatedPrice.unit}`}
                    </Fact>
                  ) : null}
                  {submission.contribution.vibeKeys.length > 0 ? (
                    <Fact label={t('submissions.field.vibes')}>
                      {submission.contribution.vibeKeys.join(', ')}
                    </Fact>
                  ) : null}
                </dl>
                {submission.contribution.note ? (
                  <p className={styles.note}>{submission.contribution.note}</p>
                ) : null}
              </section>

              {canDecide ? (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>{t('submissions.section.review')}</h3>
                  <p className={styles.hint}>
                    <span aria-hidden="true">ℹ</span>
                    {t('submissions.reviewHint')}
                  </p>
                  <TextInput
                    label={t('submissions.review.name')}
                    value={form.name}
                    maxLength={200}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                  <TextArea
                    label={t('submissions.review.description')}
                    value={form.description}
                    maxLength={4000}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                  <TextInput
                    label={t('submissions.review.address')}
                    value={form.addressText}
                    maxLength={400}
                    onChange={(event) => setForm({ ...form, addressText: event.target.value })}
                  />
                  <div className={styles.grid}>
                    <TextInput
                      label={t('submissions.review.phone')}
                      value={form.phone}
                      maxLength={40}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    />
                    <TextInput
                      label={t('submissions.review.website')}
                      value={form.website}
                      maxLength={500}
                      onChange={(event) => setForm({ ...form, website: event.target.value })}
                    />
                    <TextInput
                      label={t('submissions.review.avgVisitMinutes')}
                      type="number"
                      min={10}
                      max={720}
                      value={form.avgVisitMinutes}
                      onChange={(event) =>
                        setForm({ ...form, avgVisitMinutes: event.target.value })
                      }
                    />
                    <Select
                      label={t('submissions.review.priceUnit')}
                      value={form.priceUnit}
                      onChange={(event) => setForm({ ...form, priceUnit: event.target.value })}
                    >
                      {PRICE_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {t(`priceUnit.${unit}`)}
                        </option>
                      ))}
                    </Select>
                    <TextInput
                      label={t('submissions.review.priceMin')}
                      type="number"
                      min={0}
                      value={form.priceMin}
                      onChange={(event) => setForm({ ...form, priceMin: event.target.value })}
                    />
                    <TextInput
                      label={t('submissions.review.priceMax')}
                      type="number"
                      min={0}
                      value={form.priceMax}
                      onChange={(event) => setForm({ ...form, priceMax: event.target.value })}
                    />
                  </div>

                  <div className={styles.tagRow}>
                    {taxonomyIds.map((id) => {
                      const taxonomy = taxonomyById.get(id)
                      return (
                        <span key={id} className={styles.tag}>
                          {taxonomy?.labels[locale] ?? taxonomy?.key ?? id}
                          <button
                            type="button"
                            aria-label={`${t('action.delete')} ${taxonomy?.key ?? id}`}
                            className={styles.tagRemove}
                            onClick={() =>
                              setTaxonomyIds((current) => current.filter((value) => value !== id))
                            }
                          >
                            <CloseIcon size={10} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                  <Select
                    label={t('submissions.review.addTaxonomy')}
                    hint={t('submissions.review.taxonomy')}
                    value=""
                    onChange={(event) => {
                      const value = event.target.value
                      if (value) setTaxonomyIds((current) => [...new Set([...current, value])])
                    }}
                  >
                    <option value="">—</option>
                    {(taxonomies.data ?? [])
                      .filter((item) => item.isActive && !taxonomyIds.includes(item.id))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {t(`taxonomyKind.${item.kind}` as const)} ·{' '}
                          {item.labels[locale] ?? item.key}
                        </option>
                      ))}
                  </Select>
                </section>
              ) : null}

              {canDecide ? (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>{t('submissions.section.decision')}</h3>
                  <p className={styles.hint}>
                    <span aria-hidden="true">ℹ</span>
                    {t('submissions.decisionsAreSeparate')}
                  </p>
                  <TextArea
                    label={t('submissions.reason')}
                    value={reason}
                    maxLength={MAX_REASON}
                    onChange={(event) => setReason(event.target.value)}
                    hint={t('submissions.reasonHint')}
                  />
                  <TextInput
                    label={t('submissions.mergeSearch')}
                    hint={t('submissions.mergeSearchHint')}
                    value={mergeQuery}
                    onChange={(event) => setMergeQuery(event.target.value)}
                  />
                  {mergeTarget ? (
                    <p className={styles.note}>
                      {t('submissions.mergeSelected', { name: mergeTarget.name })}{' '}
                      <button
                        type="button"
                        className={styles.link}
                        onClick={() => setMergeTarget(null)}
                      >
                        {t('submissions.mergeClear')}
                      </button>
                    </p>
                  ) : mergeQuery.trim().length >= 2 ? (
                    <div className={styles.results}>
                      {(mergeResults.data?.items ?? []).map((place) => (
                        <button
                          key={place.id}
                          type="button"
                          className={styles.result}
                          onClick={() => setMergeTarget({ id: place.id, name: place.name })}
                        >
                          <span className={styles.resultName}>{place.name}</span>
                          <span className={styles.resultMeta}>
                            {[place.provinceName ?? place.provinceCode, place.areaKey]
                              .filter(Boolean)
                              .join(' · ') || place.id}
                          </span>
                        </button>
                      ))}
                      {mergeResults.isSuccess && (mergeResults.data?.items.length ?? 0) === 0 ? (
                        <p className={styles.hint}>{t('submissions.mergeNoResults')}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={styles.footer}>
                    <Button
                      variant="success"
                      disabled={reasonTooShort || decide.isPending}
                      onClick={() => decide.mutate('approved')}
                    >
                      {t('submissions.action.approved')}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={reasonTooShort || decide.isPending}
                      onClick={() => decide.mutate('rejected')}
                    >
                      {t('submissions.action.rejected')}
                    </Button>
                    <Button
                      variant="secondary"
                      // The server requires a target for a merge and refuses
                      // without one; and a target is chosen from the catalogue,
                      // never typed as a UUID.
                      disabled={reasonTooShort || mergeTarget === null || decide.isPending}
                      onClick={() => decide.mutate('merged')}
                    >
                      {t('submissions.action.merged')}
                    </Button>
                  </div>
                </section>
              ) : (
                <p className={styles.hint}>
                  <span aria-hidden="true">ℹ</span>
                  {submission.status === 'pending'
                    ? t('submissions.cannotDecide')
                    : t('submissions.alreadyDecided')}
                </p>
              )}

              {submission.history.length > 0 ? (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>{t('submissions.section.history')}</h3>
                  {submission.history.map((entry, index) => (
                    <div key={`${entry.action}-${entry.at}-${index}`} className={styles.historyRow}>
                      <span className={styles.historyAction}>{entry.action}</span>
                      <span className={styles.historyMeta}>
                        {formatRelative(entry.at, locale)}
                        {entry.actorName ? ` · ${entry.actorName}` : ''}
                      </span>
                    </div>
                  ))}
                </section>
              ) : null}
            </div>
          )}
        </AsyncBoundary>
      </Drawer>

      <UnsavedChangesDialog
        open={leaving}
        pending={dirtyFields.map((field) => t(REVIEW_FIELD_LABEL[field]))}
        onStay={() => setLeaving(false)}
        onLeave={() => {
          setLeaving(false)
          onClose()
        }}
      />
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.factRow}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  )
}

/**
 * Google's answer, rendered and attributed. Nothing here is an input: the
 * server fetches these again when the place is created, so showing them as
 * boxes would invite an editor to retype facts they do not own.
 */
function ProviderFacts({
  data,
  locale,
}: {
  data: NonNullable<Awaited<ReturnType<typeof previewSubmissionProvider>>>
  locale: 'vi' | 'en'
}) {
  const t = useT()
  const candidate = data.candidate!
  const administrative = data.administrative
  return (
    <dl className={styles.facts}>
      <Fact label={t('submissions.review.name')}>{candidate.name}</Fact>
      <Fact label={t('submissions.field.address')}>{candidate.address}</Fact>
      <Fact label={t('submissions.field.coordinates')}>
        <a
          className={styles.link}
          href={`https://www.google.com/maps/search/?api=1&query=${candidate.location.lat},${candidate.location.lng}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {`${candidate.location.lat.toFixed(6)}, ${candidate.location.lng.toFixed(6)}`}
        </a>
      </Fact>
      <Fact label={t('submissions.field.rating')}>
        {candidate.googleRating != null
          ? t('submissions.ratingValue', {
              score: candidate.googleRating.toFixed(1),
              count: formatNumber(candidate.googleRatingCount ?? 0, locale),
            })
          : '—'}
      </Fact>
      <Fact label={t('submissions.field.hours')}>
        {candidate.openingHours.length > 0
          ? t('submissions.hoursCount', {
              n: String(new Set(candidate.openingHours.map((h) => h.dayOfWeek)).size),
            })
          : t('submissions.noHours')}
      </Fact>
      {administrative ? (
        <Fact label={t('submissions.field.administrative')}>
          {[
            administrative.provinceName ?? administrative.provinceCode,
            administrative.communeName ?? administrative.communeCode,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
          {administrative.status ? ` (${administrative.status})` : ''}
        </Fact>
      ) : null}
      {candidate.attributions.length > 0 ? (
        <Fact label=" ">
          <span className={styles.resultMeta}>
            {t('submissions.providerAttribution', { names: candidate.attributions.join(', ') })}
          </span>
        </Fact>
      ) : null}
    </dl>
  )
}
