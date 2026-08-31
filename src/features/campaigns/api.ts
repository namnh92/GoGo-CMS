import { apiFetchParsed } from '@/shared/api/client'
import {
  cmsCampaignAudienceEstimateSchema,
  cmsCampaignPageSchema,
  cmsCampaignSchema,
  cmsCampaignTestSendSchema,
  type CampaignAudience,
  type CampaignDestination,
  type CampaignStatus,
  type CmsCampaign,
  type CmsCampaignAudienceEstimate,
  type CmsCampaignPage,
  type CmsCampaignTestSend,
} from '@/shared/api/contracts'

/** Every parameter `GET /cms/campaigns` accepts (GoGo-BE#226). */
export type CampaignFilters = {
  status?: CampaignStatus
  audienceType?: CampaignAudience
  q?: string
  limit?: number
  cursor?: string | null
}

export function fetchCampaigns(
  filters: CampaignFilters,
  signal?: AbortSignal,
): Promise<CmsCampaignPage> {
  return apiFetchParsed(cmsCampaignPageSchema, '/cms/campaigns', {
    query: {
      status: filters.status,
      audienceType: filters.audienceType,
      q: filters.q || undefined,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function fetchCampaign(id: string, signal?: AbortSignal): Promise<CmsCampaign> {
  return apiFetchParsed(cmsCampaignSchema, `/cms/campaigns/${id}`, { signal })
}

/** Exactly the fields `CmsCampaignCreate` declares. */
export type CreateCampaignInput = {
  name: string
  title: string
  body: string
  audienceType: CampaignAudience
  imageKey?: string
  ctaLabel?: string
  /** Closed per audience type: `platform` takes `{ platform }`, the rest `{}`. */
  audienceFilter?: Record<string, unknown>
  destinationType?: CampaignDestination
  /** Required for place/recommendation/plan_template/external_url. */
  destinationValue?: string
}

/** Created as a `draft`; nothing is sent until it is scheduled. */
export function createCampaign(input: CreateCampaignInput): Promise<CmsCampaign> {
  return apiFetchParsed(cmsCampaignSchema, '/cms/campaigns', { method: 'POST', body: input })
}

/**
 * Editable only in `draft`, `cancelled` or `failed`. Editing a scheduled
 * campaign would silently change what is about to go out — it has to be
 * unscheduled first, which is a deliberate, audited act.
 */
export type UpdateCampaignInput = Partial<CreateCampaignInput>

export function updateCampaign(id: string, input: UpdateCampaignInput): Promise<CmsCampaign> {
  return apiFetchParsed(cmsCampaignSchema, `/cms/campaigns/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

/**
 * How many people this would reach, right now. A read with no side effect —
 * nothing is written and nothing is sent.
 */
export function estimateCampaignAudience(
  id: string,
  signal?: AbortSignal,
): Promise<CmsCampaignAudienceEstimate> {
  return apiFetchParsed(
    cmsCampaignAudienceEstimateSchema,
    `/cms/campaigns/${id}/audience-estimate`,
    { signal },
  )
}

/**
 * Make a campaign due. **No message exists yet**: this marks the row
 * `scheduled` and returns — the worker picks up what is due on its next tick,
 * resolves the audience then, and dispatches through the provider adapter.
 *
 * Omitting `sendAt` means now.
 */
export function scheduleCampaign(id: string, sendAt?: string): Promise<CmsCampaign> {
  return apiFetchParsed(cmsCampaignSchema, `/cms/campaigns/${id}/schedule`, {
    method: 'POST',
    body: sendAt ? { sendAt } : {},
  })
}

/**
 * Works while `scheduled`. Once the worker is `sending`, some messages are
 * already on phones and there is nothing to recall — the server refuses with
 * how far the send got rather than reporting a cancellation it cannot perform.
 */
export function cancelCampaign(id: string): Promise<CmsCampaign> {
  return apiFetchParsed(cmsCampaignSchema, `/cms/campaigns/${id}/cancel`, { method: 'POST' })
}

/**
 * One copy to the caller's own account, matched on a verified email between
 * the staff account and a consumer account — so this cannot push a message at
 * somebody else. It never changes `status`, and it is queued for the worker
 * like everything else.
 */
export function testSendCampaign(id: string): Promise<CmsCampaignTestSend> {
  return apiFetchParsed(cmsCampaignTestSendSchema, `/cms/campaigns/${id}/test-send`, {
    method: 'POST',
  })
}
