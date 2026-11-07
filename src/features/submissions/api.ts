import type { Schemas, DecidePlaceSubmissionBody } from '@/shared/api/generated'
import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  placeSubmissionDetailSchema,
  submissionCreditPreviewSchema,
  placeSubmissionListSchema,
  submissionReviewSavedSchema,
  resolveLinkResultSchema,
  type PlaceSubmissionDetail,
  type PlaceSubmissionList,
  type ResolveLinkResult,
  type SubmissionReviewDraft,
} from '@/shared/api/contracts'

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'merged'
export type SubmissionDecision = DecidePlaceSubmissionBody['decision']

/**
 * PI-CMS-007. Keyset paging, newest first — proposals keep arriving while a
 * moderator works through the queue, so a page number would repeat or skip.
 */
export function fetchSubmissions(
  params: { status: SubmissionStatus; limit?: number; cursor?: string },
  signal?: AbortSignal,
): Promise<PlaceSubmissionList> {
  return apiFetchParsed(placeSubmissionListSchema, '/cms/place-submissions', {
    query: {
      status: params.status,
      limit: params.limit ?? 25,
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
    signal,
  })
}

/**
 * GoGo-BE#528 — everything the decision needs, from rows GoGo already holds.
 * No provider request: opening a submission costs nothing.
 */
export function fetchSubmission(id: string, signal?: AbortSignal): Promise<PlaceSubmissionDetail> {
  return apiFetchParsed(placeSubmissionDetailSchema, `/cms/place-submissions/${id}`, { signal })
}

/**
 * Google's current answer about this place — one `quality` Details, rendered
 * and discarded. An action the reviewer takes, never something a screen does
 * on their behalf, because it costs money every time.
 */
export function previewSubmissionProvider(id: string): Promise<ResolveLinkResult> {
  return apiFetchParsed(resolveLinkResultSchema, `/cms/place-submissions/${id}/provider-preview`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

/**
 * Saves the supplement and decides nothing. Two requests rather than one
 * because they are two intentions — see the endpoint's own description.
 */
export function saveSubmissionReview(
  id: string,
  draft: SubmissionReviewDraft,
  expectedUpdatedAt?: string,
) {
  return apiFetchParsed(submissionReviewSavedSchema, `/cms/place-submissions/${id}/review`, {
    method: 'PUT',
    body: { draft, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) },
  })
}

/** The generated union requires a public key for rejection, a note otherwise. */
export function decideSubmission(id: string, body: DecidePlaceSubmissionBody) {
  return apiFetch(`/cms/place-submissions/${id}/decide`, {
    method: 'POST',
    body,
    idempotencyKey: newIdempotencyKey(),
  })
}

/** Only the authenticated, sanitised BE endpoint; never a public asset/original URL. */
export function fetchSubmissionPhoto(id: string, photoId: string, signal?: AbortSignal) {
  return apiFetch<Blob>(
    `/cms/place-submissions/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}/content`,
    { raw: true, accept: 'image/webp', cache: 'no-store', signal },
  )
}

/** Read-only server calculation for this exact explicit selection. */
export function previewSubmissionCredit(
  id: string,
  enrichmentSelection: Schemas['EnrichmentSelection'],
  signal?: AbortSignal,
) {
  return apiFetchParsed(
    submissionCreditPreviewSchema,
    `/cms/place-submissions/${id}/credit-preview`,
    {
      method: 'POST',
      body: { enrichmentSelection },
      signal,
    },
  )
}
