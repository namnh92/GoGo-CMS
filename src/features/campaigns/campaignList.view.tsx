import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { InlineSelect, SearchInput, Select, TextArea, TextInput } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import { Drawer } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { PlusIcon } from '@/shared/ui/icons'
import {
  campaignAudienceSchema,
  campaignPlatformSchema,
  campaignStatusSchema,
  type CampaignAudience,
  type CampaignPlatform,
  type CampaignStatus,
  type CmsCampaign,
} from '@/shared/api/contracts'
import { createCampaign, fetchCampaigns, type CampaignFilters } from './api'
import { CampaignStatusBadge } from './campaignStatus'
import { styles } from './campaign.style'

const PAGE_SIZE = 25

/**
 * Notification campaigns.
 *
 * Composed here, **sent by the worker**. Nothing on this screen or the detail
 * screen reaches a push provider: scheduling writes a row, and a worker tick
 * picks up what is due, resolves the audience then, and dispatches through the
 * adapter. That separation is the whole design — a campaign that has gone out
 * cannot be recalled.
 */
export default function CampaignListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const describeError = useErrorMessage()

  const [status, setStatus] = useState('')
  const [audienceType, setAudienceType] = useState('')
  const [search, setSearch] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  const canRead = can('campaign.read')
  const canManage = can('campaign.manage')

  const filters: CampaignFilters = {
    ...(status ? { status: status as CampaignStatus } : {}),
    ...(audienceType ? { audienceType: audienceType as CampaignAudience } : {}),
    q: search || undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.campaigns.list(filters),
    queryFn: ({ signal }) => fetchCampaigns(filters, signal),
    enabled: canRead,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  const [form, setForm] = useState({
    name: '',
    title: '',
    body: '',
    audienceType: 'all' as CampaignAudience,
    platform: 'ios' as CampaignPlatform,
  })
  const [errors, setErrors] = useState<{ name?: boolean; title?: boolean; body?: boolean }>({})

  const create = useMutation({
    mutationFn: createCampaign,
    onSuccess: (created) => {
      toast.success(t('campaigns.created', { name: created.name }))
      setCreateOpen(false)
      setForm({ name: '', title: '', body: '', audienceType: 'all', platform: 'ios' })
      setErrors({})
      void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      // Into the editor: a draft still needs a destination and a delivery time,
      // and both live there.
      navigate(`/campaigns/${created.id}`)
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const submit = () => {
    const next: typeof errors = {}
    if (form.name.trim().length < 3) next.name = true
    if (form.title.trim() === '') next.title = true
    if (form.body.trim() === '') next.body = true
    setErrors(next)
    if (Object.keys(next).length > 0) return
    create.mutate({
      name: form.name.trim(),
      title: form.title.trim(),
      body: form.body.trim(),
      audienceType: form.audienceType,
      // Closed per audience type: only `platform` carries a filter.
      audienceFilter: form.audienceType === 'platform' ? { platform: form.platform } : {},
    })
  }

  const columns = useMemo<ColumnDef<CmsCampaign, unknown>[]>(
    () => [
      {
        id: 'name',
        header: () => t('campaigns.col.name'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.name}</p>
            <p className={styles.sub}>{row.original.title}</p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'audience',
        header: () => t('campaigns.col.audience'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {t(`campaigns.audience.${row.original.audienceType}` as const)}
            {row.original.audienceType === 'platform' && row.original.audienceFilter.platform
              ? ` · ${String(row.original.audienceFilter.platform)}`
              : ''}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'schedule',
        header: () => t('campaigns.col.schedule'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.scheduledAt
              ? formatDateTime(row.original.scheduledAt, locale)
              : t('campaigns.notScheduled')}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'sent',
        header: () => t('campaigns.col.sent'),
        cell: ({ row }) =>
          // Absent until the worker has run: a zero here would read as "sent to
          // nobody" rather than "not sent yet".
          row.original.status === 'sent' || row.original.status === 'sending' ? (
            <span className={styles.count}>
              {formatNumber(row.original.sentCount, locale)}
              {row.original.failedCount > 0
                ? ` · ${t('campaigns.failedShort', {
                    count: formatNumber(row.original.failedCount, locale),
                  })}`
                : ''}
            </span>
          ) : (
            <span className={styles.muted}>{t('campaigns.notSentYet')}</span>
          ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('campaigns.col.status'),
        cell: ({ row }) => <CampaignStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'updatedAt',
        header: () => t('campaigns.col.updatedAt'),
        cell: ({ row }) => (
          <span className={styles.muted}>{formatDateTime(row.original.updatedAt, locale)}</span>
        ),
        enableSorting: false,
      },
    ],
    [t, locale],
  )

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

  const page = query.data
  const nextCursor = page?.nextCursor ?? null

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('campaigns.breadcrumb') }]}
        title={t('campaigns.title')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={14} />}
              onClick={() => setCreateOpen(true)}
            >
              {t('campaigns.new')}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <SearchInput
              label={t('campaigns.filter.search')}
              placeholder={t('campaigns.filter.search')}
              className={styles.search}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPaging()
              }}
            />
            <InlineSelect
              label={t('campaigns.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('campaigns.filter.statusAll')}</option>
              {campaignStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`campaigns.status.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('campaigns.col.audience')}
              value={audienceType}
              onChange={(event) => {
                setAudienceType(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('campaigns.filter.audienceAll')}</option>
              {campaignAudienceSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`campaigns.audience.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
          </div>

          <AsyncBoundary
            status={query.status}
            error={query.error}
            data={page?.items ?? []}
            isEmpty={(items) => items.length === 0}
            onRetry={() => void query.refetch()}
            empty={<EmptyState title={t('campaigns.empty')} hint={t('campaigns.emptyHint')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('campaigns.title')}
                  onRowClick={(row) => navigate(`/campaigns/${row.id}`)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('campaigns.pageInfo', {
                      shown: formatNumber(items.length, locale),
                      total: formatNumber(page?.totalCount ?? 0, locale),
                    })}
                  </p>
                  <div className={styles.pagerActions}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pageIndex === 0}
                      onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
                    >
                      {t('action.previous')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={nextCursor === null}
                      onClick={() => {
                        setCursors((current) => {
                          const next = current.slice(0, pageIndex + 1)
                          next.push(nextCursor)
                          return next
                        })
                        setPageIndex((index) => index + 1)
                      }}
                    >
                      {t('action.next')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </AsyncBoundary>
        </Card>
      </PageBody>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('campaigns.new')}
        description={t('campaigns.newHint')}
        width="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={submit}>
              {t('campaigns.create')}
            </Button>
          </div>
        }
      >
        <form className={styles.formGrid} onSubmit={(event) => event.preventDefault()} noValidate>
          <TextInput
            label={t('campaigns.field.name')}
            required
            hint={t('campaigns.field.nameHint')}
            error={errors.name ? t('campaigns.error.name') : undefined}
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <Select
            label={t('campaigns.field.audienceType')}
            required
            value={form.audienceType}
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
          <TextInput
            label={t('campaigns.field.pushTitle')}
            required
            maxLength={80}
            hint={t('campaigns.field.pushTitleHint')}
            error={errors.title ? t('campaigns.error.required') : undefined}
            value={form.title}
            className={form.audienceType === 'platform' ? undefined : styles.formFull}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
          <TextArea
            label={t('campaigns.field.pushBody')}
            required
            rows={3}
            maxLength={300}
            className={styles.formFull}
            error={errors.body ? t('campaigns.error.required') : undefined}
            value={form.body}
            onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
          />
          <p className={`${styles.formNote} ${styles.formFull}`}>
            <span aria-hidden="true">ℹ</span>
            {t('campaigns.createNote')}
          </p>
        </form>
      </Drawer>
    </>
  )
}
