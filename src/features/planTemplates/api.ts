import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  cmsPlanTemplateDetailSchema,
  cmsPlanTemplatePageSchema,
  type BudgetRange,
  type CmsPlanTemplateDetail,
  type CmsPlanTemplatePage,
  type ContentAudience,
  type PlanTemplateStatus,
} from '@/shared/api/contracts'

/** Every parameter `GET /cms/plan-templates` accepts (GoGo-BE#223). */
export type PlanTemplateFilters = {
  status?: PlanTemplateStatus
  audience?: ContentAudience
  areaKey?: string
  q?: string
  limit?: number
  cursor?: string | null
}

export function fetchPlanTemplates(
  filters: PlanTemplateFilters,
  signal?: AbortSignal,
): Promise<CmsPlanTemplatePage> {
  return apiFetchParsed(cmsPlanTemplatePageSchema, '/cms/plan-templates', {
    query: {
      status: filters.status,
      audience: filters.audience,
      areaKey: filters.areaKey,
      q: filters.q || undefined,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function fetchPlanTemplate(
  id: string,
  signal?: AbortSignal,
): Promise<CmsPlanTemplateDetail> {
  return apiFetchParsed(cmsPlanTemplateDetailSchema, `/cms/plan-templates/${id}`, { signal })
}

/** Exactly `CmsPlanTemplateStopInput`. Order is the array index. */
export type PlanTemplateStopInput = {
  categoryTaxonomyId: string
  expectedDurationMinutes: number
  preferredPlaceId?: string
  isOptional?: boolean
  budget?: BudgetRange
  note?: string
}

export type CreatePlanTemplateInput = {
  slug: string
  internalName: string
  title: string
  description?: string
  locale?: string
  audience?: ContentAudience
  areaKey?: string
  budget?: BudgetRange
  expectedDurationMinutes?: number
  taxonomyIds?: string[]
  stops?: PlanTemplateStopInput[]
}

export function createPlanTemplate(input: CreatePlanTemplateInput): Promise<CmsPlanTemplateDetail> {
  return apiFetchParsed(cmsPlanTemplateDetailSchema, '/cms/plan-templates', {
    method: 'POST',
    body: input,
  })
}

/**
 * Omitted fields are left alone; a sent list replaces that list wholesale.
 * Editing a template does not touch any plan built from it earlier.
 */
export type UpdatePlanTemplateInput = Partial<Omit<CreatePlanTemplateInput, 'slug'>>

export function updatePlanTemplate(
  id: string,
  input: UpdatePlanTemplateInput,
): Promise<CmsPlanTemplateDetail> {
  return apiFetchParsed(cmsPlanTemplateDetailSchema, `/cms/plan-templates/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

/**
 * Declared transitions only; `archived` is terminal. Publishing needs at least
 * one stop — a template with none is not a plan anyone can be given.
 */
export function setPlanTemplateStatus(id: string, status: PlanTemplateStatus) {
  return apiFetch(`/cms/plan-templates/${id}/status`, { method: 'PATCH', body: { status } })
}

/** Replaces the ordered stop list; the array index becomes the stored position. */
export function setPlanTemplateStops(
  id: string,
  stops: PlanTemplateStopInput[],
): Promise<CmsPlanTemplateDetail> {
  return apiFetchParsed(cmsPlanTemplateDetailSchema, `/cms/plan-templates/${id}/stops`, {
    method: 'PUT',
    body: { stops },
  })
}
