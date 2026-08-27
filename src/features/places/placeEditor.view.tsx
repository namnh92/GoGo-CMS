import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import {
  formatDateTime,
  formatMinuteOfDay,
  formatMoneyRange,
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
import { TakedownDialog } from '@/features/emergency/takedownDialog.view'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import type { PlaceHour, PlaceStatus, PriceUnit } from '@/shared/api/contracts'
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
import { PLACE_STATUSES } from './status'
import { styles } from './placeEditor.style'

/**
 * `dayOfWeek` on the wire is 0 = Sunday … 6 = Saturday — the convention
 * GoGo-BE derives from `Date#getUTCDay()` in `vnDayMinute()`. 2024-01-07 is a
 * Sunday, so it is the base date the weekday labels are formatted from.
 */
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_BASE_DATE = Date.UTC(2024, 0, 7)

const identitySchema = z.object({
  name: z.string().min(1).max(200),
  addressText: z.string().max(300).optional(),
  areaKey: z.string().max(80).optional(),
  description: z.string().max(4000).optional(),
  avgVisitMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})
type IdentityForm = z.infer<typeof identitySchema>

const PRICE_UNITS: PriceUnit[] = ['per_person', 'per_item', 'per_hour', 'per_night']

export default function PlaceEditorScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canWrite = can('place.write')
  const [auditOpen, setAuditOpen] = useState(false)
  const [takedownOpen, setTakedownOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string } | null>(null)
  const [hours, setHours] = useState<PlaceHour[]>([])
  const [taxonomyIds, setTaxonomyIds] = useState<string[]>([])
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
    queryKey: queryKeys.taxonomies.all,
    queryFn: ({ signal }) => fetchTaxonomies(signal),
    staleTime: 300_000,
  })

  const auditQuery = useQuery({
    queryKey: queryKeys.places.audit(id),
    queryFn: ({ signal }) => fetchPlaceAudit(id, signal),
    enabled: auditOpen && Boolean(id),
  })

  const form = useForm<IdentityForm>({ resolver: zodResolver(identitySchema) })
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form

  const place = placeQuery.data

  useEffect(() => {
    if (!place) return
    reset({
      name: place.name,
      addressText: place.addressText ?? '',
      areaKey: place.areaKey ?? '',
      description: place.description ?? '',
      avgVisitMinutes: place.avgVisitMinutes ?? undefined,
      lat: place.lat ?? undefined,
      lng: place.lng ?? undefined,
    })
    setHours(place.hours)
    setTaxonomyIds(place.taxonomyIds)
  }, [place, reset])

  const taxonomyById = useMemo(() => {
    const map = new Map<string, { key: string; labels: Record<string, string> }>()
    for (const item of taxonomyQuery.data?.items ?? []) map.set(item.id, item)
    return map
  }, [taxonomyQuery.data])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.places.detail(id) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
  }

  const saveIdentity = useMutation({
    mutationFn: (values: IdentityForm) =>
      updatePlace(id, {
        name: values.name,
        addressText: values.addressText || undefined,
        areaKey: values.areaKey || undefined,
        description: values.description || undefined,
        avgVisitMinutes: values.avgVisitMinutes,
        lat: values.lat,
        lng: values.lng,
        taxonomyIds,
      }),
    onSuccess: () => {
      toast.success(t('action.save'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const saveHours = useMutation({
    mutationFn: () => setPlaceHours(id, hours),
    onSuccess: () => {
      toast.success(t('placeEditor.hours'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
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
    onSuccess: () => {
      toast.success(t('placeEditor.status'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
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
            <form onSubmit={handleSubmit((values) => saveIdentity.mutate(values))}>
              <div className={styles.grid}>
                <div className={styles.main}>
                  <Card>
                    <CardHeader title={t('placeEditor.identity')} />
                    <CardBody className="flex flex-col gap-4">
                      <div className={styles.fieldRow}>
                        <TextInput
                          label={t('placeEditor.name')}
                          required
                          disabled={!canWrite}
                          error={errors.name ? t('state.error') : undefined}
                          {...register('name')}
                        />
                        <Select
                          label={t('placeEditor.status')}
                          value={detail.status}
                          disabled={!can('place.transition') || !online}
                          onChange={(event) =>
                            changeStatus.mutate(event.target.value as PlaceStatus)
                          }
                        >
                          {PLACE_STATUSES.map((status) => (
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
                          {...register('addressText')}
                        />
                        <TextInput
                          label={t('placeEditor.areaKey')}
                          hint={t('placeEditor.taxonomyHint')}
                          disabled={!canWrite}
                          {...register('areaKey')}
                        />
                      </div>
                      <TextArea
                        label={t('placeEditor.description')}
                        rows={4}
                        disabled={!canWrite}
                        {...register('description')}
                      />
                      <div className={styles.fieldRow}>
                        <TextInput
                          label={t('placeEditor.avgVisit')}
                          type="number"
                          inputMode="numeric"
                          disabled={!canWrite}
                          {...register('avgVisitMinutes')}
                        />
                        <div className="flex items-end gap-2">
                          <Badge tone="neutral">
                            {t('placeEditor.sources')}: {detail.sourceCount}
                          </Badge>
                          <Badge tone={detail.freshnessCheckedAt ? 'mint' : 'amber'}>
                            {detail.freshnessCheckedAt
                              ? formatRelative(detail.freshnessCheckedAt, locale)
                              : t('places.freshness.never')}
                          </Badge>
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
                        {(taxonomyQuery.data?.items ?? [])
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
                          {detail.prices.map((price, index) => (
                            <li key={price.id ?? index} className={styles.priceRow}>
                              <span className={styles.priceValue}>
                                {formatMoneyRange(
                                  price.priceMin,
                                  price.priceMax,
                                  price.currency,
                                  locale,
                                )}{' '}
                                <span className="font-normal text-text-muted">
                                  / {t(`priceUnit.${price.unit}` as const)}
                                </span>
                              </span>
                              <span className={styles.priceMeta}>
                                {price.observedBy ?? '—'} ·{' '}
                                {formatDateTime(price.observedAt, locale)}
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
                          disabled={!canWrite}
                          {...register('lat')}
                        />
                        <TextInput
                          label={t('placeEditor.lng')}
                          disabled={!canWrite}
                          {...register('lng')}
                        />
                      </div>
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
                          onClick={() => saveHours.mutate()}
                        >
                          {t('action.save')}
                        </Button>
                      }
                    />
                    <CardBody>
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
                          </div>
                        )
                      })}
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader title={t('placeEditor.media')} />
                    <CardBody>
                      <div className={styles.mediaRow}>
                        {detail.media.map((media) => (
                          <img
                            key={media.id}
                            src={media.url}
                            alt=""
                            className={styles.mediaThumb}
                            loading="lazy"
                          />
                        ))}
                        <button
                          type="button"
                          className={styles.mediaAdd}
                          aria-label={t('action.add')}
                          disabled={!canWrite}
                        >
                          <PlusIcon size={18} />
                        </button>
                      </div>
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
                          {detail.sources.map((source, index) => (
                            <li key={index} className={styles.sourceRow}>
                              <span className="min-w-0">
                                <span className="font-semibold text-text">
                                  {source.label ?? source.kind}
                                </span>
                                {source.attribution ? (
                                  <span className="block text-[11px] text-text-subtle">
                                    {source.attribution}
                                  </span>
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
                <p className={styles.saveState}>
                  <span
                    className={`${styles.dot} ${isDirty ? 'bg-amber' : 'bg-mint'}`}
                    aria-hidden="true"
                  />
                  {isDirty
                    ? t('placeEditor.unsaved')
                    : t('placeEditor.saved', { time: formatRelative(detail.updatedAt, locale) })}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => navigate('/places')}>
                    {t('action.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!canWrite || !online}
                    loading={saveIdentity.isPending}
                  >
                    {saveIdentity.isPending ? t('action.saving') : t('action.save')}
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
    </>
  )
}

function upsertHour(
  current: PlaceHour[],
  dayOfWeek: number,
  patch: Partial<PlaceHour>,
): PlaceHour[] {
  const existing = current.find((hour) => hour.dayOfWeek === dayOfWeek)
  if (!existing) {
    return [
      ...current,
      { dayOfWeek, openMinute: 480, closeMinute: 1320, isOvernight: false, ...patch },
    ].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  }
  return current.map((hour) => (hour.dayOfWeek === dayOfWeek ? { ...hour, ...patch } : hour))
}
