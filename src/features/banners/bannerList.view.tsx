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
import { InlineSelect, SearchInput, Select, TextInput } from '@/shared/ui/Field'
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
import { ImageUploadField } from '@/features/media/imageUpload.view'
import {
  bannerEffectiveStatusSchema,
  bannerPlacementSchema,
  contentAudienceSchema,
  type BannerEffectiveStatus,
  type BannerPlacement,
  type CmsBanner,
  type ContentAudience,
} from '@/shared/api/contracts'
import { createBanner, fetchBanners, type BannerFilters } from './api'
import { BannerStatusBadge } from './bannerStatus'
import { styles } from './banner.style'

const PAGE_SIZE = 25

/**
 * Banners.
 *
 * A banner is an image, so `imageKey` is mandatory and the create form cannot
 * be submitted without one — it comes from `POST /cms/uploads` with purpose
 * `banner_image` and is bound to the banner on save.
 */
export default function BannerListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const describeError = useErrorMessage()

  const [placement, setPlacement] = useState('')
  const [status, setStatus] = useState('')
  const [audience, setAudience] = useState('')
  const [search, setSearch] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  const canRead = can('banner.read')
  const canManage = can('banner.manage')
  const canUpload = can('upload.create')

  const filters: BannerFilters = {
    ...(placement ? { placement: placement as BannerPlacement } : {}),
    ...(status ? { status: status as BannerEffectiveStatus } : {}),
    ...(audience ? { audience: audience as ContentAudience } : {}),
    q: search || undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.banners.list(filters),
    queryFn: ({ signal }) => fetchBanners(filters, signal),
    enabled: canRead,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  const [name, setName] = useState('')
  const [draftPlacement, setDraftPlacement] = useState<BannerPlacement>('home_hero')
  const [image, setImage] = useState<{ key: string; readUrl: string | null }>({
    key: '',
    readUrl: null,
  })
  const [errors, setErrors] = useState<{ name?: boolean; image?: boolean }>({})

  const resetForm = () => {
    setName('')
    setDraftPlacement('home_hero')
    setImage({ key: '', readUrl: null })
    setErrors({})
  }

  const create = useMutation({
    mutationFn: createBanner,
    onSuccess: (created) => {
      toast.success(t('banners.created', { name: created.name }))
      setCreateOpen(false)
      resetForm()
      void queryClient.invalidateQueries({ queryKey: queryKeys.banners.all })
      // Into the editor: a new banner is a draft with no copy, destination or
      // window yet, and all three live on the detail screen.
      navigate(`/banners/${created.id}`)
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const submit = () => {
    const next: typeof errors = {}
    if (name.trim().length < 3) next.name = true
    if (!image.key) next.image = true
    setErrors(next)
    if (Object.keys(next).length > 0) return
    create.mutate({ name: name.trim(), imageKey: image.key, placement: draftPlacement })
  }

  const columns = useMemo<ColumnDef<CmsBanner, unknown>[]>(
    () => [
      {
        id: 'image',
        header: () => t('banners.col.image'),
        cell: ({ row }) =>
          row.original.imageUrl ? (
            <img src={row.original.imageUrl} alt="" className={styles.thumb} />
          ) : (
            // Not a broken image and not an em-dash: the server says the URL
            // does not exist yet, so the cell says the same in words.
            <span className={styles.thumbEmpty}>{t('banners.noPreview')}</span>
          ),
        enableSorting: false,
      },
      {
        id: 'name',
        header: () => t('banners.col.name'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.name}</p>
            {row.original.title ? <p className={styles.sub}>{row.original.title}</p> : null}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'placement',
        header: () => t('banners.col.placement'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {t(`banners.placement.${row.original.placement}` as const)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'audience',
        header: () => t('banners.col.audience'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.audience
              ? t(`recommendations.audience.${row.original.audience}` as const)
              : t('banners.audienceAll')}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'window',
        header: () => t('banners.col.window'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.startsAt || row.original.endsAt
              ? `${
                  row.original.startsAt ? formatDateTime(row.original.startsAt, locale) : '…'
                } → ${row.original.endsAt ? formatDateTime(row.original.endsAt, locale) : '…'}`
              : t('banners.noWindow')}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'priority',
        header: () => t('banners.col.priority'),
        cell: ({ row }) => (
          <span className={styles.priority}>{formatNumber(row.original.priority, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('banners.col.status'),
        cell: ({ row }) => <BannerStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
    ],
    [t, locale],
  )

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

  const page = query.data
  const nextCursor = page?.nextCursor ?? null

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('banners.breadcrumb') }]}
        title={t('banners.title')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={14} />}
              onClick={() => setCreateOpen(true)}
            >
              {t('banners.new')}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <SearchInput
              label={t('banners.filter.search')}
              placeholder={t('banners.filter.search')}
              className={styles.search}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPaging()
              }}
            />
            <InlineSelect
              label={t('banners.col.placement')}
              value={placement}
              onChange={(event) => {
                setPlacement(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('banners.filter.placementAll')}</option>
              {bannerPlacementSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`banners.placement.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('banners.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('banners.filter.statusAll')}</option>
              {/* `expired` is offered because the server computes and filters
                  on it, even though nobody can set it. */}
              {bannerEffectiveStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`banners.status.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('banners.col.audience')}
              value={audience}
              onChange={(event) => {
                setAudience(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('banners.filter.audienceAll')}</option>
              {contentAudienceSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`recommendations.audience.${value}` as const)}
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
            empty={<EmptyState title={t('banners.empty')} hint={t('banners.emptyHint')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('banners.title')}
                  onRowClick={(row) => navigate(`/banners/${row.id}`)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('banners.pageInfo', {
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
        title={t('banners.new')}
        description={t('banners.newHint')}
        width="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={submit}>
              {t('banners.create')}
            </Button>
          </div>
        }
      >
        <form className={styles.formGrid} onSubmit={(event) => event.preventDefault()} noValidate>
          <TextInput
            label={t('banners.field.name')}
            required
            hint={t('banners.field.nameHint')}
            error={errors.name ? t('banners.error.name') : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Select
            label={t('banners.field.placement')}
            required
            value={draftPlacement}
            onChange={(event) => setDraftPlacement(event.target.value as BannerPlacement)}
          >
            {bannerPlacementSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`banners.placement.${value}` as const)}
              </option>
            ))}
          </Select>
          <div className={styles.formFull}>
            <ImageUploadField
              label={t('banners.field.image')}
              purpose="banner_image"
              required
              // Uploading is a separate controller with the same role pair, so
              // it is asked about separately rather than assumed.
              disabled={!canUpload}
              imageKey={image.key}
              previewUrl={image.readUrl}
              error={errors.image ? t('banners.error.image') : undefined}
              onUploaded={setImage}
            />
          </div>
          <p className={`${styles.formNote} ${styles.formFull}`}>
            <span aria-hidden="true">ℹ</span>
            {t('banners.createNote')}
          </p>
        </form>
      </Drawer>
    </>
  )
}
