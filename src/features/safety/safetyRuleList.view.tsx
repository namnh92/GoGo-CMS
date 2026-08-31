import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  safetyRuleSeveritySchema,
  safetyRuleStatusSchema,
  safetyRuleTypeSchema,
  type CmsSafetyRule,
  type SafetyRuleAction,
  type SafetyRuleSeverity,
  type SafetyRuleStatus,
  type SafetyRuleType,
} from '@/shared/api/contracts'
import { createSafetyRule, fetchSafetyRules, type SafetyRuleFilters } from './api'
import {
  ALLOWED_ACTIONS,
  ALLOWED_TRIGGERS,
  REASON_CODE_PATTERN,
  parseConditions,
  severityAllowsSuspension,
  toDraft,
  type ConditionDraft,
  type ConditionError,
} from './conditions'
import { ConditionFields } from './conditionFields.view'
import { SafetyRuleSeverityBadge, SafetyRuleStatusBadge } from './safetyRuleStatus'
import { styles } from './safetyRule.style'

const PAGE_SIZE = 25

type FormErrors = { name?: boolean; reasonCode?: boolean; severity?: boolean }

/**
 * Trust & Safety rules.
 *
 * Definitions only — nothing evaluates them yet, and the screen says so rather
 * than implying an enforcement path that does not exist. A rule created here
 * can eventually suspend an account with no human in the loop, which is why
 * the whole resource is `ops_admin` in both directions and why every rule
 * carries a `reasonCode` a person can trace a decision back through.
 */
