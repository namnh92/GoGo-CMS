import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  cmsSafetyRulePageSchema,
  cmsSafetyRuleSchema,
  type CmsSafetyRule,
  type CmsSafetyRulePage,
  type SafetyRuleAction,
  type SafetyRuleSeverity,
  type SafetyRuleStatus,
  type SafetyRuleTrigger,
  type SafetyRuleType,
} from '@/shared/api/contracts'

/** Every parameter `GET /cms/safety-rules` accepts (GoGo-BE#225). */
export type SafetyRuleFilters = {
  ruleType?: SafetyRuleType
  status?: SafetyRuleStatus
  action?: SafetyRuleAction
  severity?: SafetyRuleSeverity
  trigger?: SafetyRuleTrigger
  q?: string
  limit?: number
  cursor?: string | null
}

export function fetchSafetyRules(
  filters: SafetyRuleFilters,
  signal?: AbortSignal,
): Promise<CmsSafetyRulePage> {
  return apiFetchParsed(cmsSafetyRulePageSchema, '/cms/safety-rules', {
    query: {
      ruleType: filters.ruleType,
      status: filters.status,
      action: filters.action,
      severity: filters.severity,
      trigger: filters.trigger,
      q: filters.q || undefined,
      limit: filters.limit ?? 25,
      // Keyset, not an offset: `priority` is editable, so a row whose
      // priority changed mid-traversal would jump pages.
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function fetchSafetyRule(id: string, signal?: AbortSignal): Promise<CmsSafetyRule> {
  return apiFetchParsed(cmsSafetyRuleSchema, `/cms/safety-rules/${id}`, { signal })
}

/** Exactly the fields `CmsSafetyRuleCreate` declares. */
export type CreateSafetyRuleInput = {
  name: string
  ruleType: SafetyRuleType
  trigger: SafetyRuleTrigger
  action: SafetyRuleAction
  reasonCode: string
  description?: string
  severity?: SafetyRuleSeverity
  priority?: number
  conditions?: Record<string, unknown>
}

export function createSafetyRule(input: CreateSafetyRuleInput): Promise<CmsSafetyRule> {
  return apiFetchParsed(cmsSafetyRuleSchema, '/cms/safety-rules', { method: 'POST', body: input })
}

/**
 * `ruleType` is absent on purpose: it is immutable server-side, because it
 * decides which condition schema applies and changing it would reinterpret
 * stored conditions rather than revalidate them.
 */
export type UpdateSafetyRuleInput = Partial<Omit<CreateSafetyRuleInput, 'ruleType'>>

export function updateSafetyRule(id: string, input: UpdateSafetyRuleInput): Promise<CmsSafetyRule> {
  return apiFetchParsed(cmsSafetyRuleSchema, `/cms/safety-rules/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

/**
 * Reversible in both directions — the point of a switch is that it can be
 * thrown back. Activating revalidates the whole definition first, so a rule
 * left in draft because it was unfinished is refused rather than armed.
 */
export function setSafetyRuleStatus(id: string, status: SafetyRuleStatus) {
  return apiFetch(`/cms/safety-rules/${id}/status`, { method: 'PATCH', body: { status } })
}
