import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import {
  formatDateTime,
  formatMinuteOfDay,
  formatMoneyRange,
  formatNumber,
  formatPercent,
  formatRelative,
  parseMinuteOfDay,
} from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextArea, TextInput, Toggle } from '@/shared/ui/Field'
import { Badge } from '@/shared/ui/Badge'
import { Drawer, ConfirmDialog } from '@/shared/ui/Overlay'
import { AsyncBoundary, PermissionDeniedState, useErrorMessage } from '@/shared/ui/State'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import { useToast } from '@/shared/ui/Toast'
import { CloseIcon, PlusIcon, ShieldOffIcon } from '@/shared/ui/icons'
import { UnsavedChangesDialog, UnsavedChangesGuard } from '@/shared/ui/UnsavedChangesGuard'
import { TakedownDialog } from '@/features/emergency/takedownDialog.view'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import type { PlaceHourInput, PlaceStatus, PriceUnit } from '@/shared/api/contracts'
import { toApiError, type FieldError } from '@/shared/api/errors'
import {
  addPlacePrice,
  fetchPlace,
  fetchPlaceAudit,
  mergePlace,
  setPlaceHours,
  transitionPlace,
  updatePlace,
  verifyFreshness,
} from './api'
import { PLACE_STATUSES, PLACE_TRANSITIONS } from './status'
import {
  placeIdentitySchema,
  splitFieldErrors,
  toPlaceEditBody,
  usePlaceFieldError,
  type PlaceIdentityForm,
} from './placeForm'
import { styles } from './placeEditor.style'

/**
 * `dayOfWeek` on the wire is 0 = Sunday … 6 = Saturday — the convention
 * GoGo-BE derives from `Date#getUTCDay()` in `vnDayMinute()`. 2024-01-07 is a
 * Sunday, so it is the base date the weekday labels are formatted from.
 */
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_BASE_DATE = Date.UTC(2024, 0, 7)

const PRICE_UNITS: PriceUnit[] = ['per_person', 'per_item', 'per_hour', 'per_night']

/**
 * A block is a screen area with its own request. "Đã lưu" belongs to the block
 * whose own call answered 2xx — one toast used to claim success for the whole
 * page after a single PATCH (GoGo-CMS#122).
 */
type BlockTone = 'clean' | 'dirty' | 'saved' | 'failed'

const BLOCK_DOT: Record<BlockTone, string> = {
  clean: 'bg-neutral-400',
  dirty: 'bg-amber',
  saved: 'bg-mint',
  failed: 'bg-danger',
}

/** Colour is never the only signal, so each tone also carries a glyph. */
const BLOCK_GLYPH: Record<BlockTone, string> = {
  clean: '•',
  dirty: '●',
  saved: '✓',
  failed: '⚠',
}

/** What a rejected save leaves behind for the operator to act on. */
type BlockError = { message: string; requestId: string; unmapped: FieldError[] }

/**
 * What the editor holds while a week is being edited. `source` and `verifiedAt`
 * are read-only server stamps, so a row typed here has neither until it is
 * saved — the row says "not saved yet" rather than borrowing a provenance it
 * does not have.
 */
type HourDraft = PlaceHourInput & { source?: string; verifiedAt?: string | null }

