import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button, IconButton } from '@/shared/ui/Button'
import { StatusBadge, type Tone } from '@/shared/ui/Badge'
import { SearchInput, Select, TextInput } from '@/shared/ui/Field'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { CloseIcon, PlusIcon } from '@/shared/ui/icons'
import { fetchPlaces } from '@/features/places/api'
import type { Collection, CollectionStatus, PlaceStatus } from '@/shared/api/contracts'
import {
  createCollection,
  fetchCollectionItems,
  fetchCollections,
  setCollectionItems,
  setCollectionStatus,
} from './api'
import { styles } from './collections.style'

const STATUSES: CollectionStatus[] = ['draft', 'scheduled', 'published', 'archived']

const STATUS_TONE: Record<CollectionStatus, Tone> = {
  draft: 'neutral',
  scheduled: 'amber',
  published: 'mint',
  archived: 'neutral',
}

/** Max items `cmsSetCollectionItems` accepts — enforced here so a save cannot fail on it. */
const MAX_ITEMS = 100

type PickedPlace = { id: string; name: string; status?: PlaceStatus }

export default function CollectionsScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [picked, setPicked] = useState<PickedPlace[]>([])
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState({ slug: '', title: '' })
  const [replaceOpen, setReplaceOpen] = useState(false)

  // Reads are hierarchical; writing collections is editor/ops (and super).
  const canRead = can('collection.read')
  const canManage = can('collection.manage')

  const query = useQuery({
    queryKey: queryKeys.collections.list(),
    queryFn: ({ signal }) => fetchCollections(undefined, signal),
    enabled: canRead,
  })

  /*
   * Read before write. `PUT .../items` replaces the whole list, so the editor
   * starts from what is stored rather than from an empty list that would erase
   * the collection on the first save.
   */
  const itemsQuery = useQuery({
    queryKey: queryKeys.collections.items(activeId ?? ''),
    queryFn: ({ signal }) => fetchCollectionItems(activeId ?? '', signal),
    enabled: canRead && Boolean(activeId),
  })

  // The catalog list IS readable, so the picker searches it for real.
  const catalogQuery = useQuery({
    queryKey: queryKeys.places.list({ q: search, limit: 10 }),
    queryFn: ({ signal }) => fetchPlaces({ q: search, limit: 10 }, signal),
    enabled: canManage && search.trim().length >= 2,
  })

  // Memoized so the "select the first collection" effect below does not see a
  // new array identity on every render.
  const collections = useMemo(() => query.data ?? [], [query.data])
  const active: Collection | null =
    collections.find((item) => item.id === activeId) ?? collections[0] ?? null

  // Keep the selection explicit once the list has loaded, so the items query
  // has an id to fetch rather than silently reading nothing.
  useEffect(() => {
    if (!activeId && collections[0]) setActiveId(collections[0].id)
  }, [activeId, collections])

  useEffect(() => {
    setSearch('')
  }, [activeId])

  const stored = itemsQuery.data?.items ?? []

  useEffect(() => {
    if (!itemsQuery.data) return
    setPicked(
      itemsQuery.data.items.map((item) => ({
        id: item.placeId,
        name: item.name,
        status: item.status,
      })),
    )
  }, [itemsQuery.data])

  const dirty =
    picked.length !== stored.length ||
    picked.some((place, index) => stored[index]?.placeId !== place.id)

  const removed = stored.filter((item) => !picked.some((place) => place.id === item.placeId))

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all })

  const create = useMutation({
    mutationFn: () => createCollection({ slug: draft.slug, title: draft.title }),
    onSuccess: () => {
      setDraft({ slug: '', title: '' })
      toast.success(t('collections.new'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CollectionStatus }) =>
      setCollectionStatus(id, status),
    onSuccess: invalidate,
    onError: (error) => toast.error(describeError(error)),
  })

  const replaceItems = useMutation({
    mutationFn: (id: string) =>
      setCollectionItems(
        id,
        picked.map((place) => place.id),
      ),
    onSuccess: () => {
      setReplaceOpen(false)
      toast.success(t('collections.items.saved'))
      invalidate()
      if (activeId)
        void queryClient.invalidateQueries({ queryKey: queryKeys.collections.items(activeId) })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('collections.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const move = (index: number, delta: number) => {
    setPicked((current) => {
      const next = [...current]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      const [moved] = next.splice(index, 1)
      if (moved) next.splice(target, 0, moved)
      return next
    })
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('collections.breadcrumb') }]}
        title={t('collections.title')}
      />
      <PageBody>
        <div className={styles.layout}>
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title={t('collections.list')} />
              <CardBody className="flex flex-col gap-2">
                <AsyncBoundary
                  status={query.status}
                  error={query.error}
                  data={collections}
                  isEmpty={(items) => items.length === 0}
                  onRetry={() => void query.refetch()}
                  empty={<EmptyState title={t('collections.empty')} hint={null} />}
                >
                  {(items) =>
                    items.map((collection) => (
                      <button
                        key={collection.id}
                        type="button"
                        aria-pressed={active?.id === collection.id}
                        onClick={() => setActiveId(collection.id)}
                        className={`${styles.item} ${
                          active?.id === collection.id ? styles.itemActive : styles.itemIdle
                        }`}
                      >
                        <span className={styles.coverFallback} aria-hidden="true">
                          {collection.locale.toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block ${styles.title}`}>{collection.title}</span>
                          <span className={`block ${styles.meta}`}>/{collection.slug}</span>
                        </span>
                        <StatusBadge
                          tone={STATUS_TONE[collection.status]}
                          shape={collection.status === 'published' ? 'check' : 'dot'}
                          label={t(`collectionStatus.${collection.status}` as const)}
                        />
                      </button>
                    ))
                  }
                </AsyncBoundary>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('collections.new')} />
              <CardBody className="flex flex-col gap-3">
                <TextInput
                  label={t('collections.titleField')}
                  value={draft.title}
                  disabled={!canManage}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <TextInput
                  label={t('collections.slug')}
                  value={draft.slug}
                  disabled={!canManage}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, slug: event.target.value }))
                  }
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<PlusIcon size={14} />}
                    disabled={
                      !canManage ||
                      !online ||
                      !/^[a-z0-9-]{2,60}$/.test(draft.slug) ||
                      draft.title.trim() === ''
                    }
                    loading={create.isPending}
                    onClick={() => create.mutate()}
                  >
                    {t('collections.new')}
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title={t('collections.form')} />
            <CardBody className={styles.form}>
              {!active ? (
                <p className="text-xs text-text-muted">{t('collections.selectHint')}</p>
              ) : (
                <>
                  <TextInput
                    key={`${active.id}-title`}
                    label={t('collections.titleField')}
                    defaultValue={active.title}
                    disabled
                  />
                  <div className={styles.scheduleRow}>
                    <TextInput
                      key={`${active.id}-slug`}
                      label={t('collections.slug')}
                      defaultValue={active.slug}
                      disabled
                    />
                    <Select
                      label={t('placeEditor.status')}
                      value={active.status}
                      disabled={!canManage || !online}
                      onChange={(event) =>
                        changeStatus.mutate({
                          id: active.id,
                          status: event.target.value as CollectionStatus,
                        })
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`collectionStatus.${status}` as const)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <p className="text-[11px] text-text-subtle">
                    {t('collections.startsAt')}: {formatDateTime(active.startsAt, locale)} ·{' '}
                    {t('collections.endsAt')}: {formatDateTime(active.endsAt, locale)}
                  </p>

                  {itemsQuery.status === 'pending' ? (
                    <p className="text-xs text-text-muted">{t('state.loading')}</p>
                  ) : itemsQuery.status === 'error' ? (
                    <p className={styles.contractNote}>
                      <span aria-hidden="true">⚠</span>
                      {describeError(itemsQuery.error)}
                    </p>
                  ) : null}

                  <SearchInput
                    label={t('collections.searchCatalog')}
                    placeholder={t('collections.searchCatalog')}
                    value={search}
                    disabled={!canManage}
                    onChange={(event) => setSearch(event.target.value)}
                  />

                  {search.trim().length >= 2 ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] font-semibold text-text-muted">
                        {t('collections.searchResults')}
                      </p>
                      {(catalogQuery.data?.items ?? []).map((place) => (
                        <div key={place.id} className={styles.itemRow}>
                          <span className={styles.itemName}>{place.name}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={
                              picked.some((entry) => entry.id === place.id) ||
                              picked.length >= MAX_ITEMS
                            }
                            title={
                              picked.some((entry) => entry.id === place.id)
                                ? t('collections.items.duplicate')
                                : picked.length >= MAX_ITEMS
                                  ? t('collections.items.limit')
                                  : undefined
                            }
                            onClick={() =>
                              setPicked((current) => [
                                ...current,
                                { id: place.id, name: place.name, status: place.status },
                              ])
                            }
                          >
                            {t('collections.addPlace')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-xs font-semibold text-text-muted">
                      {t('collections.items.title')}{' '}
                      <span className="font-normal text-text-subtle">
                        — {t('collections.items.hint')}
                      </span>
                      {dirty ? (
                        <span className="ml-2 font-normal text-amber">
                          {t('collections.items.dirty')}
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-col gap-2">
                      {picked.map((place, index) => (
                        <div key={place.id} className={styles.itemRow}>
                          <div className={styles.orderButtons}>
                            <button
                              type="button"
                              aria-label={t('collections.moveUp')}
                              disabled={index === 0}
                              onClick={() => move(index, -1)}
                              className="px-1 text-[10px] text-text-subtle disabled:opacity-30"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              aria-label={t('collections.moveDown')}
                              disabled={index === picked.length - 1}
                              onClick={() => move(index, 1)}
                              className="px-1 text-[10px] text-text-subtle disabled:opacity-30"
                            >
                              ▼
                            </button>
                          </div>
                          <span className="w-5 text-[11px] tabular-nums text-text-subtle">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block ${styles.itemName}`}>{place.name}</span>
                            {/* A pinned place that left publication is named, not silently blank. */}
                            {place.status && place.status !== 'published' ? (
                              <span className="block text-[11px] text-amber">
                                {t('collections.items.unpublished')}
                              </span>
                            ) : null}
                          </span>
                          <IconButton
                            label={t('collections.items.remove')}
                            tone="danger"
                            className="h-8 w-8"
                            onClick={() =>
                              setPicked((current) =>
                                current.filter((entry) => entry.id !== place.id),
                              )
                            }
                          >
                            <CloseIcon size={12} />
                          </IconButton>
                        </div>
                      ))}
                      {picked.length === 0 ? (
                        <p className="text-xs text-text-subtle">{t('collections.items.empty')}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      disabled={!canManage || !online || !dirty}
                      onClick={() => setReplaceOpen(true)}
                    >
                      {t('collections.items.save')}
                    </Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>

      <ConfirmDialog
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        onConfirm={() => active && replaceItems.mutate(active.id)}
        title={t('collections.replaceList', { count: picked.length })}
        description={t('collections.replaceWarning', { count: picked.length })}
        confirmLabel={t('action.save')}
        loading={replaceItems.isPending}
        changes={[
          {
            label: t('collections.items.title'),
            from: String(stored.length),
            to: String(picked.length),
          },
          // Removal is the destructive half of a whole-list replace, so the
          // dialog names every place that would drop out.
          ...removed.map((item) => ({
            label: t('collections.items.remove'),
            from: item.name,
            to: '—',
          })),
        ]}
      />
    </>
  )
}
