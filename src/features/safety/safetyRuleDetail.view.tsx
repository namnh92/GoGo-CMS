import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import {
  safetyRuleSeveritySchema,
  type SafetyRuleAction,
  type SafetyRuleSeverity,
  type SafetyRuleStatus,
  type SafetyRuleTrigger,
} from '@/shared/api/contracts'
import { fetchSafetyRule, setSafetyRuleStatus, updateSafetyRule } from './api'
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

/**
 * Every status is reachable from every other: the point of a switch is that it
 * can be thrown back, and nothing here is terminal. Activating revalidates the
 * whole definition server-side, so a rule left in draft because it was
 * unfinished is refused rather than armed.
 */
const TRANSITIONS: Record<SafetyRuleStatus, SafetyRuleStatus[]> = {
  draft: ['active', 'disabled'],
  active: ['disabled', 'draft'],
  disabled: ['active', 'draft'],
}

export default function SafetyRuleDetailScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { id = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canRead = can('safety.read')
  const canManage = can('safety.manage')

  const query = useQuery({
    queryKey: queryKeys.safetyRules.detail(id),
    queryFn: ({ signal }) => fetchSafetyRule(id, signal),
    enabled: canRead && Boolean(id),
  })
  const rule = query.data

  const [form, setForm] = useState({
    name: '',
    description: '',
    reasonCode: '',
    trigger: '' as SafetyRuleTrigger | '',
    action: '' as SafetyRuleAction | '',
    severity: 'medium' as SafetyRuleSeverity,
    priority: '',
  })
  const [conditions, setConditions] = useState<ConditionDraft>({})
  const [conditionErrors, setConditionErrors] = useState<ConditionError[]>([])
  const [fieldErrors, setFieldErrors] = useState<{
    name?: boolean
    reasonCode?: boolean
    severity?: boolean
  }>({})

  useEffect(() => {
    if (!rule) return
    setForm({
      name: rule.name,
      description: rule.description ?? '',
      reasonCode: rule.reasonCode,
      trigger: rule.trigger,
      action: rule.action,
      severity: rule.severity,
      priority: String(rule.priority),
    })
    // Seeded from what is stored, so a field the rule never set stays empty
    // rather than acquiring the schema default on first edit.
    setConditions(toDraft(rule.ruleType, rule.conditions))
    setConditionErrors([])
    setFieldErrors({})
  }, [rule])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.safetyRules.all })
  }

  const save = useMutation({
    mutationFn: (input: Parameters<typeof updateSafetyRule>[1]) => updateSafetyRule(id, input),
    onSuccess: () => {
      toast.success(t('safety.saved'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changeStatus = useMutation({
    mutationFn: (status: SafetyRuleStatus) => setSafetyRuleStatus(id, status),
    onSuccess: () => {
      toast.success(t('safety.statusChanged'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

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

  const submit = () => {
    if (!rule) return
    const nextErrors: typeof fieldErrors = {}
    if (form.name.trim().length < 3) nextErrors.name = true
    if (!REASON_CODE_PATTERN.test(form.reasonCode.trim())) nextErrors.reasonCode = true
    if (form.action === 'suspend_user' && !severityAllowsSuspension(form.severity)) {
      nextErrors.severity = true
    }
    const parsed = parseConditions(rule.ruleType, conditions)
    setFieldErrors(nextErrors)
    setConditionErrors(parsed.ok ? [] : parsed.errors)
    if (Object.keys(nextErrors).length > 0 || !parsed.ok) return

    const priority = Number(form.priority)
    save.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      reasonCode: form.reasonCode.trim(),
      severity: form.severity,
      conditions: parsed.conditions,
      ...(form.trigger ? { trigger: form.trigger } : {}),
      ...(form.action ? { action: form.action } : {}),
      ...(Number.isInteger(priority) ? { priority } : {}),
    })
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('safety.breadcrumb'), to: '/safety-rules' },
          { label: rule?.name ?? '' },
        ]}
        title={rule?.name ?? t('safety.title')}
        showSearch={false}
        actions={
          rule ? (
            <div className="flex items-center gap-2">
              <SafetyRuleSeverityBadge severity={rule.severity} />
              <SafetyRuleStatusBadge status={rule.status} />
            </div>
          ) : null
        }
      />
      <PageBody>
        <p className={styles.immutable}>{t('safety.enforcementNote')}</p>

        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={rule ? [rule] : []}
          isEmpty={(items) => items.length === 0}
          onRetry={() => void query.refetch()}
          empty={<EmptyState />}
        >
          {([item]) => (
            <div className={styles.layout}>
              <div className={styles.main}>
                <Card>
                  <CardHeader title={t('safety.editTitle')} hint={t('safety.editHint')} />
                  <CardBody>
                    <div className={styles.formGrid}>
                      <TextInput
                        label={t('safety.field.name')}
                        required
                        value={form.name}
                        disabled={!canManage}
                        error={fieldErrors.name ? t('safety.error.name') : undefined}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('safety.field.ruleType')}
                        value={t(`safety.ruleType.${item!.ruleType}` as const)}
                        readOnly
                        disabled
                        // Immutable server-side: it decides which condition
                        // schema applies, so changing it would reinterpret
                        // stored conditions rather than revalidate them.
                        hint={t('safety.field.ruleTypeImmutable')}
                      />
                      <TextInput
                        label={t('safety.field.reasonCode')}
                        required
                        value={form.reasonCode}
                        disabled={!canManage}
                        hint={t('safety.field.reasonCodeHint')}
                        error={fieldErrors.reasonCode ? t('safety.error.reasonCode') : undefined}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, reasonCode: event.target.value }))
                        }
                      />
                      <TextInput
                        label={t('safety.field.priority')}
                        inputMode="numeric"
                        value={form.priority}
                        disabled={!canManage}
                        hint={t('safety.field.priorityHint')}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, priority: event.target.value }))
                        }
                      />
                      <Select
                        label={t('safety.field.trigger')}
                        value={form.trigger}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            trigger: event.target.value as SafetyRuleTrigger,
                          }))
                        }
                      >
                        {ALLOWED_TRIGGERS[item!.ruleType].map((value) => (
                          <option key={value} value={value}>
                            {t(`safety.trigger.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      <Select
                        label={t('safety.field.action')}
                        value={form.action}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            action: event.target.value as SafetyRuleAction,
                          }))
                        }
                      >
                        {ALLOWED_ACTIONS[item!.ruleType].map((value) => (
                          <option key={value} value={value}>
                            {t(`safety.action.${value}` as const)}
                          </option>
                        ))}
                      </Select>
                      <Select
                        label={t('safety.field.severity')}
                        value={form.severity}
                        disabled={!canManage}
                        error={fieldErrors.severity ? t('safety.error.severity') : undefined}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            severity: event.target.value as SafetyRuleSeverity,
                          }))
                        }
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
                        value={form.description}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </div>
                  </CardBody>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      loading={save.isPending}
                      disabled={!canManage || !online}
                      onClick={submit}
                    >
                      {t('action.save')}
                    </Button>
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title={t('safety.conditionsTitle')}
                    hint={t('safety.conditionsHint')}
                  />
                  <CardBody>
                    <div className={styles.formGrid}>
                      <ConditionFields
                        ruleType={item!.ruleType}
                        draft={conditions}
                        errors={conditionErrors}
                        disabled={!canManage}
                        onChange={(key, value) =>
                          setConditions((current) => ({ ...current, [key]: value }))
                        }
                      />
                    </div>
                  </CardBody>
                </Card>
              </div>

              <div className={styles.side}>
                <Card>
                  <CardHeader title={t('safety.lifecycleTitle')} hint={t('safety.lifecycleHint')} />
                  <div className={styles.statusRow}>
                    {TRANSITIONS[item!.status].map((next) => (
                      <Button
                        key={next}
                        size="sm"
                        variant={next === 'active' ? 'primary' : 'secondary'}
                        loading={changeStatus.isPending && changeStatus.variables === next}
                        disabled={!canManage || !online}
                        onClick={() => changeStatus.mutate(next)}
                      >
                        {t(`safety.transition.${next}` as const)}
                      </Button>
                    ))}
                  </div>
                  {item!.action === 'suspend_user' ? (
                    <p className={styles.note}>
                      <span aria-hidden="true">⚠</span>
                      {t('safety.suspendWarning')}
                    </p>
                  ) : null}
                </Card>

                <Card>
                  <CardHeader title={t('safety.factsTitle')} />
                  <div className={styles.facts}>
                    <div>
                      <p className={styles.factLabel}>{t('safety.col.ruleType')}</p>
                      <p className={styles.factValue}>
                        {t(`safety.ruleType.${item!.ruleType}` as const)}
                      </p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('safety.field.createdBy')}</p>
                      <p className={styles.factValue}>
                        {item!.createdBy?.displayName ?? item!.createdBy?.id ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('safety.col.updatedAt')}</p>
                      <p className={styles.factValue}>{formatDateTime(item!.updatedAt, locale)}</p>
                    </div>
                    <div>
                      <p className={styles.factLabel}>{t('safety.field.createdAt')}</p>
                      <p className={styles.factValue}>{formatDateTime(item!.createdAt, locale)}</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}
