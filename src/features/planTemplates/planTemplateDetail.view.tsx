import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime, formatMoneyRange } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button, IconButton } from '@/shared/ui/Button'
import { Select, TextArea, TextInput, Toggle } from '@/shared/ui/Field'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '@/shared/ui/icons'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import {
  contentAudienceSchema,
  type CmsPlanTemplateStop,
  type ContentAudience,
  type PlanTemplateStatus,
} from '@/shared/api/contracts'
import {
  fetchPlanTemplate,
  setPlanTemplateStatus,
  setPlanTemplateStops,
  updatePlanTemplate,
  type PlanTemplateStopInput,
} from './api'
import { PlanTemplateStatusBadge } from './planTemplateStatus'
import { styles } from './planTemplate.style'

/** The lifecycle the server declares. `archived` is terminal. */
const TRANSITIONS: Record<PlanTemplateStatus, PlanTemplateStatus[]> = {
  draft: ['published', 'archived'],
  published: ['draft', 'archived'],
  archived: [],
}

const DEFAULT_STOP_MINUTES = 60

/** A stored stop, reduced to exactly what `PUT /stops` accepts back. */
function toInput(stop: CmsPlanTemplateStop): PlanTemplateStopInput {
  return {
    categoryTaxonomyId: stop.categoryTaxonomyId ?? '',
    expectedDurationMinutes: stop.expectedDurationMinutes ?? DEFAULT_STOP_MINUTES,
    ...(stop.preferredPlaceId ? { preferredPlaceId: stop.preferredPlaceId } : {}),
    ...(stop.isOptional ? { isOptional: true } : {}),
    ...(stop.budget ? { budget: stop.budget } : {}),
    ...(stop.note ? { note: stop.note } : {}),
  }
}

