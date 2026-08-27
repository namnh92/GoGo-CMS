import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatNumber, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card } from '@/shared/ui/Card'
import { Button, IconButton } from '@/shared/ui/Button'
import { Checkbox, InlineSelect, SearchInput } from '@/shared/ui/Field'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { BulkActionBar, DataTable } from '@/shared/ui/DataTable'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { EditIcon, ImportIcon, MoreIcon, PlusIcon, StarIcon } from '@/shared/ui/icons'
import type { CmsPlace, PlaceStatus } from '@/shared/api/contracts'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import { fetchPlaces, fetchStalePlaces, transitionPlace, verifyFreshness } from './api'
import { PlaceStatusBadge } from './status'
import { DuplicateQueue } from './duplicateQueue.view'
import { styles } from './placeList.style'

type TabId = PlaceStatus | 'all' | 'stale' | 'duplicates'

const TAB_IDS: TabId[] = [
  'all',
  'draft',
  'community_submitted',
  'review',
  'published',
  'suspended',
  'archived',
  'stale',
  'duplicates',
]

function Rating({
  label,
  value,
  count,
}: {
  label: string
  value?: number | null
  count?: number | null
}) {
  return (
    <span className={styles.ratingRow}>
      <span className={styles.ratingLabel}>{label}</span>
      <StarIcon size={11} className="text-amber" />
      <span className={styles.ratingValue}>{value != null ? value.toFixed(1) : '—'}</span>
      {count != null ? <span>({count})</span> : null}
    </span>
  )
}

