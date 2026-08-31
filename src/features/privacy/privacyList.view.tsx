import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { InlineSelect, Select, TextArea, TextInput } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import { Badge } from '@/shared/ui/Badge'
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
  privacyRequestStatusSchema,
  privacyRequestTypeSchema,
  type PrivacyRequest,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from '@/shared/api/contracts'
import { createPrivacyRequest, fetchPrivacyRequests, type PrivacyFilters } from './api'
import { PrivacyDetailDrawer } from './privacyDetail.view'
import { SlaBadge } from './slaBadge'
import { styles } from './privacy.style'

const PAGE_SIZE = 25

/**
 * The privacy-request ledger (GoGo-BE#255).
 *
 * Every SLA value on screen is the server's; the `sla=` filter is computed
 * against the same stored dates, so the list a person filters and the badge
 * they read cannot disagree.
 */
export default function PrivacyListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const describeError = useErrorMessage()

  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [sla, setSla] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<PrivacyRequest | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const canRead = can('privacy.read')
  const canManage = can('privacy.manage')

  const filters: PrivacyFilters = {
    ...(status ? { status: status as PrivacyRequestStatus } : {}),
    ...(type ? { type: type as PrivacyRequestType } : {}),
    ...(sla ? { sla: sla as 'overdue' | 'due_soon' } : {}),
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.privacy.list(filters),
    queryFn: ({ signal }) => fetchPrivacyRequests(filters, signal),
    enabled: canRead,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  // Structured subject — never one free-text field, which becomes a PII
  // dumping ground the first time a conversation is pasted into it.
  const [form, setForm] = useState({
    type: 'export' as PrivacyRequestType,
    subjectType: 'email' as 'user' | 'email' | 'external',
    userId: '',
    contactEmail: '',
    externalReference: '',
    ticketReference: '',
    operatorNote: '',
  })
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      createPrivacyRequest({
        type: form.type,
        subjectType: form.subjectType,
        ...(form.subjectType === 'user' ? { userId: form.userId.trim() } : {}),
        ...(form.subjectType === 'email' ? { contactEmail: form.contactEmail.trim() } : {}),
        ...(form.subjectType === 'external'
          ? { externalReference: form.externalReference.trim() }
          : {}),
        ...(form.ticketReference.trim() ? { ticketReference: form.ticketReference.trim() } : {}),
        ...(form.operatorNote.trim() ? { operatorNote: form.operatorNote.trim() } : {}),
      }),
    onSuccess: (created) => {
      toast.success(t('privacy.created'))
      setCreateOpen(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.privacy.all })
      setSelected(created)
    },
    onError: (cause) => setFormError(describeError(cause)),
  })

  const columns = useMemo<ColumnDef<PrivacyRequest, unknown>[]>(
    () => [
      {
        id: 'subject',
        header: () => t('privacy.col.subject'),
        cell: ({ row }) => (
          <div>
            <p className={styles.subject}>
              {t(`privacy.subjectType.${row.original.subject.subjectType}` as const)}
            </p>
            <p className={styles.subjectMeta}>
              {row.original.subject.userId ??
                row.original.subject.contactEmail ??
                row.original.subject.externalReference}
            </p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'type',
        header: () => t('privacy.col.type'),
        cell: ({ row }) => (
          <Badge tone={row.original.type === 'delete' ? 'danger' : 'neutral'}>
            {t(`privacy.type.${row.original.type}` as const)}
          </Badge>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('privacy.col.status'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {t(`privacy.status.${row.original.status}` as const)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'sla',
        header: () => t('privacy.col.sla'),
        cell: ({ row }) => <SlaBadge sla={row.original.sla} />,
        enableSorting: false,
      },
      {
        id: 'due',
        header: () => t('privacy.col.due'),
        cell: ({ row }) => (
          <span className={row.original.sla === 'OVERDUE' ? styles.dueOver : styles.due}>
            {formatDateTime(row.original.extendedDueAt ?? row.original.fulfillmentDueAt, locale)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'outcome',
        header: () => t('privacy.col.outcome'),
        cell: ({ row }) =>
          row.original.outcome ? (
            <span className={styles.muted}>
              {t(`privacy.outcome.${row.original.outcome}` as const)}
            </span>
          ) : (
            <span className={styles.muted}>—</span>
          ),
        enableSorting: false,
      },
      {
        id: 'received',
        header: () => t('privacy.col.received'),
        cell: ({ row }) => (
          <span className={styles.muted}>{formatDateTime(row.original.receivedAt, locale)}</span>
        ),
        enableSorting: false,
      },
    ],
    [t, locale],
  )

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('privacy.title')} />
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
        breadcrumb={[{ label: t('app.suffix') }, { label: t('privacy.breadcrumb') }]}
        title={t('privacy.title')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={14} />}
              onClick={() => {
                setFormError(null)
                setCreateOpen(true)
              }}
            >
              {t('privacy.new')}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <Card>
          <div className={styles.filterBar}>
            <InlineSelect
              label={t('privacy.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('privacy.filter.statusAll')}</option>
              {privacyRequestStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`privacy.status.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('privacy.col.type')}
              value={type}
              onChange={(event) => {
                setType(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('privacy.filter.typeAll')}</option>
              {privacyRequestTypeSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`privacy.type.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('privacy.col.sla')}
              value={sla}
              onChange={(event) => {
                setSla(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('privacy.filter.slaAll')}</option>
              <option value="overdue">{t('privacy.filter.overdue')}</option>
              <option value="due_soon">{t('privacy.filter.dueSoon')}</option>
            </InlineSelect>
          </div>

          <AsyncBoundary
            status={query.status}
            error={query.error}
            data={page?.items ?? []}
            isEmpty={(items) => items.length === 0}
            onRetry={() => void query.refetch()}
            empty={<EmptyState title={t('privacy.empty')} hint={t('privacy.emptyHint')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('privacy.title')}
                  onRowClick={(row) => setSelected(row)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('privacy.pageInfo', {
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

        <p className={styles.privacyNote}>{t('privacy.ledgerNote')}</p>
      </PageBody>

      {selected ? (
        <PrivacyDetailDrawer request={selected} onClose={() => setSelected(null)} />
      ) : null}

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('privacy.new')}
        description={t('privacy.newHint')}
        width="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
              {t('privacy.create')}
            </Button>
          </div>
        }
      >
        <form className={styles.formGrid} onSubmit={(event) => event.preventDefault()} noValidate>
          <Select
            label={t('privacy.col.type')}
            value={form.type}
            onChange={(event) =>
              setForm((current) => ({ ...current, type: event.target.value as PrivacyRequestType }))
            }
          >
            {privacyRequestTypeSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`privacy.type.${value}` as const)}
              </option>
            ))}
          </Select>
          <Select
            label={t('privacy.col.subject')}
            value={form.subjectType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                subjectType: event.target.value as 'user' | 'email' | 'external',
              }))
            }
          >
            {(['user', 'email', 'external'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`privacy.subjectType.${value}` as const)}
              </option>
            ))}
          </Select>

          {form.subjectType === 'user' ? (
            <TextInput
              label={t('privacy.subjectType.user')}
              value={form.userId}
              onChange={(event) => setForm((c) => ({ ...c, userId: event.target.value }))}
            />
          ) : null}
          {form.subjectType === 'email' ? (
            <TextInput
              label={t('privacy.subjectType.email')}
              type="email"
              value={form.contactEmail}
              onChange={(event) => setForm((c) => ({ ...c, contactEmail: event.target.value }))}
            />
          ) : null}
          {form.subjectType === 'external' ? (
            <TextInput
              label={t('privacy.subjectType.external')}
              value={form.externalReference}
              onChange={(event) =>
                setForm((c) => ({ ...c, externalReference: event.target.value }))
              }
            />
          ) : null}

          <TextInput
            label="Ticket"
            value={form.ticketReference}
            onChange={(event) => setForm((c) => ({ ...c, ticketReference: event.target.value }))}
          />
          <TextArea
            label={t('privacy.operatorNote')}
            rows={2}
            maxLength={256}
            value={form.operatorNote}
            onChange={(event) => setForm((c) => ({ ...c, operatorNote: event.target.value }))}
          />
          <p className={styles.noteGuidance}>{t('privacy.noteGuidance')}</p>

          {formError ? (
            <p role="alert" className={styles.dialogError}>
              <span aria-hidden="true">⚠</span>
              {formError}
            </p>
          ) : null}
        </form>
      </Drawer>
    </>
  )
}
