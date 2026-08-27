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
import { ConfidenceMeter } from '@/shared/ui/Progress'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { EditIcon, ImportIcon, MoreIcon, PlusIcon, StarIcon } from '@/shared/ui/icons'
import type {
  CmsPlace,
  PlaceSort,
  PlaceSourceFilter,
  PlaceStatus,
  StalePlace,
} from '@/shared/api/contracts'
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

const SORTS: PlaceSort[] = ['updated_at', 'created_at', 'name', 'confidence']
const SOURCES: PlaceSourceFilter[] = ['google', 'community', 'manual']
const PAGE_SIZE = 50

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
  const [areaKey, setAreaKey] = useState('')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState<PlaceSourceFilter | 'all'>('all')
  const [sort, setSort] = useState<PlaceSort>('updated_at')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<string[]>([])
  // Keyset paging: keep the cursors we have walked so "previous" is possible
  // without an offset the server does not support.
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)

  // Reads are hierarchical on the server, so every role can open the catalog.
  // Writing is exact-match: only an editor (and super_admin) may change it.
  const canWrite = can('place.write')
  const canTransition = can('place.transition')

  const filters = {
    status: tab === 'stale' || tab === 'duplicates' ? ('all' as const) : tab,
    q: search || undefined,
    areaKey: areaKey || undefined,
    category: category || undefined,
    source,
    sort,
    direction,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const listQuery = useQuery({
    queryKey: queryKeys.places.list(filters),
    queryFn: ({ signal }) => fetchPlaces(filters, signal),
    enabled: tab !== 'stale' && tab !== 'duplicates',
  })

  const staleQuery = useQuery({
    queryKey: queryKeys.places.stale(30),
    queryFn: ({ signal }) => fetchStalePlaces(30, signal),
    enabled: tab === 'stale',
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
    setSelected([])
  }

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

  const rows = listQuery.data?.items ?? []

  const columns = useMemo<ColumnDef<CmsPlace, unknown>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            label={t('places.selected', { count: selected.length })}
            checked={selected.length > 0 && selected.length === rows.length}
            indeterminate={selected.length > 0}
            onChange={(checked) => setSelected(checked ? rows.map((place) => place.id) : [])}
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
        id: 'name',
        header: () => t('places.col.details'),
        cell: ({ row }) => <p className={styles.name}>{row.original.name}</p>,
        enableSorting: false,
      },
      {
        id: 'area',
        header: () => t('places.col.area'),
        cell: ({ row }) => <span className={styles.mono}>{row.original.areaKey ?? '—'}</span>,
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('places.col.status'),
        cell: ({ row }) => <PlaceStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'rating',
        header: () => t('places.col.rating'),
        cell: ({ row }) => (
          <span className={styles.ratingRow}>
            <StarIcon size={11} className="text-amber" />
            <span className={styles.ratingValue}>
              {row.original.rating != null ? row.original.rating.toFixed(1) : '—'}
            </span>
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'confidence',
        header: () => t('places.col.confidence'),
        cell: ({ row }) => (
          <ConfidenceMeter value={row.original.confidence} label={t('places.col.confidence')} />
        ),
        enableSorting: false,
      },
      {
        id: 'freshness',
        header: () => t('places.col.freshness'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.freshnessCheckedAt
              ? formatRelative(row.original.freshnessCheckedAt, locale)
              : t('places.freshness.never')}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'updated',
        header: () => t('places.col.modified'),
        cell: ({ row }) => (
          <span className={styles.muted}>{formatRelative(row.original.updatedAt, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('places.col.actions')}</span>,
        cell: ({ row }) => (
          <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
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
    ],
    [t, locale, selected, rows, canWrite, navigate],
  )

  const staleColumns = useMemo<ColumnDef<StalePlace, unknown>[]>(
    () => [
      {
        id: 'name',
        header: () => t('places.col.details'),
        cell: ({ row }) => <p className={styles.name}>{row.original.name}</p>,
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('places.col.status'),
        cell: ({ row }) => <PlaceStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'freshness',
        header: () => t('places.col.freshness'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.freshnessCheckedAt
              ? formatRelative(row.original.freshnessCheckedAt, locale)
              : t('places.freshness.never')}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('places.col.actions')}</span>,
        cell: ({ row }) => (
          <div className={styles.actions}>
            <Button
              size="sm"
              variant="secondary"
              disabled={!can('place.verifyFreshness') || !online}
              loading={verify.isPending && verify.variables === row.original.id}
              onClick={() => verify.mutate(row.original.id)}
            >
              {t('places.stale.verify')}
            </Button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [t, locale, can, online, verify],
  )

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
    label: t(`places.tab.${id}` as const),
  }))
  const nextCursor = listQuery.data?.nextCursor ?? null

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
              disabled={!can('import.read')}
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
            resetPaging()
          }}
          label={t('places.breadcrumb')}
        />

        {tab === 'duplicates' ? (
          <DuplicateQueue />
        ) : tab === 'stale' ? (
          <>
            <p className="text-xs text-text-muted">{t('places.stale.hint')}</p>
            <Card className={styles.tableCard}>
              <AsyncBoundary
                status={staleQuery.status}
                error={staleQuery.error}
                data={staleQuery.data ?? []}
                isEmpty={(items) => items.length === 0}
                onRetry={() => void staleQuery.refetch()}
              >
                {(items) => (
                  <DataTable
                    data={items}
                    columns={staleColumns}
                    getRowId={(place) => place.id}
                    caption={t('places.stale.title')}
                    onRowClick={(place) => navigate(`/places/${place.id}`)}
                  />
                )}
              </AsyncBoundary>
            </Card>
          </>
        ) : (
          <>
            <div className={styles.toolbar}>
              <SearchInput
                label={t('places.searchPlaceholder')}
                placeholder={t('places.searchPlaceholder')}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPaging()
                }}
                className={styles.search}
              />
              <input
                aria-label={t('places.filter.area')}
                placeholder={t('places.filter.areaHint')}
                value={areaKey}
                onChange={(event) => {
                  setAreaKey(event.target.value)
                  resetPaging()
                }}
                className={styles.filterInput}
              />
              <input
                aria-label={t('places.filter.category')}
                placeholder={t('places.filter.categoryHint')}
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value)
                  resetPaging()
                }}
                className={styles.filterInput}
              />
              <InlineSelect
                label={t('places.filter.source')}
                value={source}
                onChange={(event) => {
                  setSource(event.target.value as PlaceSourceFilter | 'all')
                  resetPaging()
                }}
              >
                <option value="all">{t('places.filter.allSources')}</option>
                {SOURCES.map((option) => (
                  <option key={option} value={option}>
                    {t(`places.source.${option}` as const)}
                  </option>
                ))}
              </InlineSelect>
              <InlineSelect
                label={t('places.filter.sort')}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as PlaceSort)
                  resetPaging()
                }}
              >
                {SORTS.map((option) => (
                  <option key={option} value={option}>
                    {t(`places.sort.${option}` as const)}
                  </option>
                ))}
              </InlineSelect>
              <InlineSelect
                label={t('places.filter.direction')}
                value={direction}
                onChange={(event) => {
                  setDirection(event.target.value as 'asc' | 'desc')
                  resetPaging()
                }}
              >
                <option value="desc">{t('places.direction.desc')}</option>
                <option value="asc">{t('places.direction.asc')}</option>
              </InlineSelect>
            </div>

            <Card className={styles.tableCard}>
              <AsyncBoundary
                status={listQuery.status}
                error={listQuery.error}
                data={rows}
                isEmpty={(items) => items.length === 0}
                onRetry={() => void listQuery.refetch()}
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
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
                      <p className="text-xs text-text-subtle">
                        {t('places.pageInfo', { count: formatNumber(items.length, locale) })}
                        {nextCursor === null ? ` · ${t('places.lastPage')}` : ''}
                      </p>
                      <div className="flex items-center gap-2">
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
                            setSelected([])
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

            <p className="text-[11px] text-text-subtle">{t('places.ratingNote')}</p>

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