export default function PlaceListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [tab, setTab] = useState<TabId>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const canWrite = can('place.write')
  const canTransition = can('place.transition')

  const listQuery = useQuery({
    queryKey: queryKeys.places.list({
      status: tab === 'stale' || tab === 'duplicates' ? 'all' : tab,
      q: search,
    }),
    queryFn: ({ signal }) =>
      fetchPlaces(
        { status: tab === 'stale' || tab === 'duplicates' ? 'all' : tab, q: search || undefined },
        signal,
      ),
    enabled: tab !== 'stale' && tab !== 'duplicates',
  })

  // Taxonomy arrives as stable keys; the label always resolves through the
  // catalogue (vi first), never from a display string stored on the place.
  const taxonomyQuery = useQuery({
    queryKey: queryKeys.taxonomies.all,
    queryFn: ({ signal }) => fetchTaxonomies(signal),
    staleTime: 300_000,
  })

  const taxonomyLabel = useMemo(() => {
    const byKey = new Map(
      (taxonomyQuery.data?.items ?? []).map((item) => [
        item.key,
        item.labels[locale] ?? item.labels.vi ?? item.key,
      ]),
    )
    return (key: string) => byKey.get(key) ?? key
  }, [taxonomyQuery.data, locale])

  const staleQuery = useQuery({
    queryKey: queryKeys.places.stale(30),
    queryFn: ({ signal }) => fetchStalePlaces(30, signal),
    enabled: tab === 'stale',
  })

  const transition = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: PlaceStatus }) =>
      Promise.all(ids.map((id) => transitionPlace(id, status))),
    onSuccess: (_result, variables) => {
      toast.success(
        t(`placeStatus.${variables.status}` as const),
        t('places.selected', { count: variables.ids.length }),
      )
      setSelected([])
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const verify = useMutation({
    mutationFn: (id: string) => verifyFreshness(id),
    onSuccess: () => {
      toast.success(t('places.stale.verify'))
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const columns = useMemo<ColumnDef<CmsPlace, unknown>[]>(() => {
    const base: ColumnDef<CmsPlace, unknown>[] = [
      {
        id: 'select',
        header: () => (
          <Checkbox
            label={t('places.selected', { count: selected.length })}
            checked={selected.length > 0 && selected.length === (listQuery.data?.items.length ?? 0)}
            indeterminate={selected.length > 0}
            onChange={(checked) =>
              setSelected(checked ? (listQuery.data?.items ?? []).map((place) => place.id) : [])
            }
          />
        ),
        cell: ({ row }) => (
          <span onClick={(event) => event.stopPropagation()}>
            <Checkbox
              label={row.original.name}
              checked={selected.includes(row.original.id)}
              onChange={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...current, row.original.id]
                    : current.filter((id) => id !== row.original.id),
                )
              }
            />
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'photo',
        header: () => t('places.col.photo'),
        cell: ({ row }) =>
          row.original.coverUrl ? (
            <img src={row.original.coverUrl} alt="" className={styles.cover} loading="lazy" />
          ) : (
            <span className={styles.coverFallback} aria-hidden="true">
              {row.original.name.charAt(0).toUpperCase()}
            </span>
          ),
        enableSorting: false,
      },
      {
        id: 'details',
        header: () => t('places.col.details'),
        accessorFn: (place) => place.name,
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.name}</p>
            <p className={styles.address}>{row.original.addressText ?? '—'}</p>
          </div>
        ),
      },
      {
        id: 'taxonomy',
        header: () => t('places.col.categories'),
        cell: ({ row }) => (
          <div className={styles.tagRow}>
            {row.original.taxonomyKeys.slice(0, 3).map((key) => (
              <span key={key} className={styles.tag}>
                {taxonomyLabel(key)}
              </span>
            ))}
            {row.original.taxonomyKeys.length > 3 ? (
              <span className={styles.tag}>+{row.original.taxonomyKeys.length - 3}</span>
            ) : null}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('places.col.status'),
        accessorFn: (place) => place.status,
        cell: ({ row }) => <PlaceStatusBadge status={row.original.status} />,
      },
      {
        id: 'ratings',
        header: () => t('places.col.ratings'),
        cell: ({ row }) => (
          // Google, GoGo and composite are stored and shown separately.
          <div className={styles.ratingStack}>
            <Rating
              label={t('places.rating.google')}
              value={row.original.ratings.googleRating}
              count={row.original.ratings.googleRatingCount}
            />
            <Rating label={t('places.rating.gogo')} value={row.original.ratings.gogoRating} />
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'freshness',
        header: () => t('places.col.freshness'),
        accessorFn: (place) => place.freshnessVerifiedAt ?? '',
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.freshnessVerifiedAt
              ? formatRelative(row.original.freshnessVerifiedAt, locale)
              : t('places.freshness.never')}
          </span>
        ),
      },
      {
        id: 'sources',
        header: () => t('places.col.sources'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {t('places.sourceCount', { count: row.original.sourceCount })}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'modified',
        header: () => t('places.col.modified'),
        cell: ({ row }) => (
          <span className={styles.mono}>
            {row.original.updatedBy ?? '—'} · {formatRelative(row.original.updatedAt, locale)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('places.col.actions')}</span>,
        cell: ({ row }) => (
          <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
            {tab === 'stale' ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={!can('place.verifyFreshness') || !online}
                loading={verify.isPending && verify.variables === row.original.id}
                onClick={() => verify.mutate(row.original.id)}
              >
                {t('places.stale.verify')}
              </Button>
            ) : null}
            <IconButton
              label={t('action.edit')}
              disabled={!canWrite}
              onClick={() => navigate(`/places/${row.original.id}`)}
            >
              <EditIcon size={15} />
            </IconButton>
            <IconButton
              label={t('action.more')}
              onClick={() => navigate(`/places/${row.original.id}`)}
            >
              <MoreIcon size={15} />
            </IconButton>
          </div>
        ),
        enableSorting: false,
      },
    ]
    return base
  }, [
    t,
    locale,
    selected,
    listQuery.data,
    tab,
    canWrite,
    can,
    online,
    navigate,
    verify,
    taxonomyLabel,
  ])

  if (!can('place.read')) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('places.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const tabs: TabItem<TabId>[] = TAB_IDS.map((id) => ({
    id,
    label:
      id === 'all' || id === 'stale' || id === 'duplicates'
        ? t(`places.tab.${id}` as const)
        : t(`places.tab.${id}` as const),
  }))

  const activeQuery = tab === 'stale' ? staleQuery : listQuery
  const rows = tab === 'stale' ? (staleQuery.data?.items ?? []) : (listQuery.data?.items ?? [])
  const total = listQuery.data?.total ?? rows.length

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('places.breadcrumb') }]}
        title={t('places.title')}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<ImportIcon size={14} />}
              onClick={() => navigate('/imports/new')}
            >
              {t('places.bulkImport')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              iconLeft={<PlusIcon size={14} />}
              disabled={!canWrite || !online}
              onClick={() => navigate('/places/new')}
            >
              {t('places.add')}
            </Button>
          </div>
        }
      />
      <PageBody>
        <Tabs
          items={tabs}
          value={tab}
          onChange={(next) => {
            setTab(next)
            setSelected([])
          }}
          label={t('places.breadcrumb')}
        />

        {tab === 'duplicates' ? (
          <DuplicateQueue />
        ) : (
          <>
            <div className={styles.toolbar}>
              <SearchInput
                label={t('places.searchPlaceholder')}
                placeholder={t('places.searchPlaceholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={styles.search}
              />
              <InlineSelect label={t('places.filter.allCategories')} defaultValue="">
                <option value="">{t('places.filter.allCategories')}</option>
              </InlineSelect>
              <InlineSelect label={t('places.filter.allAreas')} defaultValue="">
                <option value="">{t('places.filter.allAreas')}</option>
              </InlineSelect>
            </div>

            {tab === 'stale' ? (
              <p className="text-xs text-text-muted">{t('places.stale.hint')}</p>
            ) : null}

            <Card className={styles.tableCard}>
              <AsyncBoundary
                status={activeQuery.status}
                error={activeQuery.error}
                data={rows}
                isEmpty={(items) => items.length === 0}
                onRetry={() => void activeQuery.refetch()}
                empty={<EmptyState />}
              >
                {(items) => (
                  <>
                    <DataTable
                      data={items}
                      columns={columns}
                      getRowId={(place) => place.id}
                      selectedIds={selected}
                      caption={t('places.title')}
                      onRowClick={(place) => navigate(`/places/${place.id}`)}
                      rowTone={(place) =>
                        place.status === 'suspended'
                          ? 'danger'
                          : place.status === 'review'
                            ? 'warning'
                            : 'default'
                      }
                    />
                    <p className="border-t border-line px-4 py-3 text-xs text-text-subtle">
                      {t('places.showing', {
                        from: items.length === 0 ? 0 : 1,
                        to: items.length,
                        total: formatNumber(total, locale),
                      })}
                    </p>
                  </>
                )}
              </AsyncBoundary>
            </Card>

            <BulkActionBar
              count={selected.length}
              hint={t('places.bulk.hint')}
              onClear={() => setSelected([])}
            >
              <Button
                size="sm"
                variant="success"
                disabled={!canTransition || !online}
                loading={transition.isPending && transition.variables?.status === 'published'}
                onClick={() => transition.mutate({ ids: selected, status: 'published' })}
              >
                {t('places.bulk.publish')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canTransition || !online}
                onClick={() => transition.mutate({ ids: selected, status: 'suspended' })}
              >
                {t('places.bulk.suspend')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={!canTransition || !online}
                onClick={() => transition.mutate({ ids: selected, status: 'archived' })}
              >
                {t('places.bulk.archive')}
              </Button>
            </BulkActionBar>
          </>
        )}
      </PageBody>
    </>
  )
}
