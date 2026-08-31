import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button, IconButton } from '@/shared/ui/Button'
import { SearchInput, Select, TextArea, TextInput } from '@/shared/ui/Field'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '@/shared/ui/icons'
import { fetchPlaces } from '@/features/places/api'
import {
  contentAudienceSchema,
  type CmsRecommendationDetail,
  type ContentAudience,
  type RecommendationStatus,
} from '@/shared/api/contracts'
import {
  fetchRecommendation,
  setRecommendationPlaces,
  setRecommendationStatus,
  updateRecommendation,
} from './api'
import { RecommendationStatusBadge } from './recommendationStatus'
import { styles } from './recommendationDetail.style'

/**
 * The lifecycle the server declares. `archived` is terminal — retired content
 * comes back as a new row, not a resurrection — so it offers no way out.
 */
const TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  draft: ['scheduled', 'published', 'archived'],
  scheduled: ['draft', 'published', 'archived'],
  published: ['draft', 'archived'],
  archived: [],
}

export default function RecommendationDetailScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canRead = can('recommendation.read')
  const canManage = can('recommendation.manage')

  const query = useQuery({
    queryKey: queryKeys.recommendations.detail(id),
    queryFn: ({ signal }) => fetchRecommendation(id, signal),
    enabled: canRead && Boolean(id),
  })

  const detail = query.data

  // Draft copy of the editable fields. Seeded from the server and reseeded
  // whenever it answers again, so a concurrent edit elsewhere is not silently
  // overwritten by a stale form.
  const [form, setForm] = useState({
    internalName: '',
    title: '',
    subtitle: '',
    description: '',
    areaKey: '',
    priority: '0',
    audience: 'couple' as ContentAudience,
  })
  const [placeSearch, setPlaceSearch] = useState('')

  useEffect(() => {
    if (!detail) return
    setForm({
      internalName: detail.internalName ?? '',
      title: detail.title,
      subtitle: detail.subtitle ?? '',
      description: detail.description ?? '',
      areaKey: detail.areaKey ?? '',
      priority: String(detail.priority),
      audience: detail.audience ?? 'couple',
    })
  }, [detail])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all })
  }

  const save = useMutation({
    mutationFn: () =>
      updateRecommendation(id, {
        internalName: form.internalName,
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        areaKey: form.areaKey,
        audience: form.audience,
        priority: Number(form.priority) || 0,
      }),
    onSuccess: () => {
      toast.success(t('recommendations.saved'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changeStatus = useMutation({
    mutationFn: (status: RecommendationStatus) => setRecommendationStatus(id, status),
    onSuccess: () => {
      toast.success(t('recommendations.statusChanged'))
      invalidate()
    },
    // The server refuses an undeclared edge, a schedule with no start time and
    // a publish with no places; its message is the honest one to show.
    onError: (error) => toast.error(describeError(error)),
  })

  const savePlaces = useMutation({
    mutationFn: (placeIds: string[]) => setRecommendationPlaces(id, placeIds),
    onSuccess: () => {
      toast.success(t('recommendations.placesSaved'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const placeResults = useQuery({
    queryKey: queryKeys.places.list({ q: placeSearch, limit: 8 }),
    queryFn: ({ signal }) => fetchPlaces({ q: placeSearch, limit: 8 }, signal),
    enabled: canManage && placeSearch.trim().length >= 2,
    staleTime: 30_000,
  })

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('recommendations.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  /** Every mutation of the list is a full replace — the contract has no other shape. */
  const replaceWith = (next: CmsRecommendationDetail['places']) =>
    savePlaces.mutate(next.map((place) => place.placeId))

  const move = (from: number, to: number) => {
    if (!detail) return
    const next = [...detail.places]
    const moved = next[from]
    if (!moved || to < 0 || to >= next.length) return
    next.splice(from, 1)
    next.splice(to, 0, moved)
    replaceWith(next)
  }

  const remove = (placeId: string) => {
    if (!detail) return
    replaceWith(detail.places.filter((place) => place.placeId !== placeId))
  }

  const add = (placeId: string) => {
    if (!detail) return
    if (detail.places.some((place) => place.placeId === placeId)) {
      toast.error(t('recommendations.duplicatePlace'))
      return
    }
    savePlaces.mutate([...detail.places.map((place) => place.placeId), placeId])
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('recommendations.breadcrumb'), to: '/recommendations' },
          { label: detail?.internalName ?? detail?.title ?? '' },
        ]}
        title={detail?.title ?? t('recommendations.title')}
        showSearch={false}
        actions={detail ? <RecommendationStatusBadge status={detail.status} /> : null}
      />
      <PageBody>
        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={detail ? [detail] : []}
          isEmpty={(items) => items.length === 0}
          onRetry={() => void query.refetch()}
          empty={<EmptyState />}
        >
          {([item]) => (
            <div className={styles.layout}>
              <div className={styles.main}>
                <Card>
                  <CardHeader
                    title={t('recommendations.editTitle')}
                    hint={t('recommendations.editHint')}
                  />
                  <CardBody>
                    <div className={styles.formGrid}>
                      <TextInput
                        label={t('recommendations.field.internalName')}
                        value={form.internalName}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, internalName: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('recommendations.field.slug')}
                        value={item!.slug}
                        readOnly
                        disabled
                        hint={t('recommendations.slugImmutable')}
                      />
                      <TextInput
                        label={t('recommendations.field.title')}
                        value={form.title}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, title: event.target.value }))
                        }
                      />
                      <Select
                        label={t('recommendations.field.audience')}
                        value={form.audience}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            audience: event.target.value as ContentAudience,
                          }))
                        }
                      >
                        {contentAudienceSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {t(`recommendations.audience.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      <TextInput
                        label={t('recommendations.field.subtitle')}
                        value={form.subtitle}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, subtitle: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('recommendations.field.areaKey')}
                        value={form.areaKey}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, areaKey: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('recommendations.field.priority')}
                        inputMode="numeric"
                        value={form.priority}
                        disabled={!canManage}
                        hint={t('recommendations.field.priorityHint')}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, priority: event.target.value }))
                        }
                      />
                      <TextArea
                        label={t('recommendations.field.description')}
                        rows={3}
                        className={styles.formFull}
                        value={form.description}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </div>
                  </CardBody>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      disabled={!canManage || !online}
                      loading={save.isPending}
                      onClick={() => save.mutate()}
                    >
                      {t('recommendations.save')}
                    </Button>
                  </div>
                </Card>
              </div>

              <div className={styles.side}>
                <Card>
                  <CardHeader
                    title={t('recommendations.lifecycle')}
                    hint={t('recommendations.lifecycleHint')}
                  />
                  <div className={styles.statusRow}>
                    {TRANSITIONS[item!.status].length === 0 ? (
                      <p className="text-xs text-text-muted">{t('recommendations.terminal')}</p>
                    ) : (
                      TRANSITIONS[item!.status].map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant={next === 'archived' ? 'danger' : 'secondary'}
                          disabled={!canManage || !online}
                          loading={changeStatus.isPending && changeStatus.variables === next}
                          onClick={() => changeStatus.mutate(next)}
                        >
                          {t(`recommendations.moveTo.${next}` as const)}
                        </Button>
                      ))
                    )}
                  </div>
                  <p className={styles.note}>
                    <span aria-hidden="true">ℹ</span>
                    {t('recommendations.publishRule')}
                  </p>
                </Card>

                <Card>
                  <CardHeader
                    title={t('recommendations.places')}
                    hint={t('recommendations.placesHint')}
                  />

                  {canManage ? (
                    <div className={styles.searchRow}>
                      <SearchInput
                        label={t('recommendations.searchPlace')}
                        placeholder={t('recommendations.searchPlace')}
                        className="w-full"
                        value={placeSearch}
                        onChange={(event) => setPlaceSearch(event.target.value)}
                      />
                    </div>
                  ) : null}

                  {placeSearch.trim().length >= 2
                    ? (placeResults.data?.items ?? []).map((place) => (
                        <div key={place.id} className={styles.resultRow}>
                          <div className="min-w-0">
                            <p className={styles.placeName}>{place.name}</p>
                            {/* The catalog list returns an area key, not a
                                street address — show what it actually has. */}
                            <p className={styles.placeMeta}>{place.areaKey ?? '—'}</p>
                          </div>
                          <div className={styles.placeActions}>
                            <IconButton
                              label={t('recommendations.addPlace', { name: place.name })}
                              disabled={!canManage || !online || savePlaces.isPending}
                              onClick={() => add(place.id)}
                            >
                              <PlusIcon size={14} />
                            </IconButton>
                          </div>
                        </div>
                      ))
                    : null}

                  {item!.places.length === 0 ? (
                    <div className="px-5 py-4">
                      <EmptyState
                        title={t('recommendations.noPlaces')}
                        hint={t('recommendations.noPlacesHint')}
                      />
                    </div>
                  ) : (
                    item!.places.map((place, index) => (
                      <div key={place.placeId} className={styles.placeRow}>
                        {/* Position is meaning here: the index is what the
                            server stores, so it is shown rather than implied. */}
                        <span className={styles.placePos}>{place.position + 1}</span>
                        <div className="min-w-0">
                          <p className={styles.placeName}>{place.name}</p>
                          <p className={styles.placeMeta}>
                            {place.addressText ?? '—'}
                            {place.status !== 'published' ? (
                              <>
                                {' · '}
                                <span className={styles.suspended}>
                                  {t('recommendations.placeNotPublished', {
                                    status: place.status,
                                  })}
                                </span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <div className={styles.placeActions}>
                          <IconButton
                            label={t('recommendations.moveUp', { name: place.name })}
                            disabled={!canManage || index === 0 || savePlaces.isPending || !online}
                            onClick={() => move(index, index - 1)}
                          >
                            <ChevronLeftIcon size={14} className="rotate-90" />
                          </IconButton>
                          <IconButton
                            label={t('recommendations.moveDown', { name: place.name })}
                            disabled={
                              !canManage ||
                              index === item!.places.length - 1 ||
                              savePlaces.isPending ||
                              !online
                            }
                            onClick={() => move(index, index + 1)}
                          >
                            <ChevronRightIcon size={14} className="rotate-90" />
                          </IconButton>
                          <IconButton
                            label={t('recommendations.removePlace', { name: place.name })}
                            tone="danger"
                            disabled={!canManage || savePlaces.isPending || !online}
                            onClick={() => remove(place.placeId)}
                          >
                            <TrashIcon size={14} />
                          </IconButton>
                        </div>
                      </div>
                    ))
                  )}
                </Card>

                <Card>
                  <CardBody>
                    <p className="text-[11px] text-text-subtle">
                      {t('recommendations.updatedAt')}: {formatDateTime(item!.updatedAt, locale)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => navigate('/recommendations')}
                    >
                      {t('recommendations.backToList')}
                    </Button>
                  </CardBody>
                </Card>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}
