import { apiFetchParsed } from '@/shared/api/client'
import {
  cmsAssistantDocumentDetailSchema,
  cmsAssistantDocumentPageSchema,
  cmsAssistantDocumentSchema,
  cmsAssistantFeedbackPageSchema,
  cmsAssistantGuideCoverageSchema,
  cmsAssistantVersionPageSchema,
  cmsAssistantVersionSchema,
  type AssistantDocumentStatus,
  type AssistantLocale,
  type CmsAssistantDocument,
  type CmsAssistantDocumentCreateBody,
  type CmsAssistantDocumentDetail,
  type CmsAssistantDocumentDraftPatchBody,
  type CmsAssistantDocumentPage,
  type CmsAssistantFeedbackPage,
  type CmsAssistantGuideCoverage,
  type CmsAssistantPublishBody,
  type CmsAssistantVersion,
  type CmsAssistantVersionPage,
} from '@/shared/api/contracts-assistant'

/**
 * GoGo-CMS#249 — the GoGo AI back office over GoGo-BE#713.
 *
 * Every route here is declared in the contract as planned (`x-gogo-planned`)
 * and answers 404 until the module ships; the screens are built against the
 * contract and the mock, never against guesses about the implementation.
 */

/** Audit resource the BFF writes for every document change. */
export const ASSISTANT_AUDIT_RESOURCE = 'assistant_document'

/** The kill switch: an ordinary feature flag, through the existing endpoint. */
export const ASSISTANT_FLAG_KEY = 'assistant.enabled'

export type DocumentFilters = {
  status?: AssistantDocumentStatus
  locale?: AssistantLocale
  /** The server wants 2–100 characters; shorter is not sent at all. */
  q?: string
  limit?: number
  cursor?: string | null
}

export function fetchDocuments(
  filters: DocumentFilters,
  signal?: AbortSignal,
): Promise<CmsAssistantDocumentPage> {
  const q = filters.q?.trim()
  return apiFetchParsed(cmsAssistantDocumentPageSchema, '/cms/assistant/documents', {
    query: {
      status: filters.status,
      locale: filters.locale,
      q: q && q.length >= 2 ? q.slice(0, 100) : undefined,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function createDocument(
  body: CmsAssistantDocumentCreateBody,
): Promise<CmsAssistantDocument> {
  return apiFetchParsed(cmsAssistantDocumentSchema, '/cms/assistant/documents', {
    method: 'POST',
    body,
  })
}

export function fetchDocument(
  id: string,
  signal?: AbortSignal,
): Promise<CmsAssistantDocumentDetail> {
  return apiFetchParsed(
    cmsAssistantDocumentDetailSchema,
    `/cms/assistant/documents/${encodeURIComponent(id)}`,
    { signal },
  )
}

/** Writes the draft only; a stale `baseRevision` is `409 REVISION_CONFLICT`. */
export function updateDraft(
  id: string,
  body: CmsAssistantDocumentDraftPatchBody,
): Promise<CmsAssistantDocumentDetail> {
  return apiFetchParsed(
    cmsAssistantDocumentDetailSchema,
    `/cms/assistant/documents/${encodeURIComponent(id)}`,
    { method: 'PATCH', body },
  )
}

/**
 * `versionId` is the open draft, or an earlier version to roll back to.
 * `revision` is the revision the publisher reviewed (GoGo-BE#736): if the
 * draft moved on since, the server answers `409 REVISION_CONFLICT` instead of
 * shipping text nobody read.
 */
export function publishVersion(
  id: string,
  input: { versionId: string; revision?: number | null; reason?: string },
): Promise<CmsAssistantDocumentDetail> {
  const reason = input.reason?.trim()
  const body: CmsAssistantPublishBody = {
    versionId: input.versionId,
    ...(typeof input.revision === 'number' ? { revision: input.revision } : {}),
    ...(reason ? { reason } : {}),
  }
  return apiFetchParsed(
    cmsAssistantDocumentDetailSchema,
    `/cms/assistant/documents/${encodeURIComponent(id)}/publish`,
    { method: 'POST', body },
  )
}

/** The server wants 2–2000 characters; shorter is not sent at all. */
export const COVERAGE_QUESTION_MIN = 2
export const COVERAGE_QUESTION_MAX = 2000

/**
 * GoGo-BE#736 — which published sections an assistant turn would retrieve for
 * `question`, through the same path, and why it found none. Read-only.
 */
export function fetchGuideCoverage(
  input: { question: string; locale: AssistantLocale },
  signal?: AbortSignal,
): Promise<CmsAssistantGuideCoverage> {
  return apiFetchParsed(cmsAssistantGuideCoverageSchema, '/cms/assistant/guide-coverage', {
    query: {
      question: input.question.trim().slice(0, COVERAGE_QUESTION_MAX),
      locale: input.locale,
    },
    signal,
  })
}

export function unpublishDocument(id: string, reason: string): Promise<CmsAssistantDocumentDetail> {
  return apiFetchParsed(
    cmsAssistantDocumentDetailSchema,
    `/cms/assistant/documents/${encodeURIComponent(id)}/unpublish`,
    { method: 'POST', body: { reason: reason.trim() } },
  )
}

export function fetchVersions(id: string, signal?: AbortSignal): Promise<CmsAssistantVersionPage> {
  return apiFetchParsed(
    cmsAssistantVersionPageSchema,
    `/cms/assistant/documents/${encodeURIComponent(id)}/versions`,
    { query: { limit: 100 }, signal },
  )
}

export function fetchVersion(
  id: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<CmsAssistantVersion> {
  return apiFetchParsed(
    cmsAssistantVersionSchema,
    `/cms/assistant/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
    { signal },
  )
}

export type FeedbackFilters = {
  rating?: 'up' | 'down'
  reason?: string
  /** ISO date-time. */
  from?: string
  to?: string
  limit?: number
  cursor?: string | null
}

export function fetchFeedback(
  filters: FeedbackFilters,
  signal?: AbortSignal,
): Promise<CmsAssistantFeedbackPage> {
  return apiFetchParsed(cmsAssistantFeedbackPageSchema, '/cms/assistant/feedback', {
    query: {
      rating: filters.rating,
      reason: filters.reason || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      limit: filters.limit ?? 20,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}
