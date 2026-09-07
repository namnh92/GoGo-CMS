import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
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

import { createPlace } from './api'
import { AreaCombobox } from './areaCombobox'
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

  const form = useForm<PlaceCreateForm>({
    resolver: zodResolver(placeCreateSchema),
    defaultValues: { name: '', areaKey: undefined },
  })

  const create = useMutation({
    mutationFn: (values: PlaceCreateForm & { allowDuplicate?: boolean }) =>
      createPlace({
        name: values.name,
        lat: values.lat,
        lng: values.lng,
        ...(values.addressText ? { addressText: values.addressText } : {}),
        ...(values.areaKey ? { areaKey: values.areaKey } : {}),
        ...(values.city ? { city: values.city } : {}),
        ...(values.district ? { district: values.district } : {}),
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
              <div className="flex flex-col gap-4">
                <p className={styles.hint}>{t('placeCreate.intro')}</p>

                <TextInput
                  label={t('placeEditor.name')}
                  required
                  autoFocus
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
                      preferCity={form.watch('city') ?? undefined}
                    />
                  )}
                />

                <TextInput
                  label={t('placeEditor.address')}
                  error={errorFor('addressText')}
                  {...form.register('addressText')}
                />

                <div className={styles.fieldRow}>
                  <TextInput
                    label={t('placeEditor.city')}
                    error={errorFor('city')}
                    {...form.register('city')}
                  />
                  <TextInput
                    label={t('placeEditor.district')}
                    error={errorFor('district')}
                    {...form.register('district')}
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
