import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime, formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { ImageUploadField } from '@/features/media/imageUpload.view'
import { checkDestination, toIso, toLocalInput } from '@/shared/api/destination'
import {
  campaignAudienceSchema,
  campaignDestinationSchema,
  campaignPlatformSchema,
  type CampaignAudience,
  type CampaignDestination,
  type CampaignPlatform,
} from '@/shared/api/contracts'
import {
  cancelCampaign,
  estimateCampaignAudience,
  fetchCampaign,
  scheduleCampaign,
  testSendCampaign,
  updateCampaign,
} from './api'
import { campaignErrorMessage } from './campaignError'
import { CampaignStatusBadge } from './campaignStatus'
import { styles } from './campaign.style'

/** The destination types that carry nothing. */
const TAKES_NO_VALUE = ['home', 'saved'] as const

/** Editing is only meaningful while nothing has been sent. */
const EDITABLE = new Set(['draft', 'cancelled', 'failed'])

export default function CampaignDetailScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { id = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canRead = can('campaign.read')
  const canManage = can('campaign.manage')

  const query = useQuery({
    queryKey: queryKeys.campaigns.detail(id),
    queryFn: ({ signal }) => fetchCampaign(id, signal),
    enabled: canRead && Boolean(id),
  })
  const campaign = query.data

  const [form, setForm] = useState({
    name: '',
    title: '',
    body: '',
    ctaLabel: '',
    audienceType: 'all' as CampaignAudience,
    platform: 'ios' as CampaignPlatform,
    destinationType: 'home' as CampaignDestination,
    destinationValue: '',
  })
  const [image, setImage] = useState<{ key: string; readUrl: string | null }>({
    key: '',
    readUrl: null,
  })
  const [sendAt, setSendAt] = useState('')
  const [errors, setErrors] = useState<{
    name?: boolean
    title?: boolean
    body?: boolean
    destination?: 'required' | 'forbidden' | 'url' | 'id'
  }>({})
  const [confirmSend, setConfirmSend] = useState(false)

  useEffect(() => {
    if (!campaign) return
    setForm({
      name: campaign.name,
      title: campaign.title,
      body: campaign.body,
      ctaLabel: campaign.ctaLabel ?? '',
      audienceType: campaign.audienceType,
      platform: (campaign.audienceFilter.platform as CampaignPlatform) ?? 'ios',
      destinationType: campaign.destinationType,
      destinationValue: campaign.destinationValue ?? '',
    })
    setImage({ key: campaign.imageKey ?? '', readUrl: null })
    setSendAt(toLocalInput(campaign.scheduledAt))
    setErrors({})
  }, [campaign])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
  }

  const editable = campaign ? EDITABLE.has(campaign.status) : false

  /**
   * The estimate is a read with no side effect, but it is not free and it is
   * only meaningful for a campaign that has not gone out — so it is fetched
   * when the campaign is still editable, and never as part of sending.
   */
  const estimate = useQuery({
    queryKey: queryKeys.campaigns.estimate(id),
    queryFn: ({ signal }) => estimateCampaignAudience(id, signal),
    enabled: canRead && Boolean(id) && editable,
    staleTime: 30_000,
  })

  const save = useMutation({
    mutationFn: (input: Parameters<typeof updateCampaign>[1]) => updateCampaign(id, input),
    onSuccess: () => {
      toast.success(t('campaigns.saved'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const schedule = useMutation({
    mutationFn: (when?: string) => scheduleCampaign(id, when),
    onSuccess: () => {
      toast.success(t('campaigns.scheduled'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const cancel = useMutation({
    mutationFn: () => cancelCampaign(id),
    onSuccess: () => {
      toast.success(t('campaigns.cancelled'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const testSend = useMutation({
    mutationFn: () => testSendCampaign(id),
    onSuccess: () => {
      toast.success(t('campaigns.testSent'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('campaigns.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const submit = () => {
    const next: typeof errors = {}
    if (form.name.trim().length < 3) next.name = true
    if (form.title.trim() === '') next.title = true
    if (form.body.trim() === '') next.body = true
    // The server checks the id's shape before it asks the database, so a typo
    // is refused as a typo rather than as "that content does not exist".
    const destination = checkDestination(
      form.destinationType,
      form.destinationValue,
      TAKES_NO_VALUE,
      true,
    )
    if (!destination.ok) next.destination = destination.code
    setErrors(next)
    if (Object.keys(next).length > 0) return

    save.mutate({
      name: form.name.trim(),
      title: form.title.trim(),
      body: form.body.trim(),
      ctaLabel: form.ctaLabel.trim(),
      audienceType: form.audienceType,
      audienceFilter: form.audienceType === 'platform' ? { platform: form.platform } : {},
      destinationType: form.destinationType,
      ...(TAKES_NO_VALUE.includes(form.destinationType as 'home')
        ? {}
        : { destinationValue: form.destinationValue.trim() }),
      ...(image.key ? { imageKey: image.key } : {}),
    })
  }

  const destinationError =
    errors.destination === 'required'
      ? t('campaigns.error.destinationRequired')
      : errors.destination === 'forbidden'
        ? t('campaigns.error.destinationForbidden')
        : errors.destination === 'url'
          ? t('campaigns.error.destinationUrl')
          : errors.destination === 'id'
            ? t('campaigns.error.destinationId')
            : undefined

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('campaigns.breadcrumb'), to: '/campaigns' },
          { label: campaign?.name ?? '' },
        ]}
        title={campaign?.name ?? t('campaigns.title')}
        showSearch={false}
        actions={campaign ? <CampaignStatusBadge status={campaign.status} /> : null}
      />
      <PageBody>
        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={campaign ? [campaign] : []}
          isEmpty={(items) => items.length === 0}
          onRetry={() => void query.refetch()}
          empty={<EmptyState />}
        >
          {([item]) => (
            <div className={styles.layout}>
              <div className={styles.main}>
                <Card>
                  <CardHeader
                    title={t('campaigns.contentTitle')}
                    hint={t('campaigns.contentHint')}
                  />
                  {!editable ? (
                    <p className={styles.hint}>{t('campaigns.notEditableNote')}</p>
                  ) : null}
                  <CardBody>
                    <div className={styles.formGrid}>
                      <TextInput
                        label={t('campaigns.field.name')}
                        required
                        hint={t('campaigns.field.nameHint')}
                        value={form.name}
                        disabled={!canManage || !editable}
                        error={errors.name ? t('campaigns.error.name') : undefined}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('campaigns.field.ctaLabel')}
                        maxLength={40}
                        value={form.ctaLabel}
                        disabled={!canManage || !editable}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, ctaLabel: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('campaigns.field.pushTitle')}
                        required
                        maxLength={80}
                        className={styles.formFull}
                        value={form.title}
                        disabled={!canManage || !editable}
                        error={errors.title ? t('campaigns.error.required') : undefined}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, title: event.target.value }))
                        }
                      />
                      <TextArea
                        label={t('campaigns.field.pushBody')}
                        required
                        rows={3}
                        maxLength={300}
                        className={styles.formFull}
                        value={form.body}
                        disabled={!canManage || !editable}
                        error={errors.body ? t('campaigns.error.required') : undefined}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, body: event.target.value }))
                        }
                      />
                      <div className={styles.formFull}>
                        <ImageUploadField
                          label={t('campaigns.field.image')}
                          purpose="campaign_image"
                          disabled={!canManage || !editable}
                          imageKey={image.key}
                          previewUrl={image.readUrl}
                          onUploaded={setImage}
                        />
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title={t('campaigns.audienceTitle')}
                    hint={t('campaigns.audienceHint')}
                  />
                  <CardBody>
                    <div className={styles.formGrid}>
                      <Select
                        label={t('campaigns.field.audienceType')}
                        value={form.audienceType}
                        disabled={!canManage || !editable}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            audienceType: event.target.value as CampaignAudience,
                          }))
                        }
                      >
                        {campaignAudienceSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {t(`campaigns.audience.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      {form.audienceType === 'platform' ? (
                        <Select
                          label={t('campaigns.field.platform')}
                          value={form.platform}
                          disabled={!canManage || !editable}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              platform: event.target.value as CampaignPlatform,
                            }))
                          }
                        >
                          {campaignPlatformSchema.options.map((value) => (
                            <option key={value} value={value}>
                              {t(`campaigns.platform.${value}` as const)}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                      <Select
                        label={t('campaigns.field.destinationType')}
                        value={form.destinationType}
                        disabled={!canManage || !editable}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            destinationType: event.target.value as CampaignDestination,
                            // The value belongs to the old type; an id written
                            // for one cannot resolve under another.
                            destinationValue: '',
                          }))
                        }
                      >
                        {campaignDestinationSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {t(`campaigns.destination.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      <TextInput
                        label={t('campaigns.field.destinationValue')}
                        value={form.destinationValue}
                        disabled={
                          !canManage ||
                          !editable ||
                          TAKES_NO_VALUE.includes(form.destinationType as 'home')
                        }
                        hint={
                          form.destinationType === 'external_url'
                            ? t('campaigns.field.destinationUrlHint')
                            : t('campaigns.field.destinationIdHint')
                        }
                        error={destinationError}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            destinationValue: event.target.value,
                          }))
                        }
                      />
                      <p className={`${styles.deliveryNote} ${styles.formFull}`}>
                        {t('campaigns.audienceOmittedNote')}
                      </p>
                    </div>
                  </CardBody>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      loading={save.isPending}
                      disabled={!canManage || !editable || !online}
                      onClick={submit}
                    >
                      {t('action.save')}
                    </Button>
                  </div>
                </Card>
              </div>

              <div className={styles.side}>
                <Card>
                  <CardHeader
                    title={t('campaigns.previewTitle')}
                    hint={t('campaigns.previewHint')}
                  />
                  <div className={styles.previewWrap}>
                    <div className={styles.phone}>
                      <p className={styles.phoneLabel}>{t('campaigns.previewDevice')}</p>
                      <div className={styles.push}>
                        <span className={styles.pushIcon} aria-hidden="true" />
                        <div className={styles.pushBody}>
                          <p className={styles.pushTitle}>{form.title || item!.title}</p>
                          <p className={styles.pushText}>{form.body || item!.body}</p>
                          {form.ctaLabel ? (
                            <span className={styles.pushCta}>{form.ctaLabel}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title={t('campaigns.deliveryTitle')}
                    hint={t('campaigns.deliveryHint')}
                  />
                  <CardBody>
                    <div className="flex flex-col gap-3">
                      {editable ? (
                        <>
                          <TextInput
                            label={t('campaigns.field.sendAt')}
                            type="datetime-local"
                            hint={t('campaigns.field.sendAtHint')}
                            value={sendAt}
                            disabled={!canManage}
                            onChange={(event) => setSendAt(event.target.value)}
                          />
                          <p className={styles.deliveryNote}>{t('campaigns.workerNote')}</p>
                        </>
                      ) : null}

                      {estimate.data ? (
                        <p className={styles.deliveryNote}>
                          {t('campaigns.estimate', {
                            count: formatNumber(estimate.data.estimatedRecipients, locale),
                            at: formatDateTime(estimate.data.estimatedAt, locale),
                          })}
                        </p>
                      ) : null}
                    </div>
                  </CardBody>
                  <div className={styles.statusRow}>
                    {editable ? (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={schedule.isPending}
                        disabled={!canManage || !online}
                        onClick={() => setConfirmSend(true)}
                      >
                        {sendAt ? t('campaigns.schedule') : t('campaigns.sendNow')}
                      </Button>
                    ) : null}
                    {item!.status === 'scheduled' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={cancel.isPending}
                        disabled={!canManage || !online}
                        onClick={() => cancel.mutate()}
                      >
                        {t('campaigns.cancel')}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={testSend.isPending}
                      disabled={!canManage || !online}
                      onClick={() => testSend.mutate()}
                    >
                      {t('campaigns.testSend')}
                    </Button>
                  </div>
                  {item!.status === 'sending' ? (
                    <p className={styles.note}>
                      <span aria-hidden="true">⚠</span>
                      {t('campaigns.sendingNote')}
                    </p>
                  ) : null}
                  {item!.lastError ? (
                    <p className={styles.danger}>
                      <span aria-hidden="true">⚠</span>
                      {t('campaigns.lastError', { message: campaignErrorMessage(item!.lastError, t) })}
                    </p>
                  ) : null}
                  <p className={styles.hint}>{t('campaigns.testSendNote')}</p>
                </Card>

                <Card>
                  <CardHeader title={t('campaigns.deliveryFactsTitle')} />
                  <div className={styles.facts}>
                    <div>
                      <p className={styles.factLabel}>{t('campaigns.field.scheduledAt')}</p>
                      <p className={styles.factValue}>
                        {item!.scheduledAt
                          ? formatDateTime(item!.scheduledAt, locale)
                          : t('campaigns.notScheduled')}
                      </p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('campaigns.field.recipientCount')}</p>
                      <p className={styles.factValue}>
                        {/* Resolved at send time, so it is absent until the
                            worker has run — not zero. */}
                        {item!.recipientCount === null || item!.recipientCount === undefined
                          ? t('campaigns.resolvedAtSend')
                          : formatNumber(item!.recipientCount, locale)}
                      </p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('campaigns.field.sentCount')}</p>
                      <p className={styles.factValue}>
                        {/* Gated on the worker having run, not on the status.
                            GoGo-BE#516 ends a campaign that reached nobody as
                            `failed`, and that is exactly when these two numbers
                            are the only thing explaining what happened. */}
                        {item!.startedAt
                          ? formatNumber(item!.sentCount, locale)
                          : t('campaigns.notSentYet')}
                      </p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('campaigns.field.failedCount')}</p>
                      <p className={styles.factValue}>
                        {item!.startedAt
                          ? formatNumber(item!.failedCount, locale)
                          : t('campaigns.notSentYet')}
                      </p>
                    </div>
                  </div>
                  <p className={styles.hint}>{t('campaigns.sentCountNote')}</p>
                </Card>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </PageBody>

      {/* Not a bare "are you sure?": a send cannot be recalled, so the dialog
          shows exactly who it reaches, where it points and when it goes. */}
      <ConfirmDialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        title={sendAt ? t('campaigns.confirmScheduleTitle') : t('campaigns.confirmSendTitle')}
        description={t('campaigns.confirmSendBody')}
        changes={[
          {
            label: t('campaigns.field.audienceType'),
            to: `${t(`campaigns.audience.${form.audienceType}` as const)}${
              form.audienceType === 'platform'
                ? ` · ${t(`campaigns.platform.${form.platform}` as const)}`
                : ''
            }`,
            note: estimate.data
              ? t('campaigns.estimateShort', {
                  count: formatNumber(estimate.data.estimatedRecipients, locale),
                })
              : t('campaigns.resolvedAtSend'),
          },
          {
            label: t('campaigns.field.destinationType'),
            to: `${t(`campaigns.destination.${form.destinationType}` as const)}${
              form.destinationValue ? ` · ${form.destinationValue}` : ''
            }`,
          },
          {
            label: t('campaigns.field.sendAt'),
            to: sendAt ? formatDateTime(toIso(sendAt) ?? sendAt, locale) : t('campaigns.sendNow'),
          },
        ]}
        confirmLabel={sendAt ? t('campaigns.schedule') : t('campaigns.sendNow')}
        tone="danger"
        loading={schedule.isPending}
        onConfirm={() => {
          setConfirmSend(false)
          schedule.mutate(toIso(sendAt))
        }}
      />
    </>
  )
}