export default function PlanTemplateDetailScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canRead = can('planTemplate.read')
  const canManage = can('planTemplate.manage')

  const query = useQuery({
    queryKey: queryKeys.planTemplates.detail(id),
    queryFn: ({ signal }) => fetchPlanTemplate(id, signal),
    enabled: canRead && Boolean(id),
  })
  const detail = query.data

  /** Stop categories come from the taxonomy the contract names: kind `category`. */
  const categories = useQuery({
    queryKey: queryKeys.taxonomies.byKind('category'),
    queryFn: ({ signal }) => fetchTaxonomies({ kind: 'category', isActive: true }, signal),
    enabled: canRead,
    staleTime: 60_000,
  })

  const [form, setForm] = useState({
    internalName: '',
    title: '',
    description: '',
    areaKey: '',
    audience: '' as ContentAudience | '',
  })

  useEffect(() => {
    if (!detail) return
    setForm({
      internalName: detail.internalName,
      title: detail.title,
      description: detail.description ?? '',
      areaKey: detail.areaKey ?? '',
      audience: detail.audience ?? '',
    })
  }, [detail])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.planTemplates.all })
  }

  const save = useMutation({
    mutationFn: () =>
      updatePlanTemplate(id, {
        internalName: form.internalName,
        title: form.title,
        description: form.description,
        areaKey: form.areaKey,
        ...(form.audience ? { audience: form.audience } : {}),
      }),
    onSuccess: () => {
      toast.success(t('planTemplates.saved'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changeStatus = useMutation({
    mutationFn: (status: PlanTemplateStatus) => setPlanTemplateStatus(id, status),
    onSuccess: () => {
      toast.success(t('planTemplates.statusChanged'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const saveStops = useMutation({
    mutationFn: (stops: PlanTemplateStopInput[]) => setPlanTemplateStops(id, stops),
    onSuccess: () => {
      toast.success(t('planTemplates.stopsSaved'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('planTemplates.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  /** Every stop mutation is a full replace — the contract has no other shape. */
  const replaceStops = (next: PlanTemplateStopInput[]) => saveStops.mutate(next)

  const stopsOf = () => (detail?.stops ?? []).map(toInput)

  const move = (from: number, to: number) => {
    const next = stopsOf()
    const moved = next[from]
    if (!moved || to < 0 || to >= next.length) return
    next.splice(from, 1)
    next.splice(to, 0, moved)
    replaceStops(next)
  }

  const remove = (index: number) => {
    const next = stopsOf()
    next.splice(index, 1)
    replaceStops(next)
  }

  const addStop = () => {
    const firstCategory = categories.data?.[0]
    if (!firstCategory) {
      toast.error(t('planTemplates.needCategory'))
      return
    }
    replaceStops([
      ...stopsOf(),
      {
        categoryTaxonomyId: firstCategory.id,
        expectedDurationMinutes: DEFAULT_STOP_MINUTES,
      },
    ])
  }

  const patchStop = (index: number, patch: Partial<PlanTemplateStopInput>) => {
    const next = stopsOf()
    const current = next[index]
    if (!current) return
    next[index] = { ...current, ...patch }
    replaceStops(next)
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('planTemplates.breadcrumb'), to: '/plan-templates' },
          { label: detail?.internalName ?? '' },
        ]}
        title={detail?.title ?? t('planTemplates.title')}
        showSearch={false}
        actions={detail ? <PlanTemplateStatusBadge status={detail.status} /> : null}
      />
      <PageBody>
        <p className={styles.separation}>{t('planTemplates.separationNote')}</p>

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
                    title={t('planTemplates.editTitle')}
                    hint={t('planTemplates.editHint')}
                  />
                  <CardBody>
                    <div className={styles.formGrid}>
                      <TextInput
                        label={t('planTemplates.field.internalName')}
                        value={form.internalName}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, internalName: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('planTemplates.field.slug')}
                        value={item!.slug}
                        readOnly
                        disabled
                        hint={t('recommendations.slugImmutable')}
                      />
                      <TextInput
                        label={t('planTemplates.field.title')}
                        value={form.title}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, title: event.target.value }))
                        }
                      />
                      <Select
                        label={t('planTemplates.field.audience')}
                        value={form.audience}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            audience: event.target.value as ContentAudience | '',
                          }))
                        }
                      >
                        <option value="">{t('recommendations.filter.audienceAll')}</option>
                        {contentAudienceSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {t(`recommendations.audience.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      <TextInput
                        label={t('planTemplates.field.areaKey')}
                        value={form.areaKey}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, areaKey: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('planTemplates.field.budget')}
                        value={
                          item!.budget
                            ? `${formatMoneyRange(
                                item!.budget.min,
                                item!.budget.max,
                                item!.budget.currency,
                                locale,
                              )} · ${t(`planTemplates.scope.${item!.budget.scope}` as const)}`
                            : '—'
                        }
                        readOnly
                        disabled
                        hint={t('planTemplates.budgetReadOnly')}
                      />
                      <TextArea
                        label={t('planTemplates.field.description')}
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
                      {t('planTemplates.save')}
                    </Button>
                  </div>
                </Card>

                <Card className="mt-5">
                  <CardHeader
                    title={t('planTemplates.stops')}
                    hint={t('planTemplates.stopsHint')}
                    actions={
                      canManage ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          iconLeft={<PlusIcon size={14} />}
                          disabled={!online || saveStops.isPending || item!.stops.length >= 20}
                          onClick={addStop}
                        >
                          {t('planTemplates.addStop')}
                        </Button>
                      ) : null
                    }
                  />

                  {item!.stops.length === 0 ? (
                    <div className="px-5 py-4">
                      <EmptyState
                        title={t('planTemplates.noStops')}
                        hint={t('planTemplates.noStopsHint')}
                      />
                    </div>
                  ) : (
                    item!.stops.map((stop, index) => (
                      <div key={stop.id} className={styles.stopRow}>
                        <div className={styles.stopHead}>
                          {/* Position is stored, so it is shown rather than implied. */}
                          <span className={styles.stopPos}>{stop.position + 1}</span>
                          <div className="min-w-0">
                            <p className={styles.stopTitle}>{stop.categoryKey}</p>
                            <p className={styles.stopMeta}>
                              {stop.preferredPlaceName ?? t('planTemplates.anyPlace')}
                              {stop.expectedDurationMinutes != null
                                ? ` · ${t('planTemplates.minutes', {
                                    value: String(stop.expectedDurationMinutes),
                                  })}`
                                : ''}
                              {stop.budget
                                ? ` · ${formatMoneyRange(
                                    stop.budget.min,
                                    stop.budget.max,
                                    stop.budget.currency,
                                    locale,
                                  )} · ${t(`planTemplates.scope.${stop.budget.scope}` as const)}`
                                : ''}
                            </p>
                          </div>
                          <div className={styles.stopActions}>
                            <IconButton
                              label={t('planTemplates.moveUp', { position: stop.position + 1 })}
                              disabled={!canManage || index === 0 || saveStops.isPending || !online}
                              onClick={() => move(index, index - 1)}
                            >
                              <ChevronLeftIcon size={14} className="rotate-90" />
                            </IconButton>
                            <IconButton
                              label={t('planTemplates.moveDown', { position: stop.position + 1 })}
                              disabled={
                                !canManage ||
                                index === item!.stops.length - 1 ||
                                saveStops.isPending ||
                                !online
                              }
                              onClick={() => move(index, index + 1)}
                            >
                              <ChevronRightIcon size={14} className="rotate-90" />
                            </IconButton>
                            <IconButton
                              label={t('planTemplates.removeStop', { position: stop.position + 1 })}
                              tone="danger"
                              disabled={!canManage || saveStops.isPending || !online}
                              onClick={() => remove(index)}
                            >
                              <TrashIcon size={14} />
                            </IconButton>
                          </div>
                        </div>

                        <div className={styles.stopGrid}>
                          <Select
                            label={t('planTemplates.stopCategory')}
                            value={stop.categoryTaxonomyId ?? ''}
                            disabled={!canManage || saveStops.isPending}
                            onChange={(event) =>
                              patchStop(index, { categoryTaxonomyId: event.target.value })
                            }
                          >
                            {(categories.data ?? []).map((taxonomy) => (
                              <option key={taxonomy.id} value={taxonomy.id}>
                                {taxonomy.key}
                              </option>
                            ))}
                          </Select>
                          <TextInput
                            label={t('planTemplates.stopDuration')}
                            inputMode="numeric"
                            defaultValue={String(
                              stop.expectedDurationMinutes ?? DEFAULT_STOP_MINUTES,
                            )}
                            disabled={!canManage || saveStops.isPending}
                            onBlur={(event) => {
                              const minutes = Number(event.target.value)
                              if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) return
                              if (minutes === stop.expectedDurationMinutes) return
                              patchStop(index, { expectedDurationMinutes: minutes })
                            }}
                          />
                          <Toggle
                            label={t('planTemplates.stopOptional')}
                            checked={stop.isOptional}
                            disabled={!canManage || saveStops.isPending}
                            onChange={(checked) => patchStop(index, { isOptional: checked })}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </Card>
              </div>

              <div className={styles.side}>
                <Card>
                  <CardHeader
                    title={t('planTemplates.lifecycle')}
                    hint={t('planTemplates.lifecycleHint')}
                  />
                  <div className={styles.statusRow}>
                    {TRANSITIONS[item!.status].length === 0 ? (
                      <p className="text-xs text-text-muted">{t('planTemplates.terminal')}</p>
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
                          {t(`planTemplates.moveTo.${next}` as const)}
                        </Button>
                      ))
                    )}
                  </div>
                  <p className={styles.note}>
                    <span aria-hidden="true">ℹ</span>
                    {t('planTemplates.publishRule')}
                  </p>
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
                      onClick={() => navigate('/plan-templates')}
                    >
                      {t('planTemplates.backToList')}
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
