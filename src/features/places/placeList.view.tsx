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
import { EditIcon, ImportIcon, PlusIcon, ShieldOffIcon, StarIcon } from '@/shared/ui/icons'
import { TakedownDialog } from '@/features/emergency/takedownDialog.view'
import type {
  CmsPlace,
  PlaceSort,
  PlaceSourceFilter,
  PlaceStatus,
  StalePlace,
} from '@/shared/api/contracts'
import { fetchPlaces, fetchStalePlaces, transitionPlace, verifyFreshness } from './api'
import { PLACE_TRANSITIONS, PlaceStatusBadge } from './status'
import { AreaCombobox } from './areaCombobox'
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
  const [takedownTarget, setTakedownTarget] = useState<CmsPlace | null>(null)

  // Reads are hierarchical on the server, so every role can open the catalog.
  // Writing is exact-match: only an editor (and super_admin) may change it.
  const canWrite = can('place.write')
  const canTransition = can('place.transition')
  // Break-glass is open to every active admin, by design (SEC-001).
  const canTakedown = can('emergency.takedown')

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

  /*
   * A bulk transition is N independent requests, so it can half-succeed: the
   * server accepts `published → suspended` and refuses `draft → suspended` in
   * the same click. `Promise.all` rejected on the first failure and the screen
   * then showed one error toast over a list that had partly changed. Settle
   * every call, report what actually happened, and refetch either way.
   */
  const transition = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: PlaceStatus }) => {
      const results = await Promise.allSettled(ids.map((id) => transitionPlace(id, status)))
      const failed = results.flatMap((result, index) =>
        result.status === 'rejected' ? [{ id: ids[index]!, reason: result.reason as unknown }] : [],
      )
      return { applied: ids.length - failed.length, total: ids.length, failed }
    },
    // Whatever happened, the table on screen is now a guess. Refetch.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.places.all }),
    onSuccess: (result, variables) => {
      const status = t(`placeStatus.${variables.status}` as const)
      if (result.failed.length === 0) {
        toast.success(t('places.bulk.done', { count: result.applied, status }))
        setSelected([])
        return
      }
      const detail = `${describeError(result.failed[0]!.reason)} · ${t('places.bulk.keptSelection')}`
      toast.error(
        result.applied === 0
          ? t('places.bulk.allFailed', { status })
          : t('places.bulk.partial', {
              applied: result.applied,
              total: result.total,
              status,
            }),
        detail,
      )
      // Keep exactly the rows that did not move, so a retry is one click.
      setSelected(result.failed.map((entry) => entry.id))
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

  /**
   * Only a transition the server would accept for *every* selected row is
   * offered. `cms-catalog.service.ts` answers 409 INVALID_PLACE_TRANSITION per
   * place, so a mixed selection used to fire N requests to discover that.
   */
  const canBulkTransition = (target: PlaceStatus) =>
    canTransition &&
    online &&
    !transition.isPending &&
    !listQuery.isFetching &&
    selected.length > 0 &&
    selected.every((id) => {
      const place = rows.find((row) => row.id === id)
      return place !== undefined && PLACE_TRANSITIONS[place.status].includes(target)
    })

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
        cell: ({ row }) => {
          // The route accepts `published → suspended` and nothing else, so an
          // unpublished place gets a disabled control with the reason, not a
          // 409 discovered mid-incident.
          const takedownable = row.original.status === 'published'
          return (
            <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
              <IconButton
                label={t('action.edit')}
                disabled={!canWrite}
                onClick={() => navigate(`/places/${row.original.id}`)}
              >
                <EditIcon size={15} />
              </IconButton>
              <IconButton
                label={
                  takedownable
                    ? t('emergency.action')
                    : `${t('emergency.action')} — ${t('emergency.notApplicable', { from: 'published' })}`
                }
                tone="danger"
                disabled={!canTakedown || !takedownable || !online}
                onClick={() => setTakedownTarget(row.original)}
              >
                <ShieldOffIcon size={15} />
              </IconButton>
            </div>
          )
        },
        enableSorting: false,
      },
    ],
    [t, locale, selected, rows, canWrite, canTakedown, online, navigate],
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
            {/*
              GoGo-CMS#128 — this used to navigate to `/places/new`, a route
              that does not exist. `places/:id` matched it, so the button opened
              the editor with the id "new", `GET /cms/places/new` answered 404,
              and an editor got an error screen from the primary CTA.

              There is no create path to point it at: GoGo-BE has no
              `POST /cms/places`, and a place enters the catalogue through
              bulk import or a community submission. So the control says that
              instead of pretending (`core.md` §16 — no dead controls). Tracked
              as a contract gap on GoGo-BE.
            */}
            <Button
              size="sm"
              variant="primary"
              iconLeft={<PlusIcon size={14} />}
              disabled
              title={t('places.addUnavailableWhy')}
            >
              {t('places.addUnavailable')}
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
              {/*
                The same vocabulary as the editor, from the same endpoint: a
                free text box here could filter on a key no place holds and
                answer "0 kết quả" for a typo (GoGo-BE ADR-0016).
              */}
              <AreaCombobox
                label={t('places.filter.area')}
                labelHidden
                placeholder={t('places.filter.areaHint')}
                value={areaKey || null}
                onChange={(next) => {
                  setAreaKey(next ?? '')
                  resetPaging()
                }}
                className={styles.filterCombobox}
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
                variant="secondary"
                disabled={!canBulkTransition('review')}
                loading={transition.isPending && transition.variables?.status === 'review'}
                onClick={() => transition.mutate({ ids: selected, status: 'review' })}
              >
                {t('placeStatus.review')}
              </Button>
              <Button
                size="sm"
                variant="success"
                disabled={!canBulkTransition('published')}
                loading={transition.isPending && transition.variables?.status === 'published'}
                onClick={() => transition.mutate({ ids: selected, status: 'published' })}
              >
                {t('places.bulk.publish')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canBulkTransition('suspended')}
                loading={transition.isPending && transition.variables?.status === 'suspended'}
                onClick={() => transition.mutate({ ids: selected, status: 'suspended' })}
              >
                {t('places.bulk.suspend')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={!canBulkTransition('archived')}
                loading={transition.isPending && transition.variables?.status === 'archived'}
                onClick={() => transition.mutate({ ids: selected, status: 'archived' })}
              >
                {t('places.bulk.archive')}
              </Button>
            </BulkActionBar>
          </>
        )}
      </PageBody>

      <TakedownDialog
        open={takedownTarget !== null}
        onClose={() => setTakedownTarget(null)}
        target="place"
        resourceId={takedownTarget?.id ?? ''}
        resourceLabel={takedownTarget?.name}
      />
    </>
  )
}
