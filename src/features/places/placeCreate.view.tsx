import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { PageBody, PageHeader } from '@/app/PageHeader'
import { toApiError, type ApiError } from '@/shared/api/errors'
import { useT } from '@/shared/i18n/i18n'
import { useSession } from '@/shared/auth/session'
import { Button } from '@/shared/ui/Button'
import { Card, CardBody } from '@/shared/ui/Card'
import { TextArea, TextInput } from '@/shared/ui/Field'
import { AlertIcon, InfoIcon } from '@/shared/ui/icons'
import { PermissionDeniedState, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { useOnline } from '@/shared/ui/useOnline'

import { createPlace, GOOGLE_DERIVED_FIELDS, type GoogleDerivedField } from './api'
import { AdministrativeUnitCombobox, useProvinceName } from '@/features/administrative/unitCombobox'
import { AreaCombobox } from './areaCombobox'
import { PlaceCreateLinkPanel, type AppliedResolution } from './placeCreateLink.view'
import { styles } from './placeCreate.style'
import {
  numberFieldRegister,
  placeCreateSchema,
  splitFieldErrors,
  usePlaceFieldError,
  type PlaceCreateForm,
  type PlaceIdentityField,
} from './placeForm'

/**
 * GoGo-CMS#150 — the third way a place enters the catalogue.
 *
 * Its own route rather than the editor with a fake id. `/places/new` used to
 * match `places/:id`, so the button opened the editor with the id "new",
 * `GET /cms/places/new` answered `400 Invalid uuid`, and the primary CTA of the
 * catalogue screen led to an error page (GoGo-CMS#128).
 *
 * Only identity fields live here. Hours, prices and photos need a place to hang
 * off, so the flow is: create the draft, then land on the editor that already
 * owns all of that. Publishing is a third step, deliberately — entering the
 * catalogue and being visible are separate decisions.
 *
 * GoGo-CMS#157 put a Google Maps link in front of all of it. The screen used to
 * open on a latitude box; coordinates typed by hand are the most reliable way
 * to put a pin on the wrong street, and a place entered that way carries no
 * Google Place ID, so it sits outside provider dedup and nothing can ever
 * refresh it. Every field below is still typed and still editable — the link is
 * the fast path, not the only one.
 */
export default function PlaceCreateScreen() {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()
  const fieldError = usePlaceFieldError()

  /** Candidates from a 409, kept so the editor can decide rather than retry blind. */
  const [duplicates, setDuplicates] = useState<string[] | null>(null)
  const [serverError, setServerError] = useState<ApiError | null>(null)
  /**
   * What a resolution filled in, kept verbatim so provenance can be worked out
   * at submit time rather than tracked keystroke by keystroke: a field whose
   * value still equals what Google gave is `google_derived`, and one the editor
   * changed — or changed and changed back — is their own claim either way.
   */
  const [applied, setApplied] = useState<AppliedResolution | null>(null)

  const form = useForm<PlaceCreateForm>({
    resolver: zodResolver(placeCreateSchema),
    defaultValues: { name: '', areaKey: undefined },
  })

  /*
   * ADM-106 — the commune list is fetched for whichever province is chosen, so
   * the two boxes have to re-render together. `useWatch` rather than
   * `form.watch()` in the body: the latter re-renders the whole form on every
   * keystroke in any field.
   */
  const provinceCode = useWatch({ control: form.control, name: 'provinceCode' }) ?? ''
  /** The discovery-area picker groups by city, and this is the nearest thing. */
  const provinceName = useProvinceName(provinceCode)

  /**
   * Which applied fields the editor left alone. Compared by value at submit
   * time, so retyping Google's own answer character for character is treated as
   * accepting it — which is the honest reading, and the alternative (tracking
   * every edit event) would call an undo an editorial claim.
   */
  const derivedFields = (values: PlaceCreateForm): GoogleDerivedField[] => {
    if (!applied) return []
    const same: Record<GoogleDerivedField, boolean> = {
      name: values.name.trim() === applied.name.trim(),
      addressText: (values.addressText ?? '').trim() === applied.addressText.trim(),
      lat: values.lat === applied.lat,
      lng: values.lng === applied.lng,
    }
    return GOOGLE_DERIVED_FIELDS.filter((field) => same[field])
  }

  const create = useMutation({
    mutationFn: (values: PlaceCreateForm & { allowDuplicate?: boolean }) =>
      createPlace({
        name: values.name,
        lat: values.lat,
        lng: values.lng,
        ...(applied ? { googlePlaceId: applied.googlePlaceId } : {}),
        ...(applied && derivedFields(values).length > 0
          ? { googleDerivedFields: derivedFields(values) }
          : {}),
        ...(values.addressText ? { addressText: values.addressText } : {}),
        ...(values.areaKey ? { areaKey: values.areaKey } : {}),
        // ADM-106 — the canonical pair. `city`/`district` are legacy free text
        // and no longer have inputs, so a new place carries neither.
        ...(values.provinceCode ? { provinceCode: values.provinceCode } : {}),
        ...(values.communeCode ? { communeCode: values.communeCode } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.website ? { website: values.website } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values.avgVisitMinutes !== undefined
          ? { avgVisitMinutes: values.avgVisitMinutes }
          : {}),
        ...(values.allowDuplicate ? { allowDuplicate: true } : {}),
      }),
    onSuccess: (place) => {
      void queryClient.invalidateQueries({ queryKey: ['cms', 'places'] })
      toast.success(t('placeCreate.created'))
      // The response is the same record the editor loads, so the next step —
      // hours, prices, photos — starts without a second fetch.
      navigate(`/places/${place.id}`)
    },
    onError: (error) => {
      const apiError = toApiError(error)
      setDuplicates(null)
      setServerError(null)

      if (apiError.code === 'PLACE_DUPLICATE_SUSPECTED') {
        setDuplicates(apiError.fieldErrors.map((issue) => issue.message))
        return
      }

      /**
       * The Google record already belongs to a place. Nothing about this form
       * can fix that, and creating a second row for one Google id is the exact
       * thing add-by-link exists to prevent — so the editor is sent to the
       * place that already holds it.
       */
      if (apiError.code === 'PLACE_ALREADY_LINKED') {
        const existingId = apiError.fieldErrors[0]?.message
        if (existingId) {
          toast.success(t('placeCreate.link.exists'))
          navigate(`/places/${existingId}`)
          return
        }
      }

      // Field-level rejections land on the boxes that caused them; anything the
      // form cannot point at is shown whole rather than dropped.
      const { mapped, unmapped } = splitFieldErrors(apiError.fieldErrors)
      for (const issue of mapped) {
        form.setError(issue.field, { message: fieldError(issue.field, issue) })
      }
      if (mapped.length === 0 || unmapped.length > 0) setServerError(apiError)
    },
  })

  if (!can('place.write')) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: t('places.title'), to: '/places' }]}
          title={t('placeCreate.title')}
        />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  /**
   * A message this form's schema authored is an i18n key, not a sentence —
   * rendering `errors.lat.message` directly puts `placeEditor.error.required`
   * on screen, which is what shipped in the first cut of this screen. The
   * editor's resolver already turns a key and a zod code into Vietnamese.
   */
  const errorFor = (field: PlaceIdentityField): string | undefined => {
    const issue = form.formState.errors[field]
    if (!issue) return undefined
    return fieldError(field, {
      code: String(issue.type ?? ''),
      message: String(issue.message ?? ''),
    })
  }

  const submit = form.handleSubmit((values) => create.mutate(values))

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('places.title'), to: '/places' }]}
        title={t('placeCreate.title')}
      />
      <PageBody>
        <form className={styles.form} onSubmit={submit} noValidate>
          <Card>
            <CardBody>
              <PlaceCreateLinkPanel
                onApply={(values) => {
                  setApplied(values)
                  // `shouldDirty` so the unsaved-changes guard treats an applied
                  // resolution as work in progress, which it is.
                  form.setValue('name', values.name, { shouldDirty: true })
                  form.setValue('addressText', values.addressText, { shouldDirty: true })
                  form.setValue('lat', values.lat, { shouldDirty: true })
                  form.setValue('lng', values.lng, { shouldDirty: true })
                  form.clearErrors(['name', 'addressText', 'lat', 'lng'])
                }}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex flex-col gap-4">
                <p className={styles.hint}>{t('placeCreate.intro')}</p>

                <TextInput
                  label={t('placeEditor.name')}
                  required
                  error={errorFor('name')}
                  {...form.register('name')}
                />

                <div className={styles.fieldRow}>
                  <TextInput
                    label={t('placeEditor.lat')}
                    required
                    type="number"
                    inputMode="decimal"
                    step="any"
                    hint={t('placeCreate.coordinateHint')}
                    error={errorFor('lat')}
                    {...form.register('lat', numberFieldRegister)}
                  />
                  <TextInput
                    label={t('placeEditor.lng')}
                    required
                    type="number"
                    inputMode="decimal"
                    step="any"
                    error={errorFor('lng')}
                    {...form.register('lng', numberFieldRegister)}
                  />
                </div>

                <Controller
                  control={form.control}
                  name="areaKey"
                  render={({ field }) => (
                    <AreaCombobox
                      id="place-area-key"
                      label={t('placeEditor.areaKey')}
                      hint={t('placeEditor.areaKeyHint')}
                      error={errorFor('areaKey')}
                      value={field.value ? field.value : null}
                      onChange={(next) => field.onChange(next ?? '')}
                      preferCity={provinceName ?? undefined}
                    />
                  )}
                />

                <TextInput
                  label={t('placeEditor.address')}
                  error={errorFor('addressText')}
                  {...form.register('addressText')}
                />

                {/*
                  ADM-106 — two levels, because Vietnam has two. The district
                  tier was dissolved on 2025-07-01, so there is no third box:
                  offering one would be asking an editor to fill in a unit that
                  no longer exists.
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
                        error={errorFor('provinceCode')}
                        value={field.value ? field.value : null}
                        onChange={(next) => {
                          field.onChange(next ?? '')
                          // The commune came from the old province's list;
                          // keeping it would send a pair the hierarchy does not
                          // hold, and GoGo-BE would refuse the save.
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
                        provinceCode={provinceCode || null}
                        label={t('placeEditor.commune')}
                        hint={provinceCode ? t('placeEditor.communeHint') : undefined}
                        error={errorFor('communeCode')}
                        value={field.value ? field.value : null}
                        onChange={(next) => field.onChange(next ?? '')}
                      />
                    )}
                  />
                </div>

                <div className={styles.fieldRow}>
                  <TextInput
                    label={t('placeEditor.phone')}
                    inputMode="tel"
                    error={errorFor('phone')}
                    {...form.register('phone')}
                  />
                  <TextInput
                    label={t('placeEditor.website')}
                    error={errorFor('website')}
                    {...form.register('website')}
                  />
                </div>

                <TextInput
                  label={t('placeEditor.avgVisit')}
                  type="number"
                  inputMode="numeric"
                  hint={t('placeEditor.avgVisitHint')}
                  error={errorFor('avgVisitMinutes')}
                  {...form.register('avgVisitMinutes', numberFieldRegister)}
                />

                <TextArea
                  label={t('placeEditor.description')}
                  rows={4}
                  error={errorFor('description')}
                  {...form.register('description')}
                />
              </div>
            </CardBody>
          </Card>

          {duplicates ? (
            <div className={styles.duplicatePanel} role="status" aria-live="polite">
              <p className={styles.duplicateTitle}>
                <AlertIcon size={14} aria-hidden="true" />
                {t('placeCreate.duplicateTitle')}
              </p>
              <p className={styles.duplicateBody}>{t('placeCreate.duplicateBody')}</p>
              <ul className={styles.duplicateList}>
                {duplicates.map((candidate) => (
                  <li key={candidate} className={styles.duplicateItem}>
                    {candidate}
                  </li>
                ))}
              </ul>
              <div className={styles.duplicateActions}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate('/places?tab=duplicates')}
                >
                  {t('placeCreate.duplicateOpenQueue')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  loading={create.isPending}
                  disabled={!online}
                  onClick={() => create.mutate({ ...form.getValues(), allowDuplicate: true })}
                >
                  {t('placeCreate.duplicateCreateAnyway')}
                </Button>
              </div>
            </div>
          ) : null}

          {serverError ? (
            <div className={styles.errorPanel} role="alert">
              <p className={styles.errorTitle}>
                <InfoIcon size={14} aria-hidden="true" />
                {t('placeCreate.failed')}
              </p>
              <p className={styles.errorText}>{describeError(serverError)}</p>
              {serverError.fieldErrors.length > 0 ? (
                <ul className={styles.errorList}>
                  {serverError.fieldErrors.map((issue) => (
                    <li key={`${issue.field}-${issue.code}`}>
                      <span className={styles.errorField}>{issue.field}</span> {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button type="submit" loading={create.isPending} disabled={!online}>
              {t('placeCreate.submit')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate('/places')}>
              {t('action.cancel')}
            </Button>
            {!online ? <span className={styles.hint}>{t('state.offline')}</span> : null}
          </div>
        </form>
      </PageBody>
    </>
  )
}
