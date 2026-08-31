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
import { formatDateTime, formatMoneyRange, formatNumber } from '@/shared/format'
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
  planTemplateStatusSchema,
  type CmsPlanTemplate,
  type ContentAudience,
  type PlanTemplateStatus,
} from '@/shared/api/contracts'
import { createPlanTemplate, fetchPlanTemplates, type PlanTemplateFilters } from './api'
import { PlanTemplateStatusBadge } from './planTemplateStatus'
import { styles } from './planTemplate.style'

const PAGE_SIZE = 25

/** Bounded by `CmsPlanTemplateCreate`: the required three and the slug pattern. */
const createSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,60}$/),
  internalName: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  audience: contentAudienceSchema.optional().or(z.literal('')),
  areaKey: z.string().trim().max(64).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
})

type CreateForm = z.infer<typeof createSchema>

export default function PlanTemplateListScreen() {
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

  const canRead = can('planTemplate.read')
  const canManage = can('planTemplate.manage')

  const filters: PlanTemplateFilters = {
    ...(status ? { status: status as PlanTemplateStatus } : {}),
    ...(audience ? { audience: audience as ContentAudience } : {}),
    q: search || undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.planTemplates.list(filters),
    queryFn: ({ signal }) => fetchPlanTemplates(filters, signal),
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
      audience: '',
      areaKey: '',
      description: '',
    },
  })

  const create = useMutation({
    mutationFn: (values: CreateForm) =>
      createPlanTemplate({
        slug: values.slug,
        internalName: values.internalName,
        title: values.title,
        ...(values.audience ? { audience: values.audience as ContentAudience } : {}),
        ...(values.areaKey ? { areaKey: values.areaKey } : {}),
        ...(values.description ? { description: values.description } : {}),
      }),
    onSuccess: (created) => {
      toast.success(t('planTemplates.created', { name: created.title }))
      setCreateOpen(false)
      form.reset()
      void queryClient.invalidateQueries({ queryKey: queryKeys.planTemplates.all })
      // A new template has no stops, and publishing needs at least one.
      navigate(`/plan-templates/${created.id}`)
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const columns = useMemo<ColumnDef<CmsPlanTemplate, unknown>[]>(
    () => [
      {
        id: 'name',
        header: () => t('planTemplates.col.name'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.internalName}</p>
            <p className={styles.slug}>{row.original.slug}</p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'title',
        header: () => t('planTemplates.col.title'),
        cell: ({ row }) => <span className={styles.muted}>{row.original.title}</span>,
        enableSorting: false,
      },
      {
        id: 'audience',
        header: () => t('planTemplates.col.audience'),
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
        id: 'budget',
        header: () => t('planTemplates.col.budget'),
        cell: ({ row }) => {
          const budget = row.original.budget
          if (!budget) return <span className={styles.muted}>—</span>
          return (
            <span className={styles.muted}>
              {/* Minor units with their currency, and the scope spelled out:
                  per-person and per-group are different numbers. */}
              {formatMoneyRange(budget.min, budget.max, budget.currency, locale)}
              {' · '}
              {t(`planTemplates.scope.${budget.scope}` as const)}
            </span>
          )
        },
        enableSorting: false,
      },
      {
        id: 'duration',
        header: () => t('planTemplates.col.duration'),
        cell: ({ row }) => (
          <span className={styles.num}>
            {row.original.expectedDurationMinutes != null
              ? t('planTemplates.minutes', {
                  value: formatNumber(row.original.expectedDurationMinutes, locale),
                })
              : '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'stops',
        header: () => t('planTemplates.col.stops'),
        cell: ({ row }) => (
          <span className={styles.num}>{formatNumber(row.original.stopCount, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('planTemplates.col.status'),
        cell: ({ row }) => <PlanTemplateStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'updatedAt',
        header: () => t('planTemplates.col.updatedAt'),
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
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('planTemplates.title')} />
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
        breadcrumb={[{ label: t('app.suffix') }, { label: t('planTemplates.breadcrumb') }]}
        title={t('planTemplates.title')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={14} />}
              onClick={() => setCreateOpen(true)}
            >
              {t('planTemplates.new')}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <p className={styles.separation}>{t('planTemplates.separationNote')}</p>

        <Card>
          <div className={styles.filterBar}>
            <SearchInput
              label={t('planTemplates.filter.search')}
              placeholder={t('planTemplates.filter.search')}
              className={styles.search}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPaging()
              }}
            />
            <InlineSelect
              label={t('planTemplates.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('planTemplates.filter.statusAll')}</option>
              {planTemplateStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`planTemplates.status.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('planTemplates.col.audience')}
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
              <EmptyState title={t('planTemplates.empty')} hint={t('planTemplates.emptyHint')} />
            }
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('planTemplates.title')}
                  onRowClick={(row) => navigate(`/plan-templates/${row.id}`)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('planTemplates.pageInfo', {
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
        title={t('planTemplates.new')}
        description={t('planTemplates.newHint')}
        width="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={create.isPending}
              onClick={form.handleSubmit((values) => create.mutate(values))}
            >
              {t('planTemplates.create')}
            </Button>
          </div>
        }
      >
        <form className={styles.formGrid} onSubmit={(event) => event.preventDefault()} noValidate>
          <TextInput
            label={t('planTemplates.field.internalName')}
            required
            error={
              form.formState.errors.internalName ? t('recommendations.error.required') : undefined
            }
            {...form.register('internalName')}
          />
          <TextInput
            label={t('planTemplates.field.slug')}
            required
            hint={t('recommendations.field.slugHint')}
            error={form.formState.errors.slug ? t('recommendations.error.slug') : undefined}
            {...form.register('slug')}
          />
          <TextInput
            label={t('planTemplates.field.title')}
            required
            error={form.formState.errors.title ? t('recommendations.error.required') : undefined}
            {...form.register('title')}
          />
          <Select label={t('planTemplates.field.audience')} {...form.register('audience')}>
            <option value="">{t('recommendations.filter.audienceAll')}</option>
            {contentAudienceSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`recommendations.audience.${value}` as const)}
              </option>
            ))}
          </Select>
          <TextInput
            label={t('planTemplates.field.areaKey')}
            hint={t('recommendations.field.areaKeyHint')}
            {...form.register('areaKey')}
          />
          <TextArea
            label={t('planTemplates.field.description')}
            rows={3}
            className={styles.formFull}
            {...form.register('description')}
          />
        </form>
      </Drawer>
    </>
  )
}
