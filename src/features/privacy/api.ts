import { apiFetchParsed } from '@/shared/api/client'
import {
  privacyExecuteResultSchema,
  privacyRequestPageSchema,
  privacyRequestSchema,
  type PrivacyDeliveryMethod,
  type PrivacyExecuteResult,
  type PrivacyRequest,
  type PrivacyRequestOutcome,
  type PrivacyRequestPage,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from '@/shared/api/contracts'

/** Every parameter `GET /cms/privacy-requests` accepts (GoGo-BE#255). */
export type PrivacyFilters = {
  status?: PrivacyRequestStatus
  type?: PrivacyRequestType
  outcome?: PrivacyRequestOutcome
  /** Computed against the same stored dates the badge uses — they cannot disagree. */
  sla?: 'overdue' | 'due_soon'
  userId?: string
  limit?: number
  cursor?: string | null
}

export function fetchPrivacyRequests(
  filters: PrivacyFilters,
  signal?: AbortSignal,
): Promise<PrivacyRequestPage> {
  return apiFetchParsed(privacyRequestPageSchema, '/cms/privacy-requests', {
    query: {
      status: filters.status,
      type: filters.type,
      outcome: filters.outcome,
      sla: filters.sla,
      userId: filters.userId,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function fetchPrivacyRequest(id: string, signal?: AbortSignal): Promise<PrivacyRequest> {
  return apiFetchParsed(privacyRequestSchema, `/cms/privacy-requests/${id}`, { signal })
}

/** The subject is structured: a user id, an email, or an external reference. */
export type CreatePrivacyRequestInput = {
  type: PrivacyRequestType
  subjectType: 'user' | 'email' | 'external'
  userId?: string
  contactEmail?: string
  externalReference?: string
  reasonCode?: string
  ticketReference?: string
  /** ≤256 chars on purpose — operational note, never case content. */
  operatorNote?: string
}

export function createPrivacyRequest(input: CreatePrivacyRequestInput): Promise<PrivacyRequest> {
  return apiFetchParsed(privacyRequestSchema, '/cms/privacy-requests', {
    method: 'POST',
    body: input,
  })
}

/** Stops the acknowledgement clock. */
export function acknowledgePrivacyRequest(id: string): Promise<PrivacyRequest> {
  return apiFetchParsed(privacyRequestSchema, `/cms/privacy-requests/${id}/acknowledge`, {
    method: 'POST',
  })
}

/**
 * Runs the export or delete **for this request** and closes it. Same user is
 * not same request: only the executed one becomes `completed`. A delete needs
 * `super_admin`; a correction cannot be executed at all.
 */
export function executePrivacyRequest(id: string): Promise<PrivacyExecuteResult> {
  return apiFetchParsed(privacyExecuteResultSchema, `/cms/privacy-requests/${id}/execute`, {
    method: 'POST',
  })
}

export function closePrivacyRequest(
  id: string,
  input: {
    outcome: Exclude<PrivacyRequestOutcome, 'completed'>
    reasonCode?: string
    operatorNote?: string
  },
): Promise<PrivacyRequest> {
  return apiFetchParsed(privacyRequestSchema, `/cms/privacy-requests/${id}/close`, {
    method: 'POST',
    body: input,
  })
}

/** Metadata only — never the bytes, never a signed URL. */
export function markPrivacyDelivered(
  id: string,
  deliveryMethod: PrivacyDeliveryMethod,
): Promise<PrivacyRequest> {
  return apiFetchParsed(privacyRequestSchema, `/cms/privacy-requests/${id}/delivered`, {
    method: 'POST',
    body: { deliveryMethod },
  })
}

/** A hold only ever extends retention. Reason, legal basis and review date all mandatory. */
export function holdPrivacyRetention(
  id: string,
  input: { reason: string; legalBasis: string; reviewAt: string; holdUntil?: string },
): Promise<PrivacyRequest> {
  return apiFetchParsed(privacyRequestSchema, `/cms/privacy-requests/${id}/retention-hold`, {
    method: 'POST',
    body: input,
  })
}

/** Standard retention resumes from the stamped date — never an earlier one. */
export function releasePrivacyRetention(id: string, reason: string): Promise<PrivacyRequest> {
  return apiFetchParsed(
    privacyRequestSchema,
    `/cms/privacy-requests/${id}/retention-hold/release`,
    { method: 'POST', body: { reason } },
  )
}
