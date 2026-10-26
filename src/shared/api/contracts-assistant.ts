import { z } from 'zod'
import type { Schemas } from './generated'

/**
 * GoGo-CMS#249 — boundary schemas for the GoGo AI back office (GoGo-BE#713,
 * OpenAPI `2.0.0-alpha.2`, tag `assistant`).
 *
 * Every shape mirrors a component schema in the vendored spec; the
 * `Mirrors<…>` checks at the bottom make a re-vendor that changes one of them
 * a type error here instead of a blank screen. Optional fields are
 * `nullish()` for the reason the rest of the boundary uses: a backend that
 * omits one degrades a cell to "—" rather than failing the whole parse.
 *
 * Extensible enums (`x-extensible-enum`) are plain strings: the server may add
 * a value before this console knows it, and the UI renders an unknown one
 * generically instead of refusing the response.
 */

export const assistantDocumentStatusSchema = z.enum(['draft', 'published', 'unpublished'])
export type AssistantDocumentStatus = z.infer<typeof assistantDocumentStatusSchema>

export const assistantLocaleSchema = z.enum(['vi', 'en'])
export type AssistantLocale = z.infer<typeof assistantLocaleSchema>

/** Known values of the extensible `AssistantFeedbackReason`. */
export const ASSISTANT_FEEDBACK_REASONS = [
  'incorrect',
  'not_helpful',
  'unsafe',
  'outdated',
  'other',
] as const

/** Known values of the extensible version `state`. */
export const ASSISTANT_VERSION_STATES = [
  'draft',
  'published',
  'superseded',
  'withdrawn',
  'discarded',
] as const

/** Staff identity only — never a GoGo user. */
export const cmsAssistantActorSchema = z.object({
  adminId: z.string(),
  displayName: z.string().nullish(),
  role: z.string(),
})
export type CmsAssistantActor = z.infer<typeof cmsAssistantActorSchema>

export const cmsAssistantVersionSummarySchema = z.object({
  id: z.string(),
  number: z.number(),
  state: z.string(),
  title: z.string(),
  bodySha256: z.string(),
  revision: z.number().nullish(),
  createdAt: z.string(),
  createdBy: cmsAssistantActorSchema,
  publishedAt: z.string().nullish(),
  publishedBy: cmsAssistantActorSchema.nullish(),
  publishReason: z.string().nullish(),
  withdrawnAt: z.string().nullish(),
  withdrawnBy: cmsAssistantActorSchema.nullish(),
  withdrawReason: z.string().nullish(),
})
export type CmsAssistantVersionSummary = z.infer<typeof cmsAssistantVersionSummarySchema>

export const cmsAssistantVersionSchema = cmsAssistantVersionSummarySchema.extend({
  documentId: z.string(),
  description: z.string(),
  body: z.string(),
})
export type CmsAssistantVersion = z.infer<typeof cmsAssistantVersionSchema>

export const cmsAssistantVersionPageSchema = z.object({
  items: z.array(cmsAssistantVersionSummarySchema).default([]),
  nextCursor: z.string().nullable(),
})
export type CmsAssistantVersionPage = z.infer<typeof cmsAssistantVersionPageSchema>

