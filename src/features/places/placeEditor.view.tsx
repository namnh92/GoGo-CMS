import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm, useWatch, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import {
  formatDateTime,
  formatMoneyRange,
  formatNumber,
  formatPercent,
  formatRelative,
} from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import { Badge } from '@/shared/ui/Badge'
import { Drawer, ConfirmDialog, type ChangeLine } from '@/shared/ui/Overlay'
import { AsyncBoundary, PermissionDeniedState, useErrorMessage } from '@/shared/ui/State'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import { useToast } from '@/shared/ui/Toast'
import { CloseIcon, PlusIcon, ShieldOffIcon } from '@/shared/ui/icons'
import { UnsavedChangesDialog, UnsavedChangesGuard } from '@/shared/ui/UnsavedChangesGuard'
import { TakedownDialog } from '@/features/emergency/takedownDialog.view'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import type {
  CmsPlaceDetail,
  PlaceProvenance,
  PlaceStatus,
  PriceUnit,
} from '@/shared/api/contracts'
import { ApiError, toApiError, type FieldError } from '@/shared/api/errors'
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
import { PlaceMediaCard } from './placeMedia.view'
import { PLACE_STATUSES, PLACE_TRANSITIONS } from './status'
import { AdministrativeUnitCombobox } from '@/features/administrative/unitCombobox'
import { AdministrativeSummary } from './placeAdministrative.view'
import { AreaCombobox } from './areaCombobox'
import { HoursEditor } from './hoursEditor.view'
import { GoogleLinkPanel } from './googleLink.view'
import { PlaceLocationPanel } from './placeLocation.view'
import { PublishChecklist } from './publishChecklist.view'
import { emptyWeek, parseWeek, weekFromServer, weekSignature, type WeekDraft } from './hoursModel'
import {
  diffAgainstServer,
  placeIdentitySchema,
  splitFieldErrors,
  toPlaceEditBody,
  usePlaceFieldError,
  type PlaceEditBaseline,
  type PlaceIdentityForm,
  numberFieldRegister,
} from './placeForm'
import { styles } from './placeEditor.style'

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
 * The fields `place_field_provenance` records an origin for (GoGo-BE#425).
 *
 * A field missing from the map has **no recorded origin**, which is a fact in
 * its own right and gets said in words. Filling it in with "GoGo" would
 * manufacture exactly the claim the map exists to keep honest.
 */
const PROVENANCE_FIELDS = [
  { name: 'name', labelKey: 'placeEditor.name' },
  { name: 'description', labelKey: 'placeEditor.description' },
  { name: 'addressText', labelKey: 'placeEditor.address' },
  { name: 'areaKey', labelKey: 'placeEditor.areaKey' },
  // Legacy free text. Still provenance-tracked because existing rows carry a
  // recorded origin for them, and dropping the row would lose that history.
  { name: 'city', labelKey: 'placeEditor.city' },
  { name: 'district', labelKey: 'placeEditor.district' },
  { name: 'phone', labelKey: 'placeEditor.phone' },
  { name: 'website', labelKey: 'placeEditor.website' },
] as const

/** Only a stored `http(s)` URL is rendered as a link — never a typed fragment. */
function isStoredWebUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

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
  /**
   * GoGo-CMS#124 — the week as a form holds it: per day, with the typed string
   * kept until save. `HoursEditor` owns the shape; see `hoursModel.ts` for why
   * it is not the wire's flat row list.
   */
  const [week, setWeek] = useState<WeekDraft>(() => emptyWeek())
  const [hoursBaseline, setHoursBaseline] = useState<string | null>(null)
  const [hoursFieldErrors, setHoursFieldErrors] = useState<FieldError[]>([])
  const [taxonomyIds, setTaxonomyIds] = useState<string[]>([])
  const [taxonomyBaseline, setTaxonomyBaseline] = useState<string | null>(null)
  const [identityError, setIdentityError] = useState<BlockError | null>(null)
  const [hoursError, setHoursError] = useState<BlockError | null>(null)
  /** What the identity form was loaded from — the other half of every diff. */
  const [identityBaseline, setIdentityBaseline] = useState<PlaceEditBaseline | null>(null)
  /** Set by a `409 PLACE_MODIFIED`; carries the server's current `updatedAt`. */
  const [conflict, setConflict] = useState<{ serverUpdatedAt: string } | null>(null)
  const [reloadOpen, setReloadOpen] = useState(false)
  /** What reloading would discard — named, so the dialog is not a bare "sure?". */
  const [reloadChanges, setReloadChanges] = useState<ChangeLine[]>([])
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

  /*
   * The area picker groups by city, so the city currently in the form floats
   * its own areas to the top. It is a hint, not a server filter: `city` is
   * free text an editor may have spelled differently from the catalog, and
   * filtering on a typo would hide the rows the picker exists to offer.
   */
  const cityValue = useWatch({ control: form.control, name: 'city' })
  /** ADM-106 — the commune list is fetched for whichever province is chosen. */
  const provinceCodeValue = useWatch({ control: form.control, name: 'provinceCode' }) ?? ''

  const hoursDirty = useMemo(
    () => hoursBaseline !== null && weekSignature(week) !== hoursBaseline,
    [week, hoursBaseline],
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

  /**
   * Take the server's values, and remember them as the baseline.
   *
   * The baseline is what makes `null` sayable: a box that is empty *now* only
   * means "clear this field" if it had something in it when the form loaded.
   * It also carries the `updatedAt` every save sends back as
   * `expectedUpdatedAt`.
   */
  const applyIdentity = useCallback(
    (detail: CmsPlaceDetail) => {
      const values: PlaceIdentityForm = {
        name: detail.name,
        addressText: detail.addressText ?? '',
        areaKey: detail.areaKey ?? '',
        city: detail.city ?? '',
        district: detail.district ?? '',
        // ADM-106 — the stored pair, preselected so an edit starts from what
        // the place actually claims rather than from empty boxes.
        provinceCode: detail.administrative?.provinceCode ?? '',
        communeCode: detail.administrative?.communeCode ?? '',
        // Whatever the server normalized the last save to — E.164, `https://…`.
        phone: detail.phone ?? '',
        website: detail.website ?? '',
        description: detail.description ?? '',
        avgVisitMinutes: detail.avgVisitMinutes ?? undefined,
        lat: detail.lat ?? undefined,
        lng: detail.lng ?? undefined,
      }
      identityAppliedRef.current = `${detail.id}:${detail.updatedAt}`
      reset(values)
      setTaxonomyIds(detail.taxonomyIds)
      setTaxonomyBaseline(taxonomySignature(detail.taxonomyIds))
      setIdentityBaseline({
        values,
        taxonomyIds: detail.taxonomyIds,
        updatedAt: detail.updatedAt,
      })
    },
    [reset],
  )

  useEffect(() => {
    if (!place) return
    const revision = `${place.id}:${place.updatedAt}`
    if (identityAppliedRef.current === revision) return
    if (identityAppliedRef.current !== '' && identityDirtyRef.current) return
    applyIdentity(place)
  }, [place, applyIdentity])

  useEffect(() => {
    if (!place) return
    const revision = `${place.id}:${place.updatedAt}`
    if (hoursAppliedRef.current === revision) return
    if (hoursAppliedRef.current !== '' && hoursDirtyRef.current) return
    hoursAppliedRef.current = revision
    const draft = weekFromServer(place.hours)
    setWeek(draft)
    setHoursBaseline(weekSignature(draft))
    setHoursFieldErrors([])
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
    mutationFn: ({
      values,
      baseline,
    }: {
      values: PlaceIdentityForm
      baseline: PlaceEditBaseline
    }) => updatePlace(id, toPlaceEditBody(values, taxonomyIds, baseline)),
    onSuccess: (result, { values, baseline }) => {
      setIdentityError(null)
      setConflict(null)
      setIdentitySavedAt(new Date().toISOString())
      // Keep exactly what was typed, but stop calling it unsaved.
      reset(values)
      setTaxonomyBaseline(taxonomySignature(taxonomyIds))
      /*
       * The row moved, so the `expectedUpdatedAt` this form is holding is now
       * stale. `cmsUpdatePlace` documents no response schema, so the new stamp
       * is taken when it is actually there and otherwise left to the refetch
       * below — a guessed timestamp would turn the next save into a 409.
       */
      const updatedAt = (result as { updatedAt?: unknown } | undefined)?.updatedAt
      setIdentityBaseline({
        values,
        taxonomyIds,
        updatedAt: typeof updatedAt === 'string' ? updatedAt : baseline.updatedAt,
      })
      toast.success(t('placeEditor.savedIdentity'))
      // Re-reads the row, so the editor sees the *normalized* phone and
      // website the server stored rather than the string they typed.
      invalidate()
    },
    onError: (error) => {
      const apiError = toApiError(error)
      /*
       * Somebody else saved between load and submit. Nothing the editor typed
       * is thrown away: the form keeps it, the panel says which fields differ
       * from the server's copy, and the choice between reloading and
       * overwriting stays with the person who can tell which is right.
       */
      if (apiError.code === 'PLACE_MODIFIED') {
        setIdentityError(null)
        setIdentitySavedAt(null)
        setConflict({ serverUpdatedAt: apiError.fieldErrors[0]?.message ?? '' })
        // Pulls the current row so the diff below compares against real values.
        invalidate()
        toast.error(describeError(apiError), apiError.requestId || undefined)
        return
      }
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

  /**
   * The week is validated here before it is sent, against the same rules
   * `validateWeek` applies on GoGo-BE and with the same issue codes — so an
   * overlapping pair of services is pointed at in the form instead of coming
   * back as a toast. A rejected save never touches the draft: the acceptance
   * criterion is that a failed PUT does not cost the editor their work.
   */
  const saveHours = useMutation({
    mutationFn: () => {
      const { rows, issues } = parseWeek(week)
      if (issues.length > 0) {
        setHoursFieldErrors(issues)
        return Promise.reject(
          new ApiError({
            code: 'VALIDATION_FAILED',
            message: t('placeEditor.hours.error.blocked'),
            status: 400,
            fieldErrors: issues,
          }),
        )
      }
      setHoursFieldErrors([])
      return setPlaceHours(id, rows, place?.updatedAt)
    },
    onSuccess: () => {
      setHoursError(null)
      setHoursSavedAt(new Date().toISOString())
      setHoursBaseline(weekSignature(week))
      toast.success(t('placeEditor.savedHours'))
      invalidate()
    },
    onError: (error) => {
      const apiError = toApiError(error)
      setHoursSavedAt(null)
      // Server field errors land on the rows that produced them, exactly like
      // the local ones — the paths are the same because the contract is.
      setHoursFieldErrors(apiError.fieldErrors)
      // The week renders every `hours.*` path against the row that produced it,
      // so the panel lists only what it cannot place. Showing both would print
      // the same sentence twice for one mistake.
      setHoursError(
        asBlockError(
          apiError,
          apiError.fieldErrors.filter((error) => !error.field.startsWith('hours.')),
        ),
      )
      toast.error(describeError(apiError), apiError.requestId || undefined)
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
                saveIdentity.mutate({
                  values,
                  // Never absent in practice: the form only renders once the
                  // detail has loaded, and that is what sets the baseline.
                  baseline: identityBaseline ?? {
                    values,
                    taxonomyIds,
                    updatedAt: detail.updatedAt,
                  },
                })
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
                      {conflict ? (
                        <ConflictPanel
                          control={form.control}
                          server={detail}
                          serverUpdatedAt={conflict.serverUpdatedAt}
                          disabled={!canWrite || !online}
                          pending={saveIdentity.isPending}
                          onReload={(changes) => {
                            setReloadChanges(changes)
                            setReloadOpen(true)
                          }}
                          onOverwrite={() =>
                            saveIdentity.mutate({
                              values: form.getValues(),
                              baseline: {
                                // The editor's own starting point, so an
                                // untouched field is still not claimed — but
                                // against the row as it stands now.
                                values: identityBaseline?.values ?? form.getValues(),
                                taxonomyIds: identityBaseline?.taxonomyIds ?? taxonomyIds,
                                updatedAt: detail.updatedAt,
                              },
                            })
                          }
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
                      {/*
                        `areaKey` is the discovery area, and its vocabulary is
                        `service_areas` — exposed by `cmsListAreas`. It used to
                        be a free text box under a hint telling the editor to
                        "chọn taxonomy", and there is no `area` taxonomy kind:
                        the hint pointed at nothing and the box accepted keys
                        the place filter could never match (GoGo-BE ADR-0016).
                      */}
                      <Controller
                        control={form.control}
                        name="areaKey"
                        render={({ field }) => (
                          <AreaCombobox
                            label={t('placeEditor.areaKey')}
                            hint={t('placeEditor.areaKeyHint')}
                            disabled={!canWrite}
                            error={fieldError('areaKey')}
                            value={field.value ? field.value : null}
                            // `''` and not `null`, because the form's own shape
                            // is a string; the empty string becomes `null` on
                            // the wire in `toPlaceEditBody`.
                            onChange={(next) => field.onChange(next ?? '')}
                            preferCity={cityValue}
                            id="place-area-key"
                          />
                        )}
                      />
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
                          {...register('avgVisitMinutes', numberFieldRegister)}
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
                        Price level and confidence stay read-only: they are
                        provider-derived and `cmsUpdatePlace` does not accept
                        them, so an editable-looking field here would be a lie.
                        Phone and website moved into the contact card below —
                        GoGo-BE#425 made them writable.
                      */}
                      <dl className={styles.factGrid}>
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

                  {/*
                    The administrative address, kept apart from `areaKey` on
                    purpose: one is where the place is, the other is where GoGo
                    offers it. Every box here clears its column when emptied.
                  */}
                  <Card>
                    <CardHeader
                      title={t('placeEditor.contact')}
                      hint={t('placeEditor.contactHint')}
                    />
                    <CardBody className="flex flex-col gap-4">
                      <TextInput
                        label={t('placeEditor.address')}
                        disabled={!canWrite}
                        error={fieldError('addressText')}
                        {...register('addressText')}
                      />
                      {/*
                        ADM-106 — the address, as the two levels Vietnam
                        currently has.

                        The free-text "Tỉnh/Thành phố" and "Quận/Huyện" boxes
                        are gone. The second named a tier dissolved on
                        2025-07-01, so it asked an editor to fill in a unit that
                        no longer exists; the first was free text that could not
                        express the identity anything downstream needs. The
                        stored legacy values are untouched and still readable in
                        the address line above.
                      */}
                      <div className={styles.fieldRow}>
                        <Controller
                          control={form.control}
                          name="provinceCode"
                          render={({ field }) => (
                            <AdministrativeUnitCombobox
                              id="place-province-code"
                              level="PROVINCE"
                              label={t('placeEditor.province')}
                              hint={t('placeEditor.provinceHint')}
                              disabled={!canWrite}
                              error={fieldError('provinceCode')}
                              value={field.value ? field.value : null}
                              knownName={place?.administrative?.provinceName ?? null}
                              onChange={(next) => {
                                field.onChange(next ?? '')
                                // The commune belonged to the old province's
                                // list; keeping it would send a pair the
                                // hierarchy does not hold.
                                form.setValue('communeCode', '', { shouldDirty: true })
                              }}
                            />
                          )}
                        />
                        <Controller
                          control={form.control}
                          name="communeCode"
                          render={({ field }) => (
                            <AdministrativeUnitCombobox
                              id="place-commune-code"
                              level="COMMUNE"
                              provinceCode={provinceCodeValue || null}
                              label={t('placeEditor.commune')}
                              hint={provinceCodeValue ? t('placeEditor.communeHint') : undefined}
                              disabled={!canWrite}
                              error={fieldError('communeCode')}
                              value={field.value ? field.value : null}
                              knownName={place?.administrative?.communeName ?? null}
                              onChange={(next) => field.onChange(next ?? '')}
                            />
                          )}
                        />
                      </div>
                      <AdministrativeSummary summary={place?.administrative ?? null} />
                      <div className={styles.fieldRow}>
                        <TextInput
                          label={t('placeEditor.phone')}
                          type="tel"
                          inputMode="tel"
                          // The server normalizes to E.164 and answers on
                          // `phone`; a second rule here would disagree with it.
                          hint={t('placeEditor.phoneHint')}
                          disabled={!canWrite}
                          error={fieldError('phone')}
                          {...register('phone')}
                        />
                        <div className="flex flex-col gap-1">
                          <TextInput
                            label={t('placeEditor.website')}
                            /*
                              `inputMode`, deliberately not `type="url"`: the
                              browser's own validation refuses a bare host and
                              blocks the submit, while the server accepts one
                              and upgrades it to `https://`. Two rules again,
                              and the stricter one wins before the request is
                              even made.
                            */
                            inputMode="url"
                            hint={t('placeEditor.websiteHint')}
                            disabled={!canWrite}
                            error={fieldError('website')}
                            {...register('website')}
                          />
                          {/* A link only for a value actually stored as
                              http(s) — never for whatever is being typed. */}
                          {isStoredWebUrl(detail.website) ? (
                            <a
                              className={styles.factLink}
                              href={detail.website}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {t('placeEditor.websiteOpen')}
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <ProvenanceList provenance={detail.provenance} />
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
                    <CardHeader
                      title={t('publishChecklist.title')}
                      hint={t('publishChecklist.hint')}
                    />
                    <CardBody>
                      <PublishChecklist
                        place={detail}
                        canTransition={can('place.transition') && online}
                      />
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader title={t('placeEditor.geo')} />
                    <CardBody>
                      <PlaceLocationPanel lat={detail.lat} lng={detail.lng} name={detail.name} />
                      <div className={styles.fieldRow}>
                        <TextInput
                          label={t('placeEditor.lat')}
                          inputMode="decimal"
                          disabled={!canWrite}
                          error={fieldError('lat')}
                          {...register('lat', numberFieldRegister)}
                        />
                        <TextInput
                          label={t('placeEditor.lng')}
                          inputMode="decimal"
                          disabled={!canWrite}
                          error={fieldError('lng')}
                          {...register('lng', numberFieldRegister)}
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
                      <HoursEditor
                        week={week}
                        onChange={setWeek}
                        disabled={!canWrite}
                        serverIssues={hoursFieldErrors}
                      />
                    </CardBody>
                  </Card>

                  {/*
                    CMS-046 (#125). The card used to live here inline, listing
                    storage keys under a comment saying no write route existed.
                    GoGo-BE#191 shipped those routes, so the card is a feature
                    of its own now — upload, attach, order, caption, moderate,
                    detach — and the editor only says where it goes.
                  */}
                  <PlaceMediaCard placeId={id} media={detail.media} canWrite={canWrite} />

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

                  <Card>
                    <CardHeader title={t('googleLink.title')} />
                    <CardBody>
                      <GoogleLinkPanel sources={detail.sources} />
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

      {/*
        Reloading after a concurrent save throws the editor's own work away,
        so it is a confirmation, not a button — and it says what is lost.
      */}
      <ConfirmDialog
        open={reloadOpen}
        onClose={() => setReloadOpen(false)}
        onConfirm={() => {
          if (place) applyIdentity(place)
          setConflict(null)
          setReloadOpen(false)
        }}
        title={t('placeEditor.conflictReloadTitle')}
        description={t('placeEditor.conflictReloadBody')}
        changes={reloadChanges}
        confirmLabel={t('placeEditor.conflictReload')}
        tone="danger"
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

/**
 * Where each editable field came from.
 *
 * Two rules, both from `GOGO_PRODUCT_DATA_ARCHITECTURE.md`: a field with no row
 * has **no recorded origin** and says so rather than defaulting to GoGo, and
 * `google_derived` is not `provider` — applying a value from a preview copies
 * it, it does not transfer ownership of it.
 */
function ProvenanceList({ provenance }: { provenance: Record<string, PlaceProvenance> }) {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()
  return (
    <section>
      <p className={styles.factLabel}>
        {t('placeEditor.provenance')} — {t('placeEditor.provenanceHint')}
      </p>
      <dl className={styles.provenanceGrid}>
        {PROVENANCE_FIELDS.map((field) => {
          const row = provenance[field.name]
          return (
            <div key={field.name} className={styles.provenanceRow}>
              <dt className={styles.factLabel}>{t(field.labelKey)}</dt>
              <dd className={styles.provenanceValue}>
                {row ? (
                  <>
                    {/* An unknown source type renders as itself, never blank. */}
                    {label(`fieldSource.${row.sourceType}`, row.sourceType)}
                    <span className={styles.provenanceMeta}>
                      {row.verifiedAt
                        ? t('placeEditor.provenanceVerified', {
                            time: formatDateTime(row.verifiedAt, locale),
                          })
                        : t('placeEditor.provenanceUnverified')}
                      {row.sourceReference ? ` · ${row.sourceReference}` : ''}
                    </span>
                  </>
                ) : (
                  <span className={styles.provenanceEmpty}>{t('placeEditor.provenanceNone')}</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

/**
 * `409 PLACE_MODIFIED` — somebody saved this place while the form was open.
 *
 * The editor's work stays in the boxes. What they get is the one thing that
 * makes the choice decidable: which of their fields differ from what the row
 * now holds, and both values side by side.
 */
function ConflictPanel({
  control,
  server,
  serverUpdatedAt,
  disabled,
  pending,
  onReload,
  onOverwrite,
}: {
  control: Control<PlaceIdentityForm>
  server: CmsPlaceDetail
  serverUpdatedAt: string
  disabled: boolean
  pending: boolean
  onReload: (changes: ChangeLine[]) => void
  onOverwrite: () => void
}) {
  const t = useT()
  const { locale } = useI18n()
  // Live values: the diff has to follow what is being typed while the panel is
  // open, or it describes a form that no longer exists.
  const values = useWatch({ control }) as PlaceIdentityForm
  const differences = diffAgainstServer(values, {
    name: server.name,
    addressText: server.addressText,
    areaKey: server.areaKey,
    city: server.city,
    district: server.district,
    phone: server.phone,
    website: server.website,
    description: server.description,
    avgVisitMinutes: server.avgVisitMinutes,
    lat: server.lat,
    lng: server.lng,
  })
  const empty = t('placeEditor.conflictEmpty')
  const changes: ChangeLine[] = differences.map((difference) => ({
    label: difference.field,
    from: difference.mine || empty,
    to: difference.theirs || empty,
  }))

  return (
    <div role="alert" className={styles.conflictPanel}>
      <p className={styles.conflictTitle}>
        <span aria-hidden="true">⚠</span> {t('placeEditor.conflictTitle')}
      </p>
      <p className={styles.errorText}>
        {t('placeEditor.conflictBody', {
          time: serverUpdatedAt ? formatDateTime(serverUpdatedAt, locale) : '—',
        })}
      </p>
      {differences.length === 0 ? (
        <p className={styles.errorText}>{t('placeEditor.conflictNoDiff')}</p>
      ) : (
        <>
          <p className={styles.errorText}>{t('placeEditor.conflictDiff')}</p>
          <ul className={styles.errorList}>
            {differences.map((difference) => (
              <li key={difference.field}>
                <span className={styles.errorField}>{difference.field}</span>{' '}
                <span className={styles.conflictMine}>
                  {t('placeEditor.conflictMine')}: {difference.mine || empty}
                </span>{' '}
                <span className={styles.conflictTheirs}>
                  {t('placeEditor.conflictTheirs')}: {difference.theirs || empty}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => onReload(changes)}>
          {t('placeEditor.conflictReload')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={disabled}
          loading={pending}
          onClick={onOverwrite}
        >
          {t('placeEditor.conflictOverwrite')}
        </Button>
      </div>
    </div>
  )
}

/** Order-independent identity of a week, so "changed" means changed. */
function taxonomySignature(ids: string[]): string {
  return [...ids].sort().join(',')
}