export default function PlaceEditorScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const label = useLabel()
  const describeError = useErrorMessage()

  const describeField = usePlaceFieldError()

  const canWrite = can('place.write')
  const [auditOpen, setAuditOpen] = useState(false)
  const [takedownOpen, setTakedownOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string } | null>(null)
  const [hours, setHours] = useState<HourDraft[]>([])
  const [hoursBaseline, setHoursBaseline] = useState<string | null>(null)
  const [taxonomyIds, setTaxonomyIds] = useState<string[]>([])
  const [taxonomyBaseline, setTaxonomyBaseline] = useState<string | null>(null)
  const [identityError, setIdentityError] = useState<BlockError | null>(null)
  const [hoursError, setHoursError] = useState<BlockError | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [identitySavedAt, setIdentitySavedAt] = useState<string | null>(null)
  const [hoursSavedAt, setHoursSavedAt] = useState<string | null>(null)
  const [newPrice, setNewPrice] = useState({
    priceMin: '',
    priceMax: '',
    unit: 'per_person' as PriceUnit,
  })

  const placeQuery = useQuery({
    queryKey: queryKeys.places.detail(id),
    queryFn: ({ signal }) => fetchPlace(id, signal),
    enabled: Boolean(id),
  })

  const taxonomyQuery = useQuery({
    // Only active keys are offered as a choice; a deactivated key already on
    // the place still resolves below, because the chip reads from this list.
    queryKey: queryKeys.taxonomies.all,
    queryFn: ({ signal }) => fetchTaxonomies({}, signal),
    staleTime: 300_000,
  })

  const auditQuery = useQuery({
    queryKey: queryKeys.places.audit(id),
    queryFn: ({ signal }) => fetchPlaceAudit(id, null, signal),
    enabled: auditOpen && Boolean(id),
  })

  const form = useForm<PlaceIdentityForm>({ resolver: zodResolver(placeIdentitySchema) })
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = form

  const place = placeQuery.data

  const hoursDirty = useMemo(
    () => hoursBaseline !== null && hoursSignature(hours) !== hoursBaseline,
    [hours, hoursBaseline],
  )
  const taxonomyDirty = useMemo(
    () => taxonomyBaseline !== null && taxonomySignature(taxonomyIds) !== taxonomyBaseline,
    [taxonomyIds, taxonomyBaseline],
  )
  // Taxonomy travels in the identity PATCH, so it belongs to that block.
  const identityDirty = isDirty || taxonomyDirty

  /*
   * The two blocks are refreshed independently.
   *
   * Every mutation on this screen invalidates the place, so before the split a
   * successful *hours* save refetched the detail and `reset()` threw away
   * whatever the editor had typed in the identity fields. A block only takes
   * server values when it has nothing of its own at stake.
   */
  const identityDirtyRef = useRef(false)
  identityDirtyRef.current = identityDirty
  const hoursDirtyRef = useRef(false)
  hoursDirtyRef.current = hoursDirty
  const identityAppliedRef = useRef('')
  const hoursAppliedRef = useRef('')

  useEffect(() => {
    if (!place) return
    const revision = `${place.id}:${place.updatedAt}`
    if (identityAppliedRef.current === revision) return
    if (identityAppliedRef.current !== '' && identityDirtyRef.current) return
    identityAppliedRef.current = revision
    reset({
      name: place.name,
      addressText: place.addressText ?? '',
      areaKey: place.areaKey ?? '',
      description: place.description ?? '',
      avgVisitMinutes: place.avgVisitMinutes ?? undefined,
      lat: place.lat ?? undefined,
      lng: place.lng ?? undefined,
    })
    setTaxonomyIds(place.taxonomyIds)
    setTaxonomyBaseline(taxonomySignature(place.taxonomyIds))
  }, [place, reset])

  useEffect(() => {
    if (!place) return
    const revision = `${place.id}:${place.updatedAt}`
    if (hoursAppliedRef.current === revision) return
    if (hoursAppliedRef.current !== '' && hoursDirtyRef.current) return
    hoursAppliedRef.current = revision
    setHours(place.hours)
    setHoursBaseline(hoursSignature(place.hours))
  }, [place])

  const taxonomyById = useMemo(() => {
    const map = new Map<string, { key: string; labels: Record<string, string> }>()
    for (const item of taxonomyQuery.data ?? []) map.set(item.id, item)
    return map
  }, [taxonomyQuery.data])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.places.detail(id) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
  }

  /** Everything a rejected save gives the operator, request id included. */
  const asBlockError = useCallback(
    (error: unknown, unmapped?: FieldError[]): BlockError => {
      const apiError = toApiError(error)
      return {
        message: describeError(apiError),
        requestId: apiError.requestId,
        unmapped: unmapped ?? apiError.fieldErrors,
      }
    },
    [describeError],
  )

  const saveIdentity = useMutation({
    mutationFn: (values: PlaceIdentityForm) =>
      updatePlace(id, toPlaceEditBody(values, taxonomyIds)),
    onSuccess: (_result, values) => {
      setIdentityError(null)
      setIdentitySavedAt(new Date().toISOString())
      // Keep exactly what was typed, but stop calling it unsaved.
      reset(values)
      setTaxonomyBaseline(taxonomySignature(taxonomyIds))
      toast.success(t('placeEditor.savedIdentity'))
      invalidate()
    },
    onError: (error) => {
      const apiError = toApiError(error)
      const { mapped, unmapped } = splitFieldErrors(apiError.fieldErrors)
      // Every rejected field lands back on its own control; the first one takes
      // focus, so the fix starts where the problem is.
      mapped.forEach((fieldError, index) =>
        setError(
          fieldError.field,
          { type: fieldError.code, message: fieldError.message },
          { shouldFocus: index === 0 },
        ),
      )
      setIdentitySavedAt(null)
      setIdentityError(asBlockError(apiError, unmapped))
      toast.error(describeError(apiError), apiError.requestId || undefined)
    },
  })

  const saveHours = useMutation({
    mutationFn: () => setPlaceHours(id, hours),
    onSuccess: () => {
      setHoursError(null)
      setHoursSavedAt(new Date().toISOString())
      setHoursBaseline(hoursSignature(hours))
      toast.success(t('placeEditor.savedHours'))
      invalidate()
    },
    onError: (error) => {
      setHoursSavedAt(null)
      setHoursError(asBlockError(error))
      toast.error(describeError(error), toApiError(error).requestId || undefined)
    },
  })

  const addPrice = useMutation({
    mutationFn: () =>
      addPlacePrice(id, {
        // Minor units in, minor units out. No float maths anywhere.
        priceMin: Number.parseInt(newPrice.priceMin, 10),
        priceMax: Number.parseInt(newPrice.priceMax, 10),
        unit: newPrice.unit,
      }),
    onSuccess: () => {
      setNewPrice({ priceMin: '', priceMax: '', unit: 'per_person' })
      toast.success(t('placeEditor.addPrice'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changeStatus = useMutation({
    mutationFn: (status: PlaceStatus) => transitionPlace(id, status),
    onSuccess: (_result, status) => {
      setStatusError(null)
      toast.success(t('placeEditor.statusChanged', { status: t(`placeStatus.${status}` as const) }))
      invalidate()
    },
    onError: (error) => {
      setStatusError(describeError(error))
      toast.error(describeError(error), toApiError(error).requestId || undefined)
    },
  })

  const freshness = useMutation({
    mutationFn: () => verifyFreshness(id),
    onSuccess: () => {
      toast.success(t('placeEditor.verifyFreshness'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const merge = useMutation({
    mutationFn: (duplicateId: string) => mergePlace(id, duplicateId),
    onSuccess: () => {
      toast.success(t('placeEditor.merge'))
      setMergeTarget(null)
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  /** Vietnamese text for a field the form — or the server — rejected. */
  const fieldError = (name: keyof PlaceIdentityForm): string | undefined => {
    const error = errors[name]
    if (!error) return undefined
    return describeField(name, {
      code: String(error.type ?? ''),
      message: String(error.message ?? ''),
    })
  }

  const pendingBlocks = [
    ...(identityDirty ? [t('placeEditor.identity')] : []),
    ...(hoursDirty ? [t('placeEditor.hours')] : []),
  ]

  const leave = () => {
    setLeaveOpen(false)
    navigate('/places')
  }

  if (!can('place.read')) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: t('places.breadcrumb'), to: '/places' }]}
          title={t('placeEditor.identity')}
        />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('places.breadcrumb'), to: '/places' },
          { label: t('action.edit') },
        ]}
        title={place?.name ?? t('placeEditor.breadcrumb')}
        showSearch={false}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAuditOpen(true)}>
              {t('action.viewAudit')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              iconLeft={<ShieldOffIcon size={14} />}
              // Break-glass: any active admin, but only from `published`.
              disabled={!can('emergency.takedown') || place?.status !== 'published' || !online}
              title={
                place?.status !== 'published'
                  ? t('emergency.notApplicable', { from: 'published' })
                  : undefined
              }
              onClick={() => setTakedownOpen(true)}
            >
              {t('emergency.action')}
            </Button>
          </div>
        }
      />
      <PageBody>
        <AsyncBoundary
          status={placeQuery.status}
          error={placeQuery.error}
          data={place}
          onRetry={() => void placeQuery.refetch()}
        >
          {(detail) => (
            <form
              onSubmit={handleSubmit((values) => {
                setIdentityError(null)
                saveIdentity.mutate(values)
              })}
            >
              <div className={styles.grid}>
                <div className={styles.main}>
                  <Card>
                    <CardHeader
                      title={t('placeEditor.identity')}
                      actions={
                        <BlockState
                          tone={blockTone(identityDirty, identityError, identitySavedAt)}
                          text={blockText(
                            t,
                            locale,
                            identityDirty,
                            identityError,
                            identitySavedAt,
                            detail.updatedAt,
                          )}
                        />
                      }
                    />
                    <CardBody className="flex flex-col gap-4">
                      {identityError ? (
                        <SaveErrorPanel
                          title={t('placeEditor.saveRejected')}
                          error={identityError}
                        />
                      ) : null}
                      <div className={styles.fieldRow}>
                        <TextInput
                          label={t('placeEditor.name')}
                          required
                          disabled={!canWrite}
                          error={fieldError('name')}
                          {...register('name')}
                        />
                        <Select
                          label={t('placeEditor.status')}
                          value={detail.status}
                          // Only the transitions `cms-catalog.service.ts` accepts
                          // are offered: the list used to carry every status, so
                          // a draft could be sent straight to `published` and
                          // come back 409 INVALID_PLACE_TRANSITION.
                          disabled={
                            !can('place.transition') ||
                            !online ||
                            changeStatus.isPending ||
                            PLACE_TRANSITIONS[detail.status].length === 0
                          }
                          hint={
                            PLACE_TRANSITIONS[detail.status].length === 0
                              ? t('placeEditor.statusTerminal')
                              : t('placeEditor.statusHint')
                          }
                          error={statusError ?? undefined}
                          onChange={(event) =>
                            changeStatus.mutate(event.target.value as PlaceStatus)
                          }
                        >
                          {PLACE_STATUSES.filter(
                            (status) =>
                              status === detail.status ||
                              PLACE_TRANSITIONS[detail.status].includes(status),
                          ).map((status) => (
                            <option key={status} value={status}>
                              {t(`placeStatus.${status}` as const)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className={styles.fieldRow}>
                        <TextInput
                          label={t('placeEditor.address')}
                          disabled={!canWrite}
                          error={fieldError('addressText')}
                          {...register('addressText')}
                        />
                        <TextInput
                          label={t('placeEditor.areaKey')}
                          hint={t('placeEditor.taxonomyHint')}
                          disabled={!canWrite}
                          error={fieldError('areaKey')}
                          {...register('areaKey')}
                        />
                      </div>
                      <TextArea
                        label={t('placeEditor.description')}
                        rows={4}
                        disabled={!canWrite}
                        error={fieldError('description')}
                        {...register('description')}
                      />
                      <div className={styles.fieldRow}>
                        <TextInput
                          label={t('placeEditor.avgVisit')}
                          type="number"
                          inputMode="numeric"
                          hint={t('placeEditor.avgVisitHint')}
                          disabled={!canWrite}
                          error={fieldError('avgVisitMinutes')}
                          {...register('avgVisitMinutes')}
                        />
                        <div className="flex items-end gap-2">
                          <Badge tone="neutral">
                            {t('placeEditor.sources')}: {detail.sources.length}
                          </Badge>
                          <Badge tone={detail.freshnessCheckedAt ? 'mint' : 'amber'}>
                            {detail.freshnessCheckedAt
                              ? formatRelative(detail.freshnessCheckedAt, locale)
                              : t('places.freshness.never')}
                          </Badge>
                        </div>
                      </div>
                      {/*
                        Phone, website and price level are provider facts: the
                        catalog reads them but `cmsUpdatePlace` does not accept
                        them, so an editable-looking field here would be a lie.
                      */}
                      <dl className={styles.factGrid}>
                        <div>
                          <dt className={styles.factLabel}>{t('placeEditor.phone')}</dt>
                          <dd className={styles.factValue}>{detail.phone ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className={styles.factLabel}>{t('placeEditor.website')}</dt>
                          <dd className={styles.factValue}>
                            {detail.website ? (
                              <a
                                className={styles.factLink}
                                href={detail.website}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {detail.website}
                              </a>
                            ) : (
                              '—'
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className={styles.factLabel}>{t('placeEditor.priceLevel')}</dt>
                          <dd className={styles.factValue}>
                            {/* The glyphs alone are hard to count at a glance. */}
                            {detail.priceLevel == null
                              ? '—'
                              : `${'₫'.repeat(detail.priceLevel || 1)} · ${detail.priceLevel}/4`}
                          </dd>
                        </div>
                        <div>
                          <dt className={styles.factLabel}>{t('placeEditor.confidence')}</dt>
                          <dd className={styles.factValue}>
                            {formatPercent(detail.confidence, locale)}
                          </dd>
                        </div>
                      </dl>
                      {/*
                        Two ratings, never averaged: they count different
                        populations (FR-INGEST-006). The composite score the
                        spec mentions is computed nowhere yet, so there is no
                        third figure to show.
                      */}
                      <div className={styles.ratingRow}>
                        <div className={styles.ratingCard}>
                          <span className={styles.factLabel}>
                            {t('placeEditor.ratingProvider')}
                          </span>
                          <span className={styles.ratingValue}>
                            {detail.ratings.provider.rating == null
                              ? '—'
                              : formatNumber(detail.ratings.provider.rating, locale)}
                          </span>
                          <span className={styles.factLabel}>
                            {t('placeEditor.ratingCount', {
                              count: formatNumber(detail.ratings.provider.count, locale),
                            })}
                          </span>
                        </div>
                        <div className={styles.ratingCard}>
                          <span className={styles.factLabel}>{t('placeEditor.ratingGogo')}</span>
                          <span className={styles.ratingValue}>
                            {detail.ratings.gogo.rating == null
                              ? '—'
                              : formatNumber(detail.ratings.gogo.rating, locale)}
                          </span>
                          <span className={styles.factLabel}>
                            {t('placeEditor.ratingCount', {
                              count: formatNumber(detail.ratings.gogo.count, locale),
                            })}
                          </span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title={t('placeEditor.taxonomy')}
                      hint={t('placeEditor.taxonomyHint')}
                    />
                    <CardBody className="flex flex-col gap-3">
                      <div className={styles.tagRow}>
                        {taxonomyIds.map((taxonomyId) => {
                          const taxonomy = taxonomyById.get(taxonomyId)
                          return (
                            <span key={taxonomyId} className={styles.tag}>
                              {taxonomy?.labels[locale] ?? taxonomy?.key ?? taxonomyId}
                              {canWrite ? (
                                <button
                                  type="button"
                                  aria-label={`${t('action.delete')} ${taxonomy?.key ?? taxonomyId}`}
                                  className={styles.tagRemove}
                                  onClick={() =>
                                    setTaxonomyIds((current) =>
                                      current.filter((value) => value !== taxonomyId),
                                    )
                                  }
                                >
                                  <CloseIcon size={10} />
                                </button>
                              ) : null}
                            </span>
                          )
                        })}
                      </div>
                      <Select
                        label={t('placeEditor.addTaxonomy')}
                        value=""
                        disabled={!canWrite}
                        onChange={(event) => {
                          const value = event.target.value
                          if (value)
                            setTaxonomyIds((current) => Array.from(new Set([...current, value])))
                        }}
                      >
                        <option value="">—</option>
                        {(taxonomyQuery.data ?? [])
                          .filter(
                            (taxonomy) => taxonomy.isActive && !taxonomyIds.includes(taxonomy.id),
                          )
                          .map((taxonomy) => (
                            <option key={taxonomy.id} value={taxonomy.id}>
                              {t(`taxonomyKind.${taxonomy.kind}` as const)} ·{' '}
                              {taxonomy.labels[locale] ?? taxonomy.key}
                            </option>
                          ))}
                      </Select>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title={t('placeEditor.prices')}
                      hint={t('placeEditor.providerNote')}
                      actions={
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            !canWrite || !online || !newPrice.priceMin || !newPrice.priceMax
                          }
                          loading={addPrice.isPending}
                          onClick={() => addPrice.mutate()}
                          iconLeft={<PlusIcon size={14} />}
                        >
                          {t('placeEditor.addPrice')}
                        </Button>
                      }
                    />
                    <CardBody>
                      {detail.prices.length === 0 ? (
                        <p className="text-xs text-text-subtle">{t('state.emptyHint')}</p>
                      ) : (
                        <ul>
                          {detail.prices.map((price) => (
                            <li key={price.id} className={styles.priceRow}>
                              <span className={styles.priceValue}>
                                {formatMoneyRange(
                                  price.priceMin,
                                  price.priceMax,
                                  price.currency,
                                  locale,
                                )}{' '}
                                <span className="font-normal text-text-muted">
                                  {/* Unit is free-form on read; an unknown one shows its key. */}/{' '}
                                  {label(`priceUnit.${price.unit}`, price.unit)}
                                </span>
                              </span>
                              <span className={styles.priceMeta}>
                                {price.source} · {t('placeEditor.confidenceShort')}{' '}
                                {formatPercent(price.confidence, locale)} ·{' '}
                                {price.verifiedAt
                                  ? formatDateTime(price.verifiedAt, locale)
                                  : t('placeEditor.unverified')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <TextInput
                          label={t('placeEditor.priceMin')}
                          inputMode="numeric"
                          disabled={!canWrite}
                          value={newPrice.priceMin}
                          onChange={(event) =>
                            setNewPrice((p) => ({ ...p, priceMin: event.target.value }))
                          }
                        />
                        <TextInput
                          label={t('placeEditor.priceMax')}
                          inputMode="numeric"
                          disabled={!canWrite}
                          value={newPrice.priceMax}
                          onChange={(event) =>
                            setNewPrice((p) => ({ ...p, priceMax: event.target.value }))
                          }
                        />
                        <Select
                          label={t('placeEditor.priceUnit')}
                          disabled={!canWrite}
                          value={newPrice.unit}
                          onChange={(event) =>
                            setNewPrice((p) => ({ ...p, unit: event.target.value as PriceUnit }))
                          }
                        >
                          {PRICE_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {t(`priceUnit.${unit}` as const)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </CardBody>
                  </Card>
                </div>

                <div className={styles.side}>
                  <Card>
                    <CardHeader title={t('placeEditor.geo')} />
                    <CardBody>
                      <div className={styles.mapFrame}>
                        <span className={styles.mapPin} aria-hidden="true" />
                        {/* Exact origin coordinates are operator data, not a public map. */}
                        <span className={styles.mapNote}>
                          {detail.lat?.toFixed(5) ?? '—'}, {detail.lng?.toFixed(5) ?? '—'}
                        </span>
                      </div>
                      <div className={styles.fieldRow}>
                        <TextInput
                          label={t('placeEditor.lat')}
                          inputMode="decimal"
                          disabled={!canWrite}
                          error={fieldError('lat')}
                          {...register('lat')}
                        />
                        <TextInput
                          label={t('placeEditor.lng')}
                          inputMode="decimal"
                          disabled={!canWrite}
                          error={fieldError('lng')}
                          {...register('lng')}
                        />
                      </div>
                      <p className={styles.attribution}>{t('placeEditor.geoHint')}</p>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title={t('placeEditor.hours')}
                      hint={t('placeEditor.hoursHint')}
                      actions={
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!canWrite || !online}
                          loading={saveHours.isPending}
                          onClick={() => {
                            setHoursError(null)
                            saveHours.mutate()
                          }}
                        >
                          {t('action.save')}
                        </Button>
                      }
                    />
                    <CardBody>
                      <div className="mb-2">
                        <BlockState
                          tone={blockTone(hoursDirty, hoursError, hoursSavedAt)}
                          text={blockText(
                            t,
                            locale,
                            hoursDirty,
                            hoursError,
                            hoursSavedAt,
                            detail.updatedAt,
                          )}
                        />
                      </div>
                      {hoursError ? (
                        <SaveErrorPanel title={t('placeEditor.hoursRejected')} error={hoursError} />
                      ) : null}
                      {DAY_KEYS.map((dayKey, dayIndex) => {
                        const entry = hours.find((hour) => hour.dayOfWeek === dayIndex)
                        return (
                          <div key={dayKey} className={styles.hoursRow}>
                            <span className={styles.dayLabel}>
                              {new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
                                weekday: 'short',
                                timeZone: 'UTC',
                              }).format(new Date(WEEKDAY_BASE_DATE + dayIndex * 86_400_000))}
                            </span>
                            <input
                              className={styles.timeInput}
                              aria-label={`${dayKey} open`}
                              disabled={!canWrite}
                              value={entry ? formatMinuteOfDay(entry.openMinute) : ''}
                              placeholder={t('placeEditor.closed')}
                              onChange={(event) => {
                                const minute = parseMinuteOfDay(event.target.value)
                                if (minute == null) return
                                setHours((current) =>
                                  upsertHour(current, dayIndex, { openMinute: minute }),
                                )
                              }}
                            />
                            <input
                              className={styles.timeInput}
                              aria-label={`${dayKey} close`}
                              disabled={!canWrite}
                              value={entry ? formatMinuteOfDay(entry.closeMinute) : ''}
                              placeholder={t('placeEditor.closed')}
                              onChange={(event) => {
                                const minute = parseMinuteOfDay(event.target.value)
                                if (minute == null) return
                                setHours((current) =>
                                  upsertHour(current, dayIndex, { closeMinute: minute }),
                                )
                              }}
                            />
                            <Toggle
                              label={`${dayKey} ${t('placeEditor.overnight')}`}
                              checked={entry?.isOvernight ?? false}
                              disabled={!canWrite || !entry}
                              onChange={(checked) =>
                                setHours((current) =>
                                  upsertHour(current, dayIndex, { isOvernight: checked }),
                                )
                              }
                            />
                            {entry ? (
                              <p className={styles.hourMeta}>
                                {entry.source
                                  ? t('placeEditor.hoursSource', {
                                      source: entry.source,
                                      time: entry.verifiedAt
                                        ? formatDateTime(entry.verifiedAt, locale)
                                        : t('placeEditor.unverified'),
                                    })
                                  : t('placeEditor.hoursUnsaved')}
                              </p>
                            ) : null}
                          </div>
                        )
                      })}
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader title={t('placeEditor.media')} />
                    <CardBody>
                      {/*
                        The API returns a storage key and a moderation state,
                        not a display URL, and there is no CMS route that
                        uploads or attaches one. So this lists what exists and
                        what state it is in; it does not offer an add button
                        that could only fail. Tracked in the README.
                      */}
                      {detail.media.length === 0 ? (
                        <p className="text-xs text-text-subtle">{t('placeEditor.mediaEmpty')}</p>
                      ) : (
                        <ul className={styles.mediaRow}>
                          {detail.media.map((media) => (
                            <li key={media.id} className={styles.mediaItem}>
                              <span className={styles.mediaKey}>{media.storageKey}</span>
                              <span className="flex shrink-0 items-center gap-2">
                                {media.width && media.height ? (
                                  <span className={styles.mediaDims}>
                                    {media.width}×{media.height}
                                  </span>
                                ) : null}
                                <Badge
                                  tone={
                                    media.moderation === 'approved'
                                      ? 'mint'
                                      : media.moderation === 'rejected'
                                        ? 'danger'
                                        : 'amber'
                                  }
                                >
                                  {label(`mediaModeration.${media.moderation}`, media.moderation)}
                                </Badge>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className={styles.attribution}>{t('placeEditor.mediaAttribution')}</p>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader title={t('placeEditor.sources')} />
                    <CardBody>
                      {detail.sources.length === 0 ? (
                        <p className="text-xs text-text-subtle">{t('state.emptyHint')}</p>
                      ) : (
                        <ul>
                          {detail.sources.map((source) => (
                            <li key={source.id} className={styles.sourceRow}>
                              <span className="min-w-0">
                                <span className="font-semibold text-text">{source.provider}</span>
                                <span className="block font-mono text-[11px] text-text-subtle">
                                  {source.externalId}
                                </span>
                                {/* FR-INGEST-014: provider facts travel with their attribution. */}
                                {source.attribution ? (
                                  <span className="block text-[11px] text-text-subtle">
                                    {source.attribution}
                                  </span>
                                ) : null}
                                {source.url ? (
                                  <a
                                    className={styles.sourceLink}
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                  >
                                    {source.url}
                                  </a>
                                ) : null}
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-text-subtle">
                                {formatRelative(source.fetchedAt, locale)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="secondary"
                        disabled={!can('place.verifyFreshness') || !online}
                        loading={freshness.isPending}
                        onClick={() => freshness.mutate()}
                      >
                        {t('placeEditor.verifyFreshness')}
                      </Button>
                    </CardBody>
                  </Card>
                </div>
              </div>

              <div className={`${styles.saveBar} mt-5`}>
                <BlockState
                  tone={blockTone(identityDirty, identityError, identitySavedAt)}
                  text={blockText(
                    t,
                    locale,
                    identityDirty,
                    identityError,
                    identitySavedAt,
                    detail.updatedAt,
                  )}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => (pendingBlocks.length > 0 ? setLeaveOpen(true) : leave())}
                  >
                    {t('action.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!canWrite || !online}
                    loading={saveIdentity.isPending}
                  >
                    {saveIdentity.isPending ? t('action.saving') : t('placeEditor.saveIdentity')}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </AsyncBoundary>
      </PageBody>

      <Drawer
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        title={t('audit.title')}
        description={place?.name}
      >
        <AsyncBoundary
          status={auditQuery.status}
          error={auditQuery.error}
          data={auditQuery.data?.items ?? []}
          onRetry={() => void auditQuery.refetch()}
        >
          {(entries) => <AuditTrail entries={entries} />}
        </AsyncBoundary>
      </Drawer>

      <TakedownDialog
        open={takedownOpen}
        onClose={() => setTakedownOpen(false)}
        target="place"
        resourceId={id}
        resourceLabel={place?.name}
      />

      <ConfirmDialog
        open={mergeTarget !== null}
        onClose={() => setMergeTarget(null)}
        onConfirm={() => mergeTarget && merge.mutate(mergeTarget.id)}
        title={t('duplicates.mergePreview')}
        description={t('duplicates.mergeExplain')}
        changes={
          mergeTarget
            ? [
                { label: t('duplicates.moves'), from: mergeTarget.name, to: place?.name ?? '' },
                { label: t('duplicates.archived'), to: t('placeStatus.archived') },
              ]
            : []
        }
        confirmLabel={t('duplicates.mergeConfirm')}
        tone="primary"
        loading={merge.isPending}
      />

      {/* Reload, tab close, and any in-app navigation the router owns. */}
      <UnsavedChangesGuard when={pendingBlocks.length > 0} pending={pendingBlocks} />
      {/* The screen's own exit, which the router blocker cannot see under a
          non-data router (and which reads better as a direct question). */}
      <UnsavedChangesDialog
        open={leaveOpen}
        pending={pendingBlocks}
        onStay={() => setLeaveOpen(false)}
        onLeave={leave}
      />
    </>
  )
}

function BlockState({ tone, text }: { tone: BlockTone; text: string }) {
  return (
    <p className={styles.saveState}>
      <span className={`${styles.dot} ${BLOCK_DOT[tone]}`} aria-hidden="true" />
      <span aria-hidden="true">{BLOCK_GLYPH[tone]}</span>
      {text}
    </p>
  )
}

function blockTone(dirty: boolean, error: BlockError | null, savedAt: string | null): BlockTone {
  if (error) return 'failed'
  if (dirty) return 'dirty'
  return savedAt ? 'saved' : 'clean'
}

function blockText(
  t: ReturnType<typeof useT>,
  locale: 'vi' | 'en',
  dirty: boolean,
  error: BlockError | null,
  savedAt: string | null,
  updatedAt: string,
): string {
  if (error) return t('placeEditor.blockFailed')
  if (dirty) return t('placeEditor.unsaved')
  // "Đã lưu" is only ever this block's own answer; anything else is the row's
  // last server-side change, which is a different claim and says so.
  if (savedAt) return t('placeEditor.saved', { time: formatRelative(savedAt, locale) })
  return t('placeEditor.lastChanged', { time: formatRelative(updatedAt, locale) })
}

/**
 * What the server refused, in Vietnamese, plus the `request_id` — the one
 * string an operator can hand to whoever reads the logs.
 */
function SaveErrorPanel({ title, error }: { title: string; error: BlockError }) {
  const t = useT()
  const describeField = usePlaceFieldError()
  return (
    <div role="alert" className={styles.errorPanel}>
      <p className={styles.errorTitle}>
        <span aria-hidden="true">⚠</span> {title}
      </p>
      <p className={styles.errorText}>{error.message}</p>
      {error.unmapped.length > 0 ? (
        // A path this form has no control for is still shown: an error nobody
        // renders leaves an editor staring at a form that looks fine.
        <ul className={styles.errorList}>
          {error.unmapped.map((fieldError) => (
            <li key={`${fieldError.field}:${fieldError.code}`}>
              <span className={styles.errorField}>{fieldError.field}</span>{' '}
              {describeField(fieldError.field, fieldError)}
            </li>
          ))}
        </ul>
      ) : null}
      {error.requestId ? (
        <p className={styles.errorText}>
          {t('placeEditor.requestId')} <code className={styles.requestId}>{error.requestId}</code>
        </p>
      ) : null}
    </div>
  )
}

/** Order-independent identity of a week, so "changed" means changed. */
function hoursSignature(rows: HourDraft[]): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((hour) => [hour.dayOfWeek, hour.openMinute, hour.closeMinute, hour.isOvernight]),
  )
}

function taxonomySignature(ids: string[]): string {
  return [...ids].sort().join(',')
}

function upsertHour(
  current: HourDraft[],
  dayOfWeek: number,
  patch: Partial<HourDraft>,
): HourDraft[] {
  const existing = current.find((hour) => hour.dayOfWeek === dayOfWeek)
  if (!existing) {
    return [
      ...current,
      { dayOfWeek, openMinute: 480, closeMinute: 1320, isOvernight: false, ...patch },
    ].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  }
  return current.map((hour) => (hour.dayOfWeek === dayOfWeek ? { ...hour, ...patch } : hour))
}
