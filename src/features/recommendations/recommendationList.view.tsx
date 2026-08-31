import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
  contentAudienceSchema,
  recommendationStatusSchema,
  type CmsRecommendation,
  type ContentAudience,
  type RecommendationStatus,
} from '@/shared/api/contracts'
import { createRecommendation, fetchRecommendations, type RecommendationFilters } from './api'
import { RecommendationStatusBadge } from './recommendationStatus'
import { styles } from './recommendationList.style'

const PAGE_SIZE = 25

/**
 * The create form, bounded by `CmsRecommendationCreate`. Every limit here is
 * the server's — the slug pattern, the lengths, the required four — so a
 * rejection is not the first time an editor hears about them.
 */
const createSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,60}$/),
  internalName: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  audience: contentAudienceSchema,
  subtitle: z.string().trim().max(200).optional().or(z.literal('')),
  areaKey: z.string().trim().max(64).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
})

type CreateForm = z.infer<typeof createSchema>

export default function RecommendationListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const describeError = useErrorMessage()

  const [status, setStatus] = useState('')
  const [audience, setAudience] = useState('')
  const [search, setSearch] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  const canRead = can('recommendation.read')
  const canManage = can('recommendation.manage')

  const filters: RecommendationFilters = {
    ...(status ? { status: status as RecommendationStatus } : {}),
    ...(audience ? { audience: audience as ContentAudience } : {}),
    q: search || undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.recommendations.list(filters),
    queryFn: ({ signal }) => fetchRecommendations(filters, signal),
    enabled: canRead,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      slug: '',
      internalName: '',
      title: '',
      audience: 'couple',
      subtitle: '',
      areaKey: '',
      description: '',
    },
  })

  const create = useMutation({
    mutationFn: (values: CreateForm) =>
      createRecommendation({
        slug: values.slug,
        internalName: values.internalName,
        title: values.title,
        audience: values.audience,
        ...(values.subtitle ? { subtitle: values.subtitle } : {}),
        ...(values.areaKey ? { areaKey: values.areaKey } : {}),
        ...(values.description ? { description: values.description } : {}),
      }),
    onSuccess: (created) => {
      toast.success(t('recommendations.created', { name: created.title }))
      setCreateOpen(false)
      form.reset()
      void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all })
      // Straight into the editor: a new recommendation has no places yet, and
      // it cannot be published until it does.
      navigate(`/recommendations/${created.id}`)
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const columns = useMemo<ColumnDef<CmsRecommendation, unknown>[]>(
    () => [
      {
        id: 'name',
        header: () => t('recommendations.col.name'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.internalName ?? row.original.title}</p>
            <p className={styles.slug}>{row.original.slug}</p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'title',
        header: () => t('recommendations.col.title'),
        cell: ({ row }) => <span className={styles.muted}>{row.original.title}</span>,
        enableSorting: false,
      },
      {
        id: 'audience',
        header: () => t('recommendations.col.audience'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.audience
              ? t(`recommendations.audience.${row.original.audience}` as const)
              : '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'area',
        header: () => t('recommendations.col.area'),
        cell: ({ row }) => <span className={styles.muted}>{row.original.areaKey ?? '—'}</span>,
        enableSorting: false,
      },
      {
        id: 'priority',
        header: () => t('recommendations.col.priority'),
        cell: ({ row }) => (
          <span className={styles.priority}>{formatNumber(row.original.priority, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'places',
        header: () => t('recommendations.col.places'),
        cell: ({ row }) => (
          <span className={styles.priority}>{formatNumber(row.original.placeCount, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('recommendations.col.status'),
        cell: ({ row }) => <RecommendationStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'updatedAt',
        header: () => t('recommendations.col.updatedAt'),
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
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('recommendations.title')} />
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
        breadcrumb={[{ label: t('app.suffix') }, { label: t('recommendations.breadcrumb') }]}
        title={t('recommendations.title')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={14} />}
              onClick={() => setCreateOpen(true)}
            >
              {t('recommendations.new')}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <SearchInput
              label={t('recommendations.filter.search')}
              placeholder={t('recommendations.filter.search')}
              className={styles.search}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPaging()
              }}
            />
            <InlineSelect
              label={t('recommendations.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('recommendations.filter.statusAll')}</option>
              {recommendationStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`recommendations.status.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('recommendations.col.audience')}
              value={audience}
              onChange={(event) => {
                setAudience(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('recommendations.filter.audienceAll')}</option>
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
            empty={
              <EmptyState
                title={t('recommendations.empty')}
                hint={t('recommendations.emptyHint')}
              />
            }
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('recommendations.title')}
                  onRowClick={(row) => navigate(`/recommendations/${row.id}`)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('recommendations.pageInfo', {
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
        title={t('recommendations.new')}
        description={t('recommendations.newHint')}
        width="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="primary"
              // `loading` also disables, so one click cannot create twice.
              loading={create.isPending}
              onClick={form.handleSubmit((values) => create.mutate(values))}
            >
              {t('recommendations.create')}
            </Button>
          </div>
        }
      >
        <form className={styles.formGrid} onSubmit={(event) => event.preventDefault()} noValidate>
          <TextInput
            label={t('recommendations.field.internalName')}
            required
            error={
              form.formState.errors.internalName ? t('recommendations.error.required') : undefined
            }
            {...form.register('internalName')}
          />
          <TextInput
            label={t('recommendations.field.slug')}
            required
            hint={t('recommendations.field.slugHint')}
            error={form.formState.errors.slug ? t('recommendations.error.slug') : undefined}
            {...form.register('slug')}
          />
          <TextInput
            label={t('recommendations.field.title')}
            required
            error={form.formState.errors.title ? t('recommendations.error.required') : undefined}
            {...form.register('title')}
          />
          <Select
            label={t('recommendations.field.audience')}
            required
            {...form.register('audience')}
          >
            {contentAudienceSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`recommendations.audience.${value}` as const)}
              </option>
            ))}
          </Select>
          <TextInput label={t('recommendations.field.subtitle')} {...form.register('subtitle')} />
          <TextInput
            label={t('recommendations.field.areaKey')}
            hint={t('recommendations.field.areaKeyHint')}
            {...form.register('areaKey')}
          />
          <TextArea
            label={t('recommendations.field.description')}
            rows={3}
            className={styles.formFull}
            {...form.register('description')}
          />
          <p className={`${styles.note} ${styles.formFull}`}>
            <span aria-hidden="true">ℹ</span>
            {t('recommendations.createNote')}
          </p>
        </form>
      </Drawer>
    </>
  )
}