export default function SafetyRuleListScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const describeError = useErrorMessage()

  const [ruleType, setRuleType] = useState('')
  const [status, setStatus] = useState('')
  const [severity, setSeverity] = useState('')
  const [search, setSearch] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  const canRead = can('safety.read')
  const canManage = can('safety.manage')

  const filters: SafetyRuleFilters = {
    ...(ruleType ? { ruleType: ruleType as SafetyRuleType } : {}),
    ...(status ? { status: status as SafetyRuleStatus } : {}),
    ...(severity ? { severity: severity as SafetyRuleSeverity } : {}),
    q: search || undefined,
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.safetyRules.list(filters),
    queryFn: ({ signal }) => fetchSafetyRules(filters, signal),
    enabled: canRead,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  // The draft form. Not react-hook-form: `conditions` is a different set of
  // fields per rule type, so the shape changes while the form is open — and a
  // resolver built from a fixed schema cannot follow that.
  const [draftType, setDraftType] = useState<SafetyRuleType>('blocked_words')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [trigger, setTrigger] = useState(ALLOWED_TRIGGERS.blocked_words[0])
  const [action, setAction] = useState<SafetyRuleAction>(ALLOWED_ACTIONS.blocked_words[0])
  const [draftSeverity, setDraftSeverity] = useState<SafetyRuleSeverity>('medium')
  const [conditions, setConditions] = useState<ConditionDraft>(() => toDraft('blocked_words', {}))
  const [conditionErrors, setConditionErrors] = useState<ConditionError[]>([])
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  /**
   * Changing the rule type changes which conditions exist, which actions are
   * legal and which triggers apply — so the dependent fields are re-seeded
   * rather than left holding a value the new type would have refused.
   */
  const changeType = (next: SafetyRuleType) => {
    setDraftType(next)
    setTrigger(ALLOWED_TRIGGERS[next][0])
    setAction(ALLOWED_ACTIONS[next][0])
    setConditions(toDraft(next, {}))
    setConditionErrors([])
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setReasonCode('')
    setDraftSeverity('medium')
    setFormErrors({})
    changeType('blocked_words')
  }

  const create = useMutation({
    mutationFn: createSafetyRule,
    onSuccess: (created) => {
      toast.success(t('safety.created', { name: created.name }))
      setCreateOpen(false)
      resetForm()
      void queryClient.invalidateQueries({ queryKey: queryKeys.safetyRules.all })
      // Into the rule: it is created as a draft, and arming it is a separate,
      // deliberate act on the detail screen.
      navigate(`/safety-rules/${created.id}`)
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const submit = () => {
    const nextErrors: FormErrors = {}
    if (name.trim().length < 3) nextErrors.name = true
    if (!REASON_CODE_PATTERN.test(reasonCode.trim())) nextErrors.reasonCode = true
    // The server refuses automatic suspension below `high`; saying so here
    // costs one comparison and saves a 400 that reads like a mystery.
    if (action === 'suspend_user' && !severityAllowsSuspension(draftSeverity)) {
      nextErrors.severity = true
    }
    const parsed = parseConditions(draftType, conditions)
    setFormErrors(nextErrors)
    setConditionErrors(parsed.ok ? [] : parsed.errors)
    if (Object.keys(nextErrors).length > 0 || !parsed.ok) return

    create.mutate({
      name: name.trim(),
      ruleType: draftType,
      trigger,
      action,
      severity: draftSeverity,
      reasonCode: reasonCode.trim(),
      conditions: parsed.conditions,
      ...(description.trim() ? { description: description.trim() } : {}),
    })
  }

  const columns = useMemo<ColumnDef<CmsSafetyRule, unknown>[]>(
    () => [
      {
        id: 'name',
        header: () => t('safety.col.name'),
        cell: ({ row }) => (
          <div>
            <p className={styles.name}>{row.original.name}</p>
            <p className={styles.reason}>{row.original.reasonCode}</p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'ruleType',
        header: () => t('safety.col.ruleType'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {t(`safety.ruleType.${row.original.ruleType}` as const)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'trigger',
        header: () => t('safety.col.trigger'),
        cell: ({ row }) => (
          <span className={styles.muted}>
            {t(`safety.trigger.${row.original.trigger}` as const)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'action',
        header: () => t('safety.col.action'),
        cell: ({ row }) => (
          <span className={styles.muted}>{t(`safety.action.${row.original.action}` as const)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'severity',
        header: () => t('safety.col.severity'),
        cell: ({ row }) => <SafetyRuleSeverityBadge severity={row.original.severity} />,
        enableSorting: false,
      },
      {
        id: 'priority',
        header: () => t('safety.col.priority'),
        cell: ({ row }) => (
          <span className={styles.priority}>{formatNumber(row.original.priority, locale)}</span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        header: () => t('safety.col.status'),
        cell: ({ row }) => <SafetyRuleStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: 'updatedAt',
        header: () => t('safety.col.updatedAt'),
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
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('safety.title')} />
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
        breadcrumb={[{ label: t('app.suffix') }, { label: t('safety.breadcrumb') }]}
        title={t('safety.title')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={14} />}
              onClick={() => setCreateOpen(true)}
            >
              {t('safety.new')}
            </Button>
          ) : null
        }
      />
      <PageBody>
        {/* Said on the list too, not only in a rule: this is where an ops
            admin first meets the resource, and the screen must not imply an
            enforcement path that has not shipped. */}
        <p className={styles.immutable}>{t('safety.enforcementNote')}</p>

        <Card>
          <div className={styles.filterBar}>
            <SearchInput
              label={t('safety.filter.search')}
              placeholder={t('safety.filter.search')}
              className={styles.search}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPaging()
              }}
            />
            <InlineSelect
              label={t('safety.col.ruleType')}
              value={ruleType}
              onChange={(event) => {
                setRuleType(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('safety.filter.typeAll')}</option>
              {safetyRuleTypeSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`safety.ruleType.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('safety.col.status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('safety.filter.statusAll')}</option>
              {safetyRuleStatusSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`safety.status.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              label={t('safety.col.severity')}
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('safety.filter.severityAll')}</option>
              {safetyRuleSeveritySchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`safety.severity.${value}` as const)}
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
            empty={<EmptyState title={t('safety.empty')} hint={t('safety.emptyHint')} />}
          >
            {(items) => (
              <>
                <DataTable
                  data={items}
                  columns={columns}
                  getRowId={(row) => row.id}
                  caption={t('safety.title')}
                  onRowClick={(row) => navigate(`/safety-rules/${row.id}`)}
                />
                <div className={styles.pager}>
                  <p className={styles.pagerInfo}>
                    {t('safety.pageInfo', {
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
        title={t('safety.new')}
        description={t('safety.newHint')}
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
              onClick={submit}
            >
              {t('safety.create')}
            </Button>
          </div>
        }
      >
        <form className={styles.formGrid} onSubmit={(event) => event.preventDefault()} noValidate>
          <TextInput
            label={t('safety.field.name')}
            required
            error={formErrors.name ? t('safety.error.name') : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextInput
            label={t('safety.field.reasonCode')}
            required
            hint={t('safety.field.reasonCodeHint')}
            error={formErrors.reasonCode ? t('safety.error.reasonCode') : undefined}
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value)}
          />
          <Select
            label={t('safety.field.ruleType')}
            required
            hint={t('safety.field.ruleTypeHint')}
            value={draftType}
            onChange={(event) => changeType(event.target.value as SafetyRuleType)}
          >
            {safetyRuleTypeSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`safety.ruleType.${value}` as const)}
              </option>
            ))}
          </Select>
          <Select
            label={t('safety.field.trigger')}
            required
            value={trigger}
            onChange={(event) => setTrigger(event.target.value as typeof trigger)}
          >
            {/* Only the triggers this rule type can be evaluated on. */}
            {ALLOWED_TRIGGERS[draftType].map((value) => (
              <option key={value} value={value}>
                {t(`safety.trigger.${value}` as const)}
              </option>
            ))}
          </Select>
          <Select
            label={t('safety.field.action')}
            required
            value={action}
            onChange={(event) => setAction(event.target.value as SafetyRuleAction)}
          >
            {/* Only the actions this rule type may take. */}
            {ALLOWED_ACTIONS[draftType].map((value) => (
              <option key={value} value={value}>
                {t(`safety.action.${value}` as const)}
              </option>
            ))}
          </Select>
          <Select
            label={t('safety.field.severity')}
            required
            error={formErrors.severity ? t('safety.error.severity') : undefined}
            value={draftSeverity}
            onChange={(event) => setDraftSeverity(event.target.value as SafetyRuleSeverity)}
          >
            {safetyRuleSeveritySchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`safety.severity.${value}` as const)}
              </option>
            ))}
          </Select>
          <TextArea
            label={t('safety.field.description')}
            rows={2}
            className={styles.formFull}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <ConditionFields
            ruleType={draftType}
            draft={conditions}
            errors={conditionErrors}
            onChange={(key, value) => setConditions((current) => ({ ...current, [key]: value }))}
          />

          {action === 'suspend_user' ? (
            <p className={`${styles.formNote} ${styles.formFull}`}>
              <span aria-hidden="true">⚠</span>
              {t('safety.suspendWarning')}
            </p>
          ) : null}
          <p className={`${styles.formNote} ${styles.formFull}`}>
            <span aria-hidden="true">ℹ</span>
            {t('safety.createNote')}
          </p>
        </form>
      </Drawer>
    </>
  )
}