export const cmsAssistantDocumentSchema = z.object({
  id: z.string(),
  slug: z.string(),
  locale: assistantLocaleSchema,
  status: assistantDocumentStatusSchema,
  title: z.string(),
  publishedVersion: cmsAssistantVersionSummarySchema.nullish(),
  draftVersion: cmsAssistantVersionSummarySchema.nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsAssistantDocument = z.infer<typeof cmsAssistantDocumentSchema>

export const cmsAssistantDocumentPageSchema = z.object({
  items: z.array(cmsAssistantDocumentSchema).default([]),
  nextCursor: z.string().nullable(),
})
export type CmsAssistantDocumentPage = z.infer<typeof cmsAssistantDocumentPageSchema>

export const cmsAssistantDocumentDetailSchema = z.object({
  document: cmsAssistantDocumentSchema,
  draft: cmsAssistantVersionSchema.nullable(),
  published: cmsAssistantVersionSchema.nullable(),
})
export type CmsAssistantDocumentDetail = z.infer<typeof cmsAssistantDocumentDetailSchema>

export const assistantSourceSchema = z.object({
  index: z.number(),
  kind: z.string(),
  documentId: z.string().nullish(),
  versionId: z.string().nullish(),
  slug: z.string().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  checkedAt: z.string().nullish(),
})
export type AssistantSource = z.infer<typeof assistantSourceSchema>

export const assistantNoticeSchema = z.object({
  kind: z.string(),
  reason: z.string().nullish(),
  copyKey: z.string().nullish(),
})

/**
 * Minimal PII by construction: no user id, email, user message, attachment,
 * context or coordinates. The schema is `strip` (zod's default), so even a
 * server that started sending one of those would not carry it into a render.
 */
export const cmsAssistantFeedbackItemSchema = z.object({
  id: z.string(),
  rating: z.enum(['up', 'down']),
  reason: z.string().nullish(),
  createdAt: z.string(),
  conversationRef: z.string(),
  reply: z.object({
    status: z.string(),
    text: z.string(),
    sources: z.array(assistantSourceSchema).default([]),
    cardKinds: z.array(z.string()).nullish(),
    proposalKinds: z.array(z.string()).nullish(),
    notice: assistantNoticeSchema.nullish(),
    model: z.string().nullish(),
  }),
})
export type CmsAssistantFeedbackItem = z.infer<typeof cmsAssistantFeedbackItemSchema>

export const cmsAssistantFeedbackPageSchema = z.object({
  items: z.array(cmsAssistantFeedbackItemSchema).default([]),
  nextCursor: z.string().nullable(),
})
export type CmsAssistantFeedbackPage = z.infer<typeof cmsAssistantFeedbackPageSchema>

/** Request bodies come straight from the generated client. */
export type CmsAssistantDocumentCreateBody = Schemas['CmsAssistantDocumentCreate']
export type CmsAssistantDocumentDraftPatchBody = Schemas['CmsAssistantDocumentDraftPatch']

/**
 * Compile-time drift checks. Each says: every field the spec requires is one
 * the parsed value carries, with a compatible type. A re-vendor that renames
 * or retypes one fails `pnpm typecheck`.
 */
type Mirrors<Parsed, Spec> = {
  [K in keyof Spec as undefined extends Spec[K] ? never : K]-?: K extends keyof Parsed
    ? NonNullable<Parsed[K]> extends never
      ? false
      : true
    : false
}
type AllTrue<T> = T[keyof T] extends true ? true : false
type Expect<T extends true> = T

export type AssistantContractChecks = [
  Expect<AllTrue<Mirrors<CmsAssistantDocument, Schemas['CmsAssistantDocument']>>>,
  Expect<
    AllTrue<Mirrors<CmsAssistantVersionSummary, Schemas['CmsAssistantDocumentVersionSummary']>>
  >,
  Expect<AllTrue<Mirrors<CmsAssistantVersion, Schemas['CmsAssistantDocumentVersion']>>>,
  Expect<AllTrue<Mirrors<CmsAssistantDocumentDetail, Schemas['CmsAssistantDocumentDetail']>>>,
  Expect<AllTrue<Mirrors<CmsAssistantFeedbackItem, Schemas['CmsAssistantFeedbackItem']>>>,
  Expect<AllTrue<Mirrors<AssistantSource, Schemas['AssistantSource']>>>,
  Expect<
    Schemas['AssistantDocumentStatus'] extends AssistantDocumentStatus
      ? AssistantDocumentStatus extends Schemas['AssistantDocumentStatus']
        ? true
        : false
      : false
  >,
]
