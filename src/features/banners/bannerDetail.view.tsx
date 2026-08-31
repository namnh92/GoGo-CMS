import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextInput } from '@/shared/ui/Field'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { ImageUploadField } from '@/features/media/imageUpload.view'
import {
  bannerDestinationSchema,
  bannerPlacementSchema,
  contentAudienceSchema,
  type BannerDestination,
  type BannerPlacement,
  type BannerStatus,
  type ContentAudience,
} from '@/shared/api/contracts'
import { fetchBanner, setBannerStatus, updateBanner } from './api'
import { checkDestination, isValidWindow, toIso, toLocalInput } from './destination'
import { BannerStatusBadge } from './bannerStatus'
import { styles } from './banner.style'

/** The destination type that carries nothing. */
const TAKES_NO_VALUE = ['none'] as const

/**
 * The lifecycle a person controls. `expired` is absent because nobody sets it:
 * the server computes it from the end time on every read.
 */
const TRANSITIONS: Record<BannerStatus, BannerStatus[]> = {
  draft: ['scheduled', 'published', 'archived'],
  scheduled: ['draft', 'published', 'archived'],
  published: ['draft', 'archived'],
  archived: ['draft'],
}

export default function BannerDetailScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { id = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canRead = can('banner.read')
  const canManage = can('banner.manage')
  const canUpload = can('upload.create')

  const query = useQuery({
    queryKey: queryKeys.banners.detail(id),
    queryFn: ({ signal }) => fetchBanner(id, signal),
    enabled: canRead && Boolean(id),
  })
  const banner = query.data

  const [form, setForm] = useState({
    name: '',
    title: '',
    subtitle: '',
    ctaLabel: '',
    placement: 'home_hero' as BannerPlacement,
    destinationType: 'none' as BannerDestination,
    destinationValue: '',
    audience: '' as ContentAudience | '',
    startsAt: '',
    endsAt: '',
    priority: '0',
  })
  const [image, setImage] = useState<{ key: string; readUrl: string | null }>({
    key: '',
    readUrl: null,
  })
  const [errors, setErrors] = useState<{
    name?: boolean
    destination?: 'required' | 'forbidden' | 'url'
    window?: boolean
  }>({})

  useEffect(() => {
    if (!banner) return
    setForm({
      name: banner.name,
      title: banner.title ?? '',
      subtitle: banner.subtitle ?? '',
      ctaLabel: banner.ctaLabel ?? '',
      placement: banner.placement,
      destinationType: banner.destinationType,
      destinationValue: banner.destinationValue ?? '',
      audience: banner.audience ?? '',
      startsAt: toLocalInput(banner.startsAt),
      endsAt: toLocalInput(banner.endsAt),
      priority: String(banner.priority),
    })
    setImage({ key: banner.imageKey, readUrl: banner.imageUrl ?? null })
    setErrors({})
  }, [banner])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.banners.all })
  }

  const save = useMutation({
    mutationFn: (input: Parameters<typeof updateBanner>[1]) => updateBanner(id, input),
    onSuccess: () => {
      toast.success(t('banners.saved'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changeStatus = useMutation({
    mutationFn: (status: BannerStatus) => setBannerStatus(id, status),
    onSuccess: () => {
      toast.success(t('banners.statusChanged'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('banners.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const submit = () => {
    const next: typeof errors = {}
    if (form.name.trim().length < 3) next.name = true
    const destination = checkDestination(
      form.destinationType,
      form.destinationValue,
      TAKES_NO_VALUE,
    )
    if (!destination.ok) next.destination = destination.code
    if (!isValidWindow(form.startsAt, form.endsAt)) next.window = true
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const priority = Number(form.priority)
    save.mutate({
      name: form.name.trim(),
      imageKey: image.key,
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      ctaLabel: form.ctaLabel.trim(),
      placement: form.placement,
      destinationType: form.destinationType,
      // A type that takes nothing sends nothing, not an empty string.
      ...(TAKES_NO_VALUE.includes(form.destinationType as 'none')
        ? {}
        : { destinationValue: form.destinationValue.trim() }),
      ...(form.audience ? { audience: form.audience } : {}),
      ...(toIso(form.startsAt) ? { startsAt: toIso(form.startsAt) } : {}),
      ...(toIso(form.endsAt) ? { endsAt: toIso(form.endsAt) } : {}),
      ...(Number.isInteger(priority) ? { priority } : {}),
    })
  }

  const destinationError =
    errors.destination === 'required'
      ? t('banners.error.destinationRequired')
      : errors.destination === 'forbidden'
        ? t('banners.error.destinationForbidden')
        : errors.destination === 'url'
          ? t('banners.error.destinationUrl')
          : undefined

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('banners.breadcrumb'), to: '/banners' },
          { label: banner?.name ?? '' },
        ]}
        title={banner?.name ?? t('banners.title')}
        showSearch={false}
        actions={banner ? <BannerStatusBadge status={banner.status} /> : null}
      />
      <PageBody>
        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={banner ? [banner] : []}
          isEmpty={(items) => items.length === 0}
          onRetry={() => void query.refetch()}
          empty={<EmptyState />}
        >
          {([item]) => (
            <div className={styles.layout}>
              <div className={styles.main}>
                <Card>
                  <CardHeader title={t('banners.editTitle')} hint={t('banners.editHint')} />
                  <CardBody>
                    <div className={styles.formGrid}>
                      <TextInput
                        label={t('banners.field.name')}
                        required
                        hint={t('banners.field.nameHint')}
                        value={form.name}
                        disabled={!canManage}
                        error={errors.name ? t('banners.error.name') : undefined}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                      <Select
                        label={t('banners.field.placement')}
                        value={form.placement}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            placement: event.target.value as BannerPlacement,
                          }))
                        }
                      >
                        {bannerPlacementSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {t(`banners.placement.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      <TextInput
                        label={t('banners.field.bannerTitle')}
                        value={form.title}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, title: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('banners.field.subtitle')}
                        value={form.subtitle}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, subtitle: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('banners.field.ctaLabel')}
                        value={form.ctaLabel}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, ctaLabel: event.target.value }))
                        }
                      />
                      <Select
                        label={t('banners.field.audience')}
                        value={form.audience}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            audience: event.target.value as ContentAudience | '',
                          }))
                        }
                      >
                        <option value="">{t('banners.audienceAll')}</option>
                        {contentAudienceSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {t(`recommendations.audience.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      <Select
                        label={t('banners.field.destinationType')}
                        value={form.destinationType}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            destinationType: event.target.value as BannerDestination,
                            // The value belongs to the old type; keeping it
                            // would send an id under a type that cannot resolve it.
                            destinationValue: '',
                          }))
                        }
                      >
                        {bannerDestinationSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {t(`banners.destination.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      <TextInput
                        label={t('banners.field.destinationValue')}
                        value={form.destinationValue}
                        disabled={!canManage || form.destinationType === 'none'}
                        hint={
                          form.destinationType === 'external_url'
                            ? t('banners.field.destinationUrlHint')
                            : t('banners.field.destinationIdHint')
                        }
                        error={destinationError}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            destinationValue: event.target.value,
                          }))
                        }
                      />
                      <TextInput
                        label={t('banners.field.startsAt')}
                        type="datetime-local"
                        value={form.startsAt}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, startsAt: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('banners.field.endsAt')}
                        type="datetime-local"
                        value={form.endsAt}
                        disabled={!canManage}
                        error={errors.window ? t('banners.error.window') : undefined}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, endsAt: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('banners.field.priority')}
                        inputMode="numeric"
                        hint={t('banners.field.priorityHint')}
                        value={form.priority}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, priority: event.target.value }))
                        }
                      />
                      <div className={styles.formFull}>
                        <ImageUploadField
                          label={t('banners.field.image')}
                          purpose="banner_image"
                          required
                          disabled={!canManage || !canUpload}
                          imageKey={image.key}
                          previewUrl={image.readUrl}
                          onUploaded={setImage}
                        />
                      </div>
                    </div>
                  </CardBody>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      loading={save.isPending}
                      disabled={!canManage || !online}
                      onClick={submit}
                    >
                      {t('action.save')}
                    </Button>
                  </div>
                </Card>
              </div>

              <div className={styles.side}>
                <Card>
                  <CardHeader title={t('banners.previewTitle')} hint={t('banners.previewHint')} />
                  <div className={styles.previewCard}>
                    <div className={styles.previewFrame}>
                      {image.readUrl ? (
                        <img src={image.readUrl} alt="" className={styles.previewImage} />
                      ) : (
                        <p className={styles.previewEmpty}>{t('banners.noPreview')}</p>
                      )}
                      <div className={styles.previewBody}>
                        <p className={styles.previewTitle}>{form.title || item!.name}</p>
                        {form.subtitle ? (
                          <p className={styles.previewSubtitle}>{form.subtitle}</p>
                        ) : null}
                        {form.ctaLabel ? (
                          <span className={styles.previewCta}>{form.ctaLabel}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title={t('banners.lifecycleTitle')}
                    hint={t('banners.lifecycleHint')}
                  />
                  <div className={styles.statusRow}>
                    {TRANSITIONS[item!.lifecycleStatus].map((next) => (
                      <Button
                        key={next}
                        size="sm"
                        variant={next === 'published' ? 'primary' : 'secondary'}
                        loading={changeStatus.isPending && changeStatus.variables === next}
                        disabled={!canManage || !online}
                        onClick={() => changeStatus.mutate(next)}
                      >
                        {t(`banners.transition.${next}` as const)}
                      </Button>
                    ))}
                  </div>
                  {item!.status === 'expired' ? (
                    <p className={styles.note}>
                      <span aria-hidden="true">⚠</span>
                      {t('banners.expiredNote')}
                    </p>
                  ) : null}
                </Card>

                <Card>
                  <CardHeader title={t('banners.factsTitle')} />
                  <div className={styles.facts}>
                    <div>
                      <p className={styles.factLabel}>{t('banners.field.lifecycleStatus')}</p>
                      <p className={styles.factValue}>
                        {t(`banners.status.${item!.lifecycleStatus}` as const)}
                      </p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('banners.col.status')}</p>
                      <p className={styles.factValue}>
                        {t(`banners.status.${item!.status}` as const)}
                      </p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('banners.col.updatedAt')}</p>
                      <p className={styles.factValue}>{formatDateTime(item!.updatedAt, locale)}</p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('banners.field.createdAt')}</p>
                      <p className={styles.factValue}>{formatDateTime(item!.createdAt, locale)}</p>
                    </div>
                  </div>
                  <p className={styles.hint}>{t('banners.effectiveNote')}</p>
                </Card>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}
