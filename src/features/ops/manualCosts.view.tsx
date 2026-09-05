import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT, type Locale } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatMoney } from '@/shared/format'
import { newIdempotencyKey } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import {
  manualCostPeriodSchema,
  type CmsManualCostEligibleService,
  type CmsManualCostItem,
  type ManualCostPeriod,
} from '@/shared/api/contracts'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import { ConfirmDialog, Drawer, type ChangeLine } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import { useToast } from '@/shared/ui/Toast'
import { PlusIcon } from '@/shared/ui/icons'
import { fetchAudit } from '@/features/audit/api'
import {
  createManualCostItem,
  deleteManualCostItem,
  fetchManualCostItems,
  updateManualCostItem,
  type ManualCostItemInput,
  type ManualCostItemPatch,
} from './api'
import { microsToAmountText, microsToMinor, parseAmountToMicros } from './costMoney'
import { styles } from './manualCosts.style'

/** The currencies the display layer knows how to render; the server takes any ISO code. */
const CURRENCIES = ['USD', 'VND', 'EUR', 'JPY', 'KRW'] as const
const DAY = /^\d{4}-\d{2}-\d{2}$/
/** The server's `resourceType` for these audit rows (GoGo-BE#382). */
const AUDIT_RESOURCE = 'manual_cost_item'

type Draft = {
  serviceId: string
  name: string
  amount: string
  currency: string
  period: ManualCostPeriod
  effectiveFrom: string
  effectiveTo: string
  note: string
}
type DraftErrors = Partial<Record<keyof Draft, string>>

const emptyDraft = (): Draft => ({
  serviceId: '',
  name: '',
  amount: '',
  currency: 'USD',
  period: 'MONTHLY',
  effectiveFrom: '',
  effectiveTo: '',
  note: '',
})

const draftOf = (item: CmsManualCostItem): Draft => ({
  serviceId: item.serviceId,
  name: item.name,
  amount: microsToAmountText(item.amountMicros, item.currency),
  currency: item.currency,
  period: item.period,
  effectiveFrom: item.effectiveFrom,
  effectiveTo: item.effectiveTo ?? '',
  note: item.note ?? '',
})

/** Server field names → the draft field that carries them. */
const FIELD_OF: Record<string, keyof Draft> = {
  providerId: 'serviceId',
  serviceId: 'serviceId',
  name: 'name',
  amountMicros: 'amount',
  currency: 'currency',
  period: 'period',
  effectiveFrom: 'effectiveFrom',
  effectiveTo: 'effectiveTo',
  note: 'note',
}

/** A `YYYY-MM-DD` as a date, not a timestamp: the item's days have no clock. */
function formatDay(day: string, locale: Locale): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/**
 * COST-CMS-010 (GoGo-BE#382) — manual / fixed costs.
 *
 * A fee somebody types in — Apple Developer, a domain, a VPS, Play Console —
 * with a period and an effective range. The server spreads it into MANUAL
 * rows up to today, so the Cost Center, budgets and forecast count it beside
 * estimated and actual spend; per-test deltas never do. The form's service
 * picker is the registry's `eligibleServices`: a new manual provider on the
 * server appears here with no change to this screen.
 *
 * Money crosses the wire as micros per period. The form takes major units
 * and converts with integer arithmetic (`costMoney.ts`); the table
 * renders through `formatMoney` like every other amount in the console.
 */
