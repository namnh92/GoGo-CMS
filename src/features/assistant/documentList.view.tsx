import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { ApiError } from '@/shared/api/errors'
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
  assistantDocumentStatusSchema,
  assistantLocaleSchema,
  type AssistantDocumentStatus,
  type AssistantLocale,
  type CmsAssistantDocument,
} from '@/shared/api/contracts-assistant'
import { createDocument, fetchDocuments, type DocumentFilters } from './api'
import { DocumentStatusBadge } from './assistantParts'
import { useActorName } from './useActorName'
import { styles } from './assistant.style'
import { GuideCoveragePanel } from './guideCoverage'

const PAGE_SIZE = 25
const SLUG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

/** Who last touched the document: the open draft's author, else the publisher. */
function lastActor(document: CmsAssistantDocument) {
  return (
    document.draftVersion?.createdBy ??
    document.publishedVersion?.publishedBy ??
    document.publishedVersion?.createdBy ??
    null
  )
}

type CreateErrors = Partial<Record<'slug' | 'title' | 'body', string>>

/**
 * GoGo AI · the "GoGo guide" source documents (GoGo-CMS#249).
 *
 * The assistant answers product questions only from published versions of
 * these, and cites them by title and description — so what is listed here is
 * exactly what users will see as a source.
 */
