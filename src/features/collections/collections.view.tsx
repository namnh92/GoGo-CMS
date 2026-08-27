import { useEffect, useState } from 'react'
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
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { CloseIcon, PlusIcon } from '@/shared/ui/icons'
import type { Collection, CollectionStatus } from '@/shared/api/contracts'
import { createCollection, fetchCollections, setCollectionItems, setCollectionStatus } from './api'
import { styles } from './collections.style'

const STATUSES: CollectionStatus[] = ['draft', 'scheduled', 'published', 'archived']

const STATUS_TONE: Record<CollectionStatus, Tone> = {
  draft: 'neutral',
  scheduled: 'amber',
  published: 'mint',
  archived: 'neutral',
}

export default function CollectionsScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [draft, setDraft] = useState({ slug: '', title: '' })

  const canManage = can('collection.manage')

  const query = useQuery({
    queryKey: queryKeys.collections.list(),
    queryFn: ({ signal }) => fetchCollections(undefined, signal),
    enabled: canManage,
  })

  const collections = query.data?.items ?? []
  const active: Collection | null =
    collections.find((item) => item.id === activeId) ?? collections[0] ?? null

  useEffect(() => {
    if (active) setOrderedIds(active.items.map((item) => item.placeId))
  }, [active])

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

  const saveItems = useMutation({
    mutationFn: (id: string) => setCollectionItems(id, orderedIds),
    onSuccess: () => {
      toast.success(t('collections.items'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!canManage) {
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
    setOrderedIds((current) => {
      const next = [...current]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      const [moved] = next.splice(index, 1)
      if (moved) next.splice(target, 0, moved)
      return next
    })
  }

  const itemsById = new Map(active?.items.map((item) => [item.placeId, item]) ?? [])

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
                        {collection.coverUrl ? (
                          <img
                            src={collection.coverUrl}
                            alt=""
                            className={styles.cover}
                            loading="lazy"
                          />
                        ) : (
                          <span className={styles.coverFallback} aria-hidden="true">
                            {collection.locale.toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={`block ${styles.title}`}>{collection.title}</span>
                          <span className={`block ${styles.meta}`}>
                            /{collection.slug} ·{' '}
                            {t('collections.placesCount', { count: collection.items.length })}
                          </span>
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
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <TextInput
                  label={t('collections.slug')}
                  value={draft.slug}
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
                      !online || !/^[a-z0-9-]{2,60}$/.test(draft.slug) || draft.title.trim() === ''
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
            <CardHeader
              title={t('collections.form')}
              actions={
                active ? (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!online}
                    loading={saveItems.isPending}
                    onClick={() => saveItems.mutate(active.id)}
                  >
                    {t('action.save')}
                  </Button>
                ) : null
              }
            />
            <CardBody className={styles.form}>
              {!active ? (
                <p className="text-xs text-text-muted">{t('collections.selectHint')}</p>
              ) : (
                <>
                  <TextInput
                    label={t('collections.titleField')}
                    defaultValue={active.title}
                    key={`${active.id}-title`}
                  />
                  <TextInput
                    label={t('collections.slug')}
                    defaultValue={active.slug}
                    key={`${active.id}-slug`}
                  />
                  <TextArea
                    label={t('collections.description')}
                    defaultValue={active.description ?? ''}
                    key={`${active.id}-desc`}
                  />
                  <div className={styles.scheduleRow}>
                    <Select
                      label={t('placeEditor.status')}
                      value={active.status}
                      disabled={!online}
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
                    <Select
                      label={t('collections.locale')}
                      defaultValue={active.locale}
                      key={`${active.id}-locale`}
                    >
                      <option value="vi">vi</option>
                      <option value="en">en</option>
                    </Select>
                  </div>
                  <p className="text-[11px] text-text-subtle">
                    {t('collections.startsAt')}: {formatDateTime(active.startsAt, locale)} ·{' '}
                    {t('collections.endsAt')}: {formatDateTime(active.endsAt, locale)}
                  </p>

                  <div>
                    <p className="mb-2 text-xs font-semibold text-text-muted">
                      {t('collections.items')}{' '}
                      <span className="font-normal text-text-subtle">
                        — {t('collections.itemsHint')}
                      </span>
                    </p>
                    <div className="flex flex-col gap-2">
                      {orderedIds.map((placeId, index) => {
                        const item = itemsById.get(placeId)
                        return (
                          <div key={placeId} className={styles.itemRow}>
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
                                disabled={index === orderedIds.length - 1}
                                onClick={() => move(index, 1)}
                                className="px-1 text-[10px] text-text-subtle disabled:opacity-30"
                              >
                                ▼
                              </button>
                            </div>
                            <span className="w-5 text-[11px] tabular-nums text-text-subtle">
                              {index + 1}
                            </span>
                            <span className={styles.itemName}>{item?.name ?? placeId}</span>
                            {item?.note ? (
                              <span className={styles.itemNote}>{item.note}</span>
                            ) : null}
                            <IconButton
                              label={t('collections.remove')}
                              tone="danger"
                              className="h-8 w-8"
                              onClick={() =>
                                setOrderedIds((current) => current.filter((id) => id !== placeId))
                              }
                            >
                              <CloseIcon size={12} />
                            </IconButton>
                          </div>
                        )
                      })}
                      {orderedIds.length === 0 ? (
                        <p className="text-xs text-text-subtle">{t('state.emptyHint')}</p>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  )
}