export default function ManualCostsScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const describeError = useErrorMessage()

  const canRead = can('cost.read')
  const canManage = can('cost.manageManualItems')
  const canAudit = can('audit.read')

  const query = useQuery({
    queryKey: queryKeys.opsManualCosts,
    queryFn: ({ signal }) => fetchManualCostItems(signal),
    enabled: canRead,
  })
  const audit = useQuery({
    queryKey: queryKeys.audit.list({ resourceType: AUDIT_RESOURCE }),
    queryFn: ({ signal }) => fetchAudit({ resourceType: AUDIT_RESOURCE, limit: 20 }, signal),
    enabled: canRead && canAudit,
  })

  const eligible = useMemo(() => query.data?.eligibleServices ?? [], [query.data])
  const serviceLabel = (serviceId: string): string => {
    const service = eligible.find((s) => s.serviceId === serviceId)
    return service ? `${service.providerDisplayName} · ${service.displayName}` : serviceId
  }
  const money = (item: Pick<CmsManualCostItem, 'amountMicros' | 'currency'>) =>
    formatMoney(
      { amount: microsToMinor(item.amountMicros, item.currency), currency: item.currency },
      locale,
    )

  // ── form ───────────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CmsManualCostItem | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current))
  }
  const openCreate = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setErrors({})
    // One key per form opening: a retry of THIS create replays, the next
    // create is a new one.
    setIdempotencyKey(newIdempotencyKey())
    setOpen(true)
  }
  const openEdit = (item: CmsManualCostItem) => {
    setEditing(item)
    setDraft(draftOf(item))
    setErrors({})
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setConfirmDelete(false)
  }

  const settle = (message: string) => {
    toast.success(message)
    close()
    void queryClient.invalidateQueries({ queryKey: queryKeys.opsManualCosts })
    void queryClient.invalidateQueries({ queryKey: queryKeys.audit.all })
    // The dashboard card and the Cost Center both read the rows this write
    // rebuilt, under every window.
    void queryClient.invalidateQueries({ queryKey: queryKeys.opsCostCenterAll })
  }
  const refuse = (error: unknown) => {
    if (error instanceof ApiError && error.fieldErrors.length > 0) {
      const next: DraftErrors = {}
      for (const fieldError of error.fieldErrors) {
        const key = FIELD_OF[fieldError.field]
        if (key) next[key] = fieldError.message
      }
      if (Object.keys(next).length > 0) {
        setErrors(next)
        return
      }
    }
    toast.error(describeError(error))
  }

  const create = useMutation({
    mutationFn: (input: ManualCostItemInput) => createManualCostItem(input, idempotencyKey),
    onSuccess: (item) => settle(t('manualCosts.created', { name: item.name })),
    onError: refuse,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ManualCostItemPatch }) =>
      updateManualCostItem(id, patch),
    onSuccess: (item) => settle(t('manualCosts.updated', { name: item.name })),
    onError: refuse,
  })
  const remove = useMutation({
    mutationFn: (item: CmsManualCostItem) => deleteManualCostItem(item.id),
    onSuccess: (_result, item) => settle(t('manualCosts.deleted', { name: item.name })),
    onError: (error) => {
      setConfirmDelete(false)
      toast.error(describeError(error))
    },
  })
  const busy = create.isPending || update.isPending || remove.isPending

  const submit = () => {
    const next: DraftErrors = {}
    const service = eligible.find((s) => s.serviceId === draft.serviceId)
    if (!service) next.serviceId = t('manualCosts.error.service')
    if (draft.name.trim().length === 0) next.name = t('manualCosts.error.name')
    const amountMicros = parseAmountToMicros(draft.amount, draft.currency)
    if (amountMicros === null) next.amount = t('manualCosts.error.amount')
    if (!DAY.test(draft.effectiveFrom)) next.effectiveFrom = t('manualCosts.error.effectiveFrom')
    const oneOff = draft.period === 'ONE_TIME'
    const effectiveTo = oneOff || draft.effectiveTo === '' ? null : draft.effectiveTo
    if (effectiveTo !== null && effectiveTo < draft.effectiveFrom) {
      next.effectiveTo = t('manualCosts.error.range')
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || !service || amountMicros === null) return

    const input: ManualCostItemInput = {
      providerId: service.providerId,
      serviceId: service.serviceId,
      name: draft.name.trim(),
      amountMicros,
      currency: draft.currency,
      period: draft.period,
      effectiveFrom: draft.effectiveFrom,
      effectiveTo,
      note: draft.note.trim() === '' ? null : draft.note.trim(),
    }
    if (editing === null) {
      create.mutate(input)
      return
    }
    // Only what changed: the server audits the changed fields, and an
    // untouched field should not appear in that diff.
    const patch: ManualCostItemPatch = {}
    for (const key of Object.keys(input) as (keyof ManualCostItemInput)[]) {
      if (input[key] !== editing[key]) (patch as Record<string, unknown>)[key] = input[key]
    }
    if (Object.keys(patch).length === 0) {
      close()
      return
    }
    update.mutate({ id: editing.id, patch })
  }

  // ── table ──────────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<CmsManualCostItem, unknown>[]>(
    () => [
      {
        id: 'name',
        header: () => t('manualCosts.col.name'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.name}</p>
            {row.original.note ? <p className={styles.sub}>{row.original.note}</p> : null}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'service',
        header: () => t('manualCosts.col.service'),
        cell: ({ row }) => (
          <span className={styles.muted}>{serviceLabel(row.original.serviceId)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'amount',
        header: () => t('manualCosts.col.amount'),
        cell: ({ row }) => (
          <span className={styles.money}>
            {money(row.original)}
            <span className={styles.per}>
              {t(`manualCosts.per.${row.original.period}` as const)}
            </span>
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'window',
        header: () => t('manualCosts.col.window'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.period === 'ONE_TIME'
              ? formatDay(row.original.effectiveFrom, locale)
              : `${formatDay(row.original.effectiveFrom, locale)} → ${
                  row.original.effectiveTo
                    ? formatDay(row.original.effectiveTo, locale)
                    : t('manualCosts.openEnded')
                }`}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'updated',
        header: () => t('manualCosts.col.updated'),
        cell: ({ row }) => (
          <span className={styles.muted}>{formatDateTime(row.original.updatedAt, locale)}</span>
        ),
        enableSorting: false,
      },
    ],
    // `serviceLabel` and `money` close over `eligible` and `locale`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, eligible],
  )

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('manualCosts.title')} />
        <PageBody>
          <PermissionDeniedState hint={t('manualCosts.denied')} />
        </PageBody>
      </>
    )
  }

  const deleteChanges: ChangeLine[] = editing
    ? [
        {
          label: t('manualCosts.change.item'),
          from: `${editing.name} · ${money(editing)} ${t(`manualCosts.per.${editing.period}` as const)}`,
          note: serviceLabel(editing.serviceId),
        },
        {
          label: t('manualCosts.change.rows'),
          from: t('manualCosts.change.rowsFrom', {
            from: formatDay(editing.effectiveFrom, locale),
          }),
          to: t('manualCosts.change.rowsTo'),
        },
      ]
    : []

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('manualCosts.breadcrumb') }]}
        title={t('manualCosts.title')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={14} />}
              onClick={openCreate}
            >
              {t('manualCosts.new')}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <div className={styles.layout}>
          <div className={styles.main}>
            <Card>
              <p className={styles.intro}>
                <span aria-hidden="true">ℹ</span>
                {t('manualCosts.hint')}
              </p>
              <AsyncBoundary
                status={query.status}
                error={query.error}
                data={query.data?.items ?? []}
                isEmpty={(items) => items.length === 0}
                onRetry={() => void query.refetch()}
                empty={
                  <EmptyState title={t('manualCosts.empty')} hint={t('manualCosts.emptyHint')} />
                }
              >
                {(items) => (
                  <DataTable
                    data={items}
                    columns={columns}
                    getRowId={(row) => row.id}
                    caption={t('manualCosts.title')}
                    {...(canManage ? { onRowClick: openEdit } : {})}
                  />
                )}
              </AsyncBoundary>
            </Card>
          </div>
          {canAudit ? (
            <div className={styles.side}>
              <Card>
                <CardHeader
                  title={t('manualCosts.audit.title')}
                  hint={t('manualCosts.audit.hint')}
                />
                <CardBody className={styles.auditBody}>
                  <AsyncBoundary
                    status={audit.status}
                    error={audit.error}
                    data={audit.data?.items ?? []}
                    isEmpty={() => false}
                    onRetry={() => void audit.refetch()}
                  >
                    {(entries) => <AuditTrail entries={entries} />}
                  </AsyncBoundary>
                </CardBody>
              </Card>
            </div>
          ) : null}
        </div>
      </PageBody>

      <Drawer
        open={open}
        onClose={close}
        title={editing ? t('manualCosts.edit') : t('manualCosts.new')}
        description={t('manualCosts.eligibleHint')}
        width="lg"
        footer={
          <div className={styles.footer}>
            <div>
              {editing ? (
                <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  {t('manualCosts.delete')}
                </Button>
              ) : null}
            </div>
            <div className={styles.footerRight}>
              <Button variant="secondary" onClick={close} disabled={busy}>
                {t('action.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={create.isPending || update.isPending}
                onClick={submit}
              >
                {editing ? t('action.save') : t('manualCosts.create')}
              </Button>
            </div>
          </div>
        }
      >
        <form className={styles.formGrid} onSubmit={(event) => event.preventDefault()} noValidate>
          <div className={styles.formFull}>
            <Select
              label={t('manualCosts.field.service')}
              required
              error={errors.serviceId}
              value={draft.serviceId}
              onChange={(event) => set('serviceId', event.target.value)}
            >
              <option value="">{t('manualCosts.field.servicePick')}</option>
              {eligible.map((service: CmsManualCostEligibleService) => (
                <option key={service.serviceId} value={service.serviceId}>
                  {service.providerDisplayName} · {service.displayName}
                </option>
              ))}
            </Select>
          </div>
          <div className={styles.formFull}>
            <TextInput
              label={t('manualCosts.field.name')}
              required
              maxLength={120}
              error={errors.name}
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </div>
          <TextInput
            label={t('manualCosts.field.amount')}
            required
            inputMode="decimal"
            hint={t('manualCosts.field.amountHint')}
            error={errors.amount}
            value={draft.amount}
            onChange={(event) => set('amount', event.target.value)}
          />
          <Select
            label={t('manualCosts.field.currency')}
            required
            error={errors.currency}
            value={draft.currency}
            onChange={(event) => set('currency', event.target.value)}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
          <Select
            label={t('manualCosts.field.period')}
            required
            error={errors.period}
            value={draft.period}
            onChange={(event) => set('period', event.target.value as ManualCostPeriod)}
          >
            {manualCostPeriodSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`manualCosts.period.${value}` as const)}
              </option>
            ))}
          </Select>
          <TextInput
            label={t('manualCosts.field.effectiveFrom')}
            required
            type="date"
            error={errors.effectiveFrom}
            value={draft.effectiveFrom}
            onChange={(event) => set('effectiveFrom', event.target.value)}
          />
          <TextInput
            label={t('manualCosts.field.effectiveTo')}
            type="date"
            disabled={draft.period === 'ONE_TIME'}
            hint={t('manualCosts.field.effectiveToHint')}
            error={errors.effectiveTo}
            value={draft.period === 'ONE_TIME' ? '' : draft.effectiveTo}
            onChange={(event) => set('effectiveTo', event.target.value)}
          />
          <div className={styles.formFull}>
            <TextArea
              label={t('manualCosts.field.note')}
              rows={2}
              maxLength={1000}
              error={errors.note}
              value={draft.note}
              onChange={(event) => set('note', event.target.value)}
            />
          </div>
          <p className={`${styles.formNote} ${styles.formFull}`}>
            <span aria-hidden="true">ℹ</span>
            {t('manualCosts.formNote')}
          </p>
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete && editing !== null}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => editing && remove.mutate(editing)}
        title={t('manualCosts.deleteTitle')}
        description={t('manualCosts.deleteDescription')}
        changes={deleteChanges}
        confirmLabel={t('action.delete')}
        loading={remove.isPending}
      />
    </>
  )
}