export default function DocumentListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()
  const actorName = useActorName()

  const canRead = can('assistant.read')
  const canDraft = can('assistant.draft')

  const [status, setStatus] = useState('')
  const [docLocale, setDocLocale] = useState('')
  const [search, setSearch] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)

  const searchTooShort = search.trim().length === 1

  const filters: DocumentFilters = {
    ...(status ? { status: status as AssistantDocumentStatus } : {}),
    ...(docLocale ? { locale: docLocale as AssistantLocale } : {}),
    q: search.trim().length >= 2 ? search.trim() : undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.assistant.documents(filters),
    queryFn: ({ signal }) => fetchDocuments(filters, signal),
    enabled: canRead,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  // Create drawer
  const [createOpen, setCreateOpen] = useState(false)
  const emptyForm = {
    slug: '',
    locale: 'vi' as AssistantLocale,
    title: '',
    description: '',
    body: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<CreateErrors>({})

  const create = useMutation({
    mutationFn: createDocument,
    onSuccess: (created) => {
      toast.success(t('assistant.created', { title: created.title }))
      setCreateOpen(false)
      setForm(emptyForm)
      setErrors({})
      void queryClient.invalidateQueries({ queryKey: queryKeys.assistant.all })
      navigate(`/assistant/documents/${created.id}`)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'DOCUMENT_SLUG_TAKEN') {
        setErrors({ slug: t('assistant.error.slugTaken') })
        return
      }
      toast.error(describeError(error))
    },
  })

  const submit = () => {
    const next: CreateErrors = {}
    if (!SLUG_PATTERN.test(form.slug) || form.slug.length > 80) {
      next.slug = t('assistant.error.slug')
    }
    if (form.title.trim().length === 0) next.title = t('assistant.error.title')
    if (form.body.trim().length === 0) next.body = t('assistant.error.body')
    setErrors(next)
    if (Object.keys(next).length > 0) return
    create.mutate({
      slug: form.slug,
      locale: form.locale,
      title: form.title.trim(),
      description: form.description.trim(),
      body: form.body,
    })
  }

  const columns = useMemo<ColumnDef<CmsAssistantDocument, unknown>[]>(
    () => [
      {
        id: 'title',
        header: () => t('assistant.col.title'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.title}</p>
            <p className={styles.sub}>{row.original.slug}</p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'locale',
        header: () => t('assistant.col.locale'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {t(`assistant.locale.${row.original.locale}` as const)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('assistant.col.status'),
        cell: ({ row }) => <DocumentStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'version',
        header: () => t('assistant.col.version'),
        cell: ({ row }) => {
          const published = row.original.publishedVersion
          const draft = row.original.draftVersion
          return (
            <div className={styles.muted}>
              <p>
                {published
                  ? t('assistant.publishedVersion', { number: published.number })
                  : t('assistant.noPublished')}
              </p>
              {draft ? <p>{t('assistant.openDraft', { number: draft.number })}</p> : null}
            </div>
          )
        },
        enableSorting: false,
      },
      {
        id: 'updated',
        header: () => t('assistant.col.updated'),
        cell: ({ row }) => (
          <div className={styles.muted}>
            <p>{actorName(lastActor(row.original))}</p>
            <p>{formatDateTime(row.original.updatedAt, locale)}</p>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [t, locale, actorName],
  )

  const header = (
    <PageHeader
      breadcrumb={[{ label: t('app.suffix') }, { label: t('nav.group.assistant') }]}
      title={t('assistant.docs.title')}
      actions={
        canDraft ? (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<PlusIcon size={14} />}
            disabled={!online}
            onClick={() => setCreateOpen(true)}
          >
            {t('assistant.new')}
          </Button>
        ) : null
      }
    />
  )

  if (!canRead) {
    return (
      <>
        {header}
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const page = query.data
  const nextCursor = page?.nextCursor ?? null
  const filtered = Boolean(status || docLocale || filters.q)

  return (
    <>
      {header}
      <PageBody>
        <p className={styles.note}>
          <span aria-hidden="true">ℹ</span>
          {t('assistant.docs.hint')}
        </p>
        <GuideCoveragePanel />
        <Card>
          <div className={styles.filterBar}>
            <div className="flex flex-col gap-1">
              <SearchInput
                label={t('assistant.filter.search')}
                placeholder={t('assistant.filter.search')}
                className={styles.search}
                value={search}
                maxLength={100}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPaging()
                }}
              />
              {searchTooShort ? (
                <p className={styles.searchHint} role="status">
                  {t('assistant.filter.searchMin')}
                </p>
              ) : null}
            </div>
            <InlineSelect
              label={t('assistant.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('assistant.filter.statusAll')}</option>
              {assistantDocumentStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`assistant.status.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('assistant.col.locale')}
              value={docLocale}
              onChange={(event) => {
                setDocLocale(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('assistant.filter.localeAll')}</option>
              {assistantLocaleSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`assistant.locale.${value}` as const)}
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
                title={filtered ? t('assistant.docs.emptyFiltered') : t('assistant.docs.empty')}
                hint={filtered ? t('state.emptyHint') : t('assistant.docs.emptyHint')}
              />
            }
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('assistant.docs.title')}
                  onRowClick={(row) => navigate(`/assistant/documents/${row.id}`)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('assistant.pageInfo', { page: pageIndex + 1, shown: items.length })}
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
        title={t('assistant.new')}
        description={t('assistant.newHint')}
        width="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!online}
              onClick={submit}
            >
              {t('assistant.createDraft')}
            </Button>
          </div>
        }
      >
        <form className={styles.formGrid} onSubmit={(event) => event.preventDefault()} noValidate>
          <TextInput
            label={t('assistant.field.slug')}
            required
            hint={t('assistant.field.slugHint')}
            error={errors.slug}
            value={form.slug}
            maxLength={80}
            onChange={(event) => setForm((f) => ({ ...f, slug: event.target.value.trim() }))}
          />
          <Select
            label={t('assistant.field.locale')}
            required
            value={form.locale}
            onChange={(event) =>
              setForm((f) => ({ ...f, locale: event.target.value as AssistantLocale }))
            }
          >
            {assistantLocaleSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`assistant.locale.${value}` as const)}
              </option>
            ))}
          </Select>
          <div className={styles.formFull}>
            <TextInput
              label={t('assistant.field.title')}
              required
              hint={t('assistant.field.titleHint')}
              error={errors.title}
              value={form.title}
              maxLength={120}
              onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
            />
          </div>
          <div className={styles.formFull}>
            <TextInput
              label={t('assistant.field.description')}
              hint={t('assistant.field.descriptionHint')}
              value={form.description}
              maxLength={300}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            />
          </div>
          <div className={styles.formFull}>
            <TextArea
              label={t('assistant.field.body')}
              required
              hint={t('assistant.field.bodyHint')}
              error={errors.body}
              rows={10}
              value={form.body}
              maxLength={100000}
              onChange={(event) => setForm((f) => ({ ...f, body: event.target.value }))}
            />
          </div>
          <p className={`${styles.note} ${styles.formFull}`}>
            <span aria-hidden="true">ℹ</span>
            {t('assistant.createNote')}
          </p>
        </form>
      </Drawer>
    </>
  )
}
