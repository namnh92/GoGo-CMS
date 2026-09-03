import { z } from 'zod'

/*
 * Boundary schemas for the `/v1/cms/*` surface.
 *
 * Request bodies follow `openapi/gogo.v1.yaml` exactly (see each feature's
 * api.ts). Responses are validated here because most of the CMS half of the
 * spec still documents its GETs with a prose description and no schema — see
 * `docs/adr/0002-boundary-validation.md`. GoGo-BE#175 filled the schemas for
 * the seven operations the console reads most, and the shapes below now mirror
 * those component schemas rather than guessing.
 *
 * Several shapes are leaner and less tidy than a DTO would be because they are
 * the query result: `/cms/places/stale` and `/cms/places/duplicates` return
 * bare arrays of raw snake_case SQL rows. The feature `api.ts` normalizes those
 * into the camelCase the UI uses, so the awkwardness stops at the boundary.
 *
 * Optional fields are `nullish()` so a backend that omits one degrades a cell
 * to "—" instead of blanking the screen.
 */

export const adminRoleSchema = z.enum(['editor', 'moderator', 'ops_admin', 'super_admin'])
export type AdminRole = z.infer<typeof adminRoleSchema>

/**
 * `GET /cms/auth/admins` (GoGo-BE#220).
 *
 * Two states, because two is what the guard enforces: a `suspended` account
 * loses access on its next request whatever token it still holds. There is no
 * third "disabled" state to render — a status nothing acts on would be a claim
 * in the data with nothing behind it.
 */
export const adminStatusSchema = z.enum(['active', 'suspended'])
export type AdminStatus = z.infer<typeof adminStatusSchema>

/**
 * `email` is here because it is how a staff account is identified. Nothing
 * else about the person is: no phone, no password hash, no TOTP secret, no
 * session material — the server does not select them, so there is nothing to
 * leak by accident.
 */
export const cmsAdminSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: adminRoleSchema,
  status: adminStatusSchema,
  createdAt: z.string(),
  /** Absent on an account that has never signed in. */
  lastLoginAt: z.string().nullish(),
  /**
   * #248. Whether a second factor is enrolled — the status, never anything
   * about the secret. Defaulted for resilience against an older payload.
   */
  mfaEnrolled: z.boolean().default(false),
  /** A temporary password is outstanding on this account. */
  mustChangePassword: z.boolean().default(false),
})
export type CmsAdmin = z.infer<typeof cmsAdminSchema>

export const cmsAdminPageSchema = z.object({
  items: z.array(cmsAdminSchema).default([]),
  /** Keyset cursor over (createdAt, id). */
  nextCursor: z.string().nullable().default(null),
  /** Accounts matching the filter, not accounts in this page. */
  totalCount: z.number().int().default(0),
})
export type CmsAdminPage = z.infer<typeof cmsAdminPageSchema>

export const placeStatusSchema = z.enum([
  'draft',
  'community_submitted',
  'review',
  'published',
  'suspended',
  'archived',
])
export type PlaceStatus = z.infer<typeof placeStatusSchema>

/** The four units a price may be written with (`cmsAddPlacePrice`). */
export const priceUnitSchema = z.enum(['per_person', 'per_item', 'per_hour', 'per_night'])
export type PriceUnit = z.infer<typeof priceUnitSchema>

/** `{ id, displayName }` — the whole of what audit-adjacent reads say about an admin. */
export const adminRefSchema = z.object({
  id: z.string(),
  displayName: z.string().nullish(),
})
export type AdminRef = z.infer<typeof adminRefSchema>

/**
 * `CmsPlaceDetail.ratings` — provider and GoGo kept apart, never averaged.
 * They measure different populations, so a blended number would describe
 * neither (FR-INGEST-006). The composite score the spec also mentions is not
 * computed anywhere yet, so there is no field for it and the UI shows none.
 */
export const placeRatingsSchema = z.object({
  provider: z.object({ rating: z.number().nullish(), count: z.number().int().default(0) }),
  gogo: z.object({ rating: z.number().nullish(), count: z.number().int().default(0) }),
})
export type PlaceRatings = z.infer<typeof placeRatingsSchema>

/** Money is integer minor units; `currency` travels with it, never assumed. */
export const placePriceSchema = z.object({
  id: z.string(),
  priceMin: z.number().int(),
  priceMax: z.number().int(),
  currency: z.string(),
  /** Free-form on read — labels resolve via i18n and fall back to the key. */
  unit: z.string(),
  source: z.string(),
  confidence: z.number(),
  verifiedAt: z.string().nullish(),
  createdAt: z.string().nullish(),
})
export type PlacePrice = z.infer<typeof placePriceSchema>

/** `dayOfWeek` follows `getUTCDay()`: 0 = Sunday, matching BE's `vnDayMinute()`. */
export const placeHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openMinute: z.number().int().min(0).max(1439),
  closeMinute: z.number().int().min(0).max(1439),
  isOvernight: z.boolean().default(false),
  source: z.string(),
  verifiedAt: z.string().nullish(),
})
export type PlaceHour = z.infer<typeof placeHourSchema>

/** Write body for `PUT /cms/places/{id}/hours` — narrower than what is read back. */
export type PlaceHourInput = Pick<
  PlaceHour,
  'dayOfWeek' | 'openMinute' | 'closeMinute' | 'isOvernight'
>

/** Provider facts must be shown with their attribution (FR-INGEST-014). */
export const placeSourceSchema = z.object({
  id: z.string(),
  provider: z.string(),
  externalId: z.string(),
  url: z.string().nullish(),
  attribution: z.string().nullish(),
  fetchedAt: z.string().nullish(),
})
export type PlaceSource = z.infer<typeof placeSourceSchema>

/**
 * Media is a storage key plus its moderation state — not a display URL. The
 * console shows what exists and whether it passed moderation; it cannot render
 * the bytes until a signed-read endpoint exists.
 */
export const placeMediaSchema = z.object({
  id: z.string(),
  storageKey: z.string(),
  width: z.number().int().nullish(),
  height: z.number().int().nullish(),
  sortOrder: z.number().int().default(0),
  moderation: z.string(),
})
export type PlaceMedia = z.infer<typeof placeMediaSchema>

/**
 * `CmsPlaceListItem` — deliberately lean: the list is a keyset-paged index,
 * not a projection of the whole place. `rating` here is the provider figure
 * the list sorts on; the detail view keeps the two rating sources apart.
 */
export const cmsPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: placeStatusSchema,
  areaKey: z.string().nullish(),
  rating: z.number().nullish(),
  confidence: z.number(),
  freshnessCheckedAt: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsPlace = z.infer<typeof cmsPlaceSchema>

/** `CmsPlaceDetail` (GoGo-BE#157) — every field `cmsUpdatePlace` accepts, plus relations. */
export const cmsPlaceDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  status: placeStatusSchema,
  addressText: z.string().nullish(),
  areaKey: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  phone: z.string().nullish(),
  website: z.string().nullish(),
  avgVisitMinutes: z.number().int().nullish(),
  suitability: z.record(z.number()).default({}),
  isLodging: z.boolean().default(false),
  curatedRank: z.number().int().nullish(),
  confidence: z.number().default(0),
  priceLevel: z.number().int().nullish(),
  ratings: placeRatingsSchema,
  taxonomyIds: z.array(z.string()).default([]),
  /** Sent alongside the ids so a chip has a label; writes still send ids. */
  taxonomyKeys: z.array(z.string()).default([]),
  hours: z.array(placeHourSchema).default([]),
  prices: z.array(placePriceSchema).default([]),
  sources: z.array(placeSourceSchema).default([]),
  media: z.array(placeMediaSchema).default([]),
  freshnessCheckedAt: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsPlaceDetail = z.infer<typeof cmsPlaceDetailSchema>

/** Keyset paging: `nextCursor` is null only when there is genuinely no more. */
export const placeListSchema = z.object({
  items: z.array(cmsPlaceSchema).default([]),
  nextCursor: z.string().nullable(),
})

export const placeSortSchema = z.enum(['updated_at', 'created_at', 'name', 'confidence'])
export type PlaceSort = z.infer<typeof placeSortSchema>

export const placeSourceFilterSchema = z.enum(['google', 'community', 'manual'])
export type PlaceSourceFilter = z.infer<typeof placeSourceFilterSchema>

/**
 * `GET /cms/places/stale` returns the raw SQL rows, snake_case and unwrapped.
 * Parsed as-is here; `features/places/api.ts` normalizes it.
 */
export const staleRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: placeStatusSchema,
  freshness_checked_at: z.string().nullable(),
})
export const staleListSchema = z.array(staleRowSchema)

export type StalePlace = {
  id: string
  name: string
  status: PlaceStatus
  freshnessCheckedAt: string | null
}

/**
 * `GET /cms/places/duplicates` also returns raw rows: two ids, two names, a
 * trigram similarity and a distance in metres. It does NOT say what a merge
 * would move — the counts the confirmation dialog wants are not available, so
 * the dialog names the affected relations instead of inventing numbers.
 */
export const duplicateRowSchema = z.object({
  place_a: z.string(),
  place_b: z.string(),
  name_a: z.string(),
  name_b: z.string(),
  name_similarity: z.coerce.number(),
  distance_m: z.coerce.number().nullable(),
})
export const duplicateListSchema = z.array(duplicateRowSchema)

export type DuplicatePair = {
  canonicalId: string
  canonicalName: string
  duplicateId: string
  duplicateName: string
  similarity: number
  distanceMeters: number | null
}

export const taxonomyKindSchema = z.enum([
  'mood',
  'category',
  'setting',
  'dietary',
  'accessibility',
  'spending_style',
  'suitability',
  'checkin_tag',
])
export type TaxonomyKind = z.infer<typeof taxonomyKindSchema>

export const taxonomySynonymSchema = z.object({
  id: z.string(),
  term: z.string(),
  locale: z.string().default('vi'),
})
export type TaxonomySynonym = z.infer<typeof taxonomySynonymSchema>

/**
 * `GET /cms/taxonomies` (GoGo-BE#159) — a bare array. Unfiltered it returns
 * active *and* inactive keys on purpose: the CMS is the only place a
 * deactivated key can be seen and switched back on, so hiding it by default
 * would make it unreachable. `usageCount` is what makes the "never delete a
 * referenced key" rule checkable from the console.
 */
export const taxonomySchema = z.object({
  id: z.string(),
  kind: taxonomyKindSchema,
  key: z.string(),
  /** Stable key → localized labels. Labels never live in business data. */
  labels: z.record(z.string()).default({}),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  usageCount: z.number().int().default(0),
  synonyms: z.array(taxonomySynonymSchema).default([]),
})
export type Taxonomy = z.infer<typeof taxonomySchema>
export const taxonomyListSchema = z.array(taxonomySchema)

export const collectionStatusSchema = z.enum(['draft', 'scheduled', 'published', 'archived'])
export type CollectionStatus = z.infer<typeof collectionStatusSchema>

/** `GET /cms/collections` returns a bare array of headers. */
export const collectionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  locale: z.string().default('vi'),
  title: z.string(),
  status: collectionStatusSchema,
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
})
export type Collection = z.infer<typeof collectionSchema>
export const collectionListSchema = z.array(collectionSchema)

/**
 * `GET /cms/collections/{id}/items` (GoGo-BE#161). `PUT .../items` replaces the
 * whole list, so reading the current one first is not a convenience — writing
 * back a list you could not read is how a curated collection gets erased.
 *
 * Each item carries the place's `status` so a curator sees that a pinned place
 * has left publication, instead of a silently empty slot.
 */
export const collectionItemSchema = z.object({
  position: z.number().int(),
  placeId: z.string(),
  name: z.string(),
  addressText: z.string().nullish(),
  status: placeStatusSchema,
})
export type CollectionItem = z.infer<typeof collectionItemSchema>

export const collectionItemsSchema = z.object({
  collectionId: z.string(),
  items: z.array(collectionItemSchema).default([]),
})

/**
 * `GET /cms/moderation` — four independent pending lists, straight from
 * `CmsOpsService#moderationQueue`. There is no severity, no place name and no
 * author on any of them, so the UI must not pretend otherwise: the queue is
 * deliberately PII-light and shows only what the decision needs.
 */
/**
 * The per-type moderation queues (GoGo-BE#219). `GET /cms/moderation` — four
 * unfiltered arrays sharing one `limit` and carrying no totals — is deprecated
 * upstream and no longer read here.
 *
 * Each queue is filtered, keyset-paged over `(createdAt, id)` and reports a
 * `totalCount` for the filter rather than for the page.
 */
export const reportStatusSchema = z.enum(['open', 'actioned', 'dismissed'])
export type ReportStatus = z.infer<typeof reportStatusSchema>

export const reportTargetTypeSchema = z.enum(['place', 'review', 'member'])
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>

export const cmsModerationReportSchema = z.object({
  id: z.string(),
  status: reportStatusSchema,
  targetType: reportTargetTypeSchema,
  targetId: z.string(),
  reasonCode: z.string(),
  note: z.string().nullish(),
  /**
   * Whether the report came from a signed-in user, a guest or neither. The
   * guest session id is an internal handle and is never returned — that a
   * guest reported is the whole of the fact a moderator needs.
   */
  reporterKind: z.enum(['user', 'guest', 'anonymous']),
  reporterUserId: z.string().nullish(),
  decidedByAdminId: z.string().nullish(),
  decisionReason: z.string().nullish(),
  decidedAt: z.string().nullish(),
  createdAt: z.string(),
})
export type CmsModerationReport = z.infer<typeof cmsModerationReportSchema>

export const checkinModerationStatusSchema = z.enum(['pending', 'approved', 'rejected'])
export type CheckinModerationStatus = z.infer<typeof checkinModerationStatusSchema>

export const cmsModerationCheckinSchema = z.object({
  id: z.string(),
  moderation: checkinModerationStatusSchema,
  rating: z.number().int().nullish(),
  note: z.string().nullish(),
  /** Stable `checkin_tag` taxonomy keys; labels resolve client-side. */
  tags: z.array(z.string()).default([]),
  photoCount: z.number().int().default(0),
  /** A bill total is present, which FR-PLAN-009 only allows with its photo. */
  hasBill: z.boolean().default(false),
  planStopId: z.string(),
  placeId: z.string().nullish(),
  placeName: z.string().nullish(),
  memberId: z.string(),
  createdAt: z.string(),
})
export type CmsModerationCheckin = z.infer<typeof cmsModerationCheckinSchema>

/**
 * The community queue lists PLACES in `community_submitted`, not submissions —
 * deciding one needs a submission id, which `GET /cms/place-submissions` hands
 * out (PI-CMS-007, `features/submissions`). This queue links there.
 */
export const cmsCommunityPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  addressText: z.string().nullish(),
  areaKey: z.string().nullish(),
  createdAt: z.string(),
})
export type CmsCommunityPlace = z.infer<typeof cmsCommunityPlaceSchema>

const pageMeta = {
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
}

export const cmsModerationReportPageSchema = z.object({
  items: z.array(cmsModerationReportSchema).default([]),
  ...pageMeta,
})
export type CmsModerationReportPage = z.infer<typeof cmsModerationReportPageSchema>

export const cmsModerationCheckinPageSchema = z.object({
  items: z.array(cmsModerationCheckinSchema).default([]),
  ...pageMeta,
})
export type CmsModerationCheckinPage = z.infer<typeof cmsModerationCheckinPageSchema>

/**
 * Recommendations (GoGo-BE#222).
 *
 * A recommendation is a **targeted collection** (BE ADR-0009): the same ordered
 * place list, schedule and status machine as a curated collection, plus who it
 * is for. It shares storage with collections rather than forking editorial
 * content, and `GET /cms/collections` returns only the untargeted ones — so
 * this is not a second content domain, it is the targeted half of the one
 * that already exists.
 */
export const recommendationStatusSchema = z.enum(['draft', 'scheduled', 'published', 'archived'])
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>

/** One vocabulary across content types. Stable key; the label resolves in i18n. */
export const contentAudienceSchema = z.enum(['couple', 'group', 'family', 'solo'])
export type ContentAudience = z.infer<typeof contentAudienceSchema>

export const cmsRecommendationTaxonomySchema = z.object({
  id: z.string(),
  kind: z.enum(['category', 'mood']),
  /** Stable taxonomy key, never a display label. */
  key: z.string(),
})

export const cmsRecommendationSchema = z.object({
  id: z.string(),
  /** The internal key. Unique per locale. */
  slug: z.string(),
  locale: z.string(),
  /** The editorial name — what an editor searches, never what a user reads. */
  internalName: z.string().nullish(),
  title: z.string(),
  subtitle: z.string().nullish(),
  description: z.string().nullish(),
  audience: contentAudienceSchema.nullish(),
  /** Same vocabulary as a place's `areaKey` — "city" is one concept. */
  areaKey: z.string().nullish(),
  /** Higher first, between recommendations competing for one surface. */
  priority: z.number().int(),
  status: recommendationStatusSchema,
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  placeCount: z.number().int(),
  taxonomies: z.array(cmsRecommendationTaxonomySchema).default([]),
  createdByAdminId: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsRecommendation = z.infer<typeof cmsRecommendationSchema>

export const cmsRecommendationPlaceSchema = z.object({
  position: z.number().int(),
  placeId: z.string(),
  name: z.string(),
  addressText: z.string().nullish(),
  /**
   * The place's catalog status, so a published recommendation quietly holding
   * a suspended place is visible rather than silently short.
   */
  status: z.string(),
})
export type CmsRecommendationPlace = z.infer<typeof cmsRecommendationPlaceSchema>

export const cmsRecommendationDetailSchema = cmsRecommendationSchema.extend({
  places: z.array(cmsRecommendationPlaceSchema).default([]),
})
export type CmsRecommendationDetail = z.infer<typeof cmsRecommendationDetailSchema>

/**
 * Plan templates (GoGo-BE#223).
 *
 * **Source material for future plans, not live ones.** Nothing in this resource
 * references a room, a plan or a plan stop, and editing a template never
 * reaches a plan somebody already has — a plan is a copy taken at the moment it
 * was made, not a live view of its template. The separation is in the schema,
 * so the console cannot break it by accident.
 */
export const planTemplateStatusSchema = z.enum(['draft', 'published', 'archived'])
export type PlanTemplateStatus = z.infer<typeof planTemplateStatusSchema>

/** What an amount is *per*. These are different numbers, so neither is implied. */
export const budgetScopeSchema = z.enum(['per_person', 'per_group'])
export type BudgetScope = z.infer<typeof budgetScopeSchema>

/**
 * Integer minor units with its currency and scope. Present as a whole or absent
 * as a whole — there is no half of this object, and no amount here whose scope
 * the client has to assume.
 */
export const budgetRangeSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
  currency: z.string(),
  scope: budgetScopeSchema,
})
export type BudgetRange = z.infer<typeof budgetRangeSchema>

export const cmsPlanTemplateStopSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  /** Taxonomy of kind `category` — what sort of stop this is. */
  categoryTaxonomyId: z.string().nullish(),
  /** Stable taxonomy key, never a label. */
  categoryKey: z.string(),
  preferredPlaceId: z.string().nullish(),
  preferredPlaceName: z.string().nullish(),
  /** A property of the stop, not a convention the reader infers. */
  isOptional: z.boolean().default(false),
  expectedDurationMinutes: z.number().int().nullish(),
  budget: budgetRangeSchema.nullish(),
  note: z.string().nullish(),
})
export type CmsPlanTemplateStop = z.infer<typeof cmsPlanTemplateStopSchema>

export const cmsPlanTemplateSchema = z.object({
  id: z.string(),
  /** The template key. Unique per locale. */
  slug: z.string(),
  locale: z.string(),
  internalName: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  audience: contentAudienceSchema.nullish(),
  areaKey: z.string().nullish(),
  budget: budgetRangeSchema.nullish(),
  expectedDurationMinutes: z.number().int().nullish(),
  status: planTemplateStatusSchema,
  stopCount: z.number().int(),
  /** Mood/setting keys for the template as a whole. */
  taxonomies: z.array(cmsRecommendationTaxonomySchema).default([]),
  createdByAdminId: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsPlanTemplate = z.infer<typeof cmsPlanTemplateSchema>

export const cmsPlanTemplateDetailSchema = cmsPlanTemplateSchema.extend({
  stops: z.array(cmsPlanTemplateStopSchema).default([]),
})
export type CmsPlanTemplateDetail = z.infer<typeof cmsPlanTemplateDetailSchema>

export const cmsPlanTemplatePageSchema = z.object({
  items: z.array(cmsPlanTemplateSchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type CmsPlanTemplatePage = z.infer<typeof cmsPlanTemplatePageSchema>

export const cmsRecommendationPageSchema = z.object({
  items: z.array(cmsRecommendationSchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type CmsRecommendationPage = z.infer<typeof cmsRecommendationPageSchema>

export const cmsCommunityPlacePageSchema = z.object({
  items: z.array(cmsCommunityPlaceSchema).default([]),
  ...pageMeta,
})
export type CmsCommunityPlacePage = z.infer<typeof cmsCommunityPlacePageSchema>

export type ModerationKind = 'review' | 'report' | 'checkin' | 'community'

/**
 * `GET /cms/moderation/reviews` (GoGo-BE#219) — the review queue with the
 * filters, keyset paging and totals the unified queue never had.
 *
 * `GET /cms/moderation` is deprecated in favour of this and its sibling
 * per-type queues; reports, check-ins and community places still read the old
 * one until they are migrated too.
 *
 * The author's display name is returned because moderating text means knowing
 * who wrote it. Email and phone are not part of that judgement and the server
 * never selects them — so there is nothing here to accidentally render.
 */
export const reviewModerationStatusSchema = z.enum([
  'pending',
  'published',
  'rejected',
  'removed',
  'hidden',
])
export type ReviewModerationStatus = z.infer<typeof reviewModerationStatusSchema>

export const cmsModerationReviewSchema = z.object({
  id: z.string(),
  status: reviewModerationStatusSchema,
  rating: z.number().int(),
  text: z.string().nullish(),
  placeId: z.string().nullish(),
  placeName: z.string().nullish(),
  planId: z.string().nullish(),
  authorUserId: z.string(),
  authorDisplayName: z.string().nullish(),
  /** Undecided reports pointing at this review. */
  openReportCount: z.number().int().default(0),
  moderatedByAdminId: z.string().nullish(),
  moderationReason: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsModerationReview = z.infer<typeof cmsModerationReviewSchema>

export const cmsModerationReviewPageSchema = z.object({
  items: z.array(cmsModerationReviewSchema).default([]),
  /** Keyset cursor over (createdAt, id); null only when there is no more. */
  nextCursor: z.string().nullable().default(null),
  /** Rows matching the filter — not rows in this page. */
  totalCount: z.number().int().default(0),
})
export type CmsModerationReviewPage = z.infer<typeof cmsModerationReviewPageSchema>

/** `GET /cms/moderation/counts` — the backlog behind the sidebar badge. */
export const cmsModerationCountsSchema = z.object({
  reviews: z.number().int().default(0),
  reports: z.number().int().default(0),
  checkins: z.number().int().default(0),
  communityPlaces: z.number().int().default(0),
  total: z.number().int().default(0),
})
export type CmsModerationCounts = z.infer<typeof cmsModerationCountsSchema>

export const rankingConfigKeySchema = z.enum(['suggestion.scoring', 'search.ranking'])
export type RankingConfigKey = z.infer<typeof rankingConfigKeySchema>

export const rankingConfigStatusSchema = z.enum(['draft', 'approved', 'active', 'rolled_back'])
export type RankingConfigStatus = z.infer<typeof rankingConfigStatusSchema>

/**
 * `GET /cms/ranking-configs` (GoGo-BE#160). Both names travel with the version
 * because four-eyes is only checkable if the console can show that the
 * approver and the drafter are different accounts.
 *
 * `bounds` are the engine's own limits, sent per config so a slider cannot
 * drift from what the server will accept.
 */
export const rankingBoundSchema = z.object({ min: z.number(), max: z.number() })
export type RankingBound = z.infer<typeof rankingBoundSchema>

export const rankingConfigSchema = z.object({
  id: z.string(),
  key: rankingConfigKeySchema,
  version: z.number().int(),
  status: rankingConfigStatusSchema,
  weights: z.record(z.number()).default({}),
  bounds: z.record(rankingBoundSchema).default({}),
  createdBy: adminRefSchema,
  approvedBy: adminRefSchema.nullish(),
  activatedAt: z.string().nullish(),
  createdAt: z.string(),
})
export type RankingConfig = z.infer<typeof rankingConfigSchema>
export const rankingConfigListSchema = z.array(rankingConfigSchema)

/**
 * `GET /cms/ranking-configs/{id}/evaluate` — replays a candidate against the
 * immutable snapshots stored with past suggestion runs. Nothing is written and
 * no user is exposed; runs where no candidate survives the hard filters are
 * reported in `skipped` rather than counted as agreement, which would flatter
 * every candidate config.
 */
export const rankingEvaluationSchema = z.object({
  configVersion: z.number().int(),
  baselineVersion: z.string(),
  runsEvaluated: z.number().int(),
  metrics: z.object({
    top1Agreement: z.number(),
    top5Overlap: z.number(),
    newZeroResults: z.number().int(),
    meanCandidateCount: z.number(),
  }),
  skipped: z.array(z.object({ runId: z.string(), reason: z.string() })).default([]),
})
export type RankingEvaluation = z.infer<typeof rankingEvaluationSchema>

/** `GET /cms/feature-flags` (GoGo-BE#160) — a kill switch nobody can read is not a kill switch. */
export const flagValueTypeSchema = z.enum(['boolean', 'string', 'number', 'json', 'version'])
export type FlagValueType = z.infer<typeof flagValueTypeSchema>

/** `all` is the unscoped row every resolution falls back to. */
export const flagEnvironmentSchema = z.enum(['all', 'dev', 'staging', 'production'])
export type FlagEnvironment = z.infer<typeof flagEnvironmentSchema>

export const flagPlatformSchema = z.enum(['all', 'ios', 'android', 'web'])
export type FlagPlatform = z.infer<typeof flagPlatformSchema>

/**
 * `GET /cms/feature-flags` — one entry per **stored override**, not per key.
 *
 * A key can have several: `(all, all)` is the unscoped row and a more specific
 * `(production, ios)` row wins over it for that scope. Keys with no row at all
 * are absent here — the catalog below is what says which keys exist.
 */
export const featureFlagSchema = z.object({
  key: z.string(),
  valueType: flagValueTypeSchema,
  environment: flagEnvironmentSchema,
  platform: flagPlatformSchema,
  /**
   * The value itself for a boolean flag; for any other type, whether this
   * override applies at all — switching it off returns the key to its default.
   */
  enabled: z.boolean(),
  /** Typed per `valueType`. For a boolean flag this equals `enabled`. */
  value: z.unknown().nullish(),
  /** Old name for `value`, same content. Still returned by the server. */
  payload: z.unknown().nullish(),
  description: z.string().nullish(),
  /** False when the key left the registry: a value nothing reads any more. */
  known: z.boolean().default(true),
  updatedBy: adminRefSchema.nullish(),
  updatedAt: z.string(),
})
export type FeatureFlag = z.infer<typeof featureFlagSchema>
export const featureFlagListSchema = z.array(featureFlagSchema)

/**
 * `GET /cms/feature-flags/catalog` — every key something in the backend
 * actually reads, with its declared type and its fallback.
 *
 * Without `defaultValue`, "not configured" and "configured to zero" look
 * identical on screen. That distinction is the whole reason this endpoint
 * exists, so the console reads it rather than inferring.
 */
export const featureFlagDefinitionSchema = z.object({
  key: z.string(),
  valueType: flagValueTypeSchema,
  /** What the backend uses when no override matches. Never null. */
  defaultValue: z.unknown(),
  description: z.string(),
  /** False means a per-platform override is refused, not stored and ignored. */
  platformScoped: z.boolean(),
})
export type FeatureFlagDefinition = z.infer<typeof featureFlagDefinitionSchema>
export const featureFlagCatalogSchema = z.array(featureFlagDefinitionSchema)

/**
 * `GET /cms/experiments` / `PUT /cms/experiments/{key}`.
 *
 * Variant names are ranking config versions and only an **approved** version is
 * honoured — an experiment must not become a way to put unreviewed weights in
 * front of users. Shares may sum to less than 1; the remainder is control.
 */
export const experimentSchema = z.object({
  key: z.string(),
  description: z.string().nullish(),
  enabled: z.boolean(),
  variants: z.record(z.number()).default({}),
  controlShare: z.number().default(1),
  updatedAt: z.string().nullish(),
})
export type Experiment = z.infer<typeof experimentSchema>
export const experimentListSchema = z.array(experimentSchema)

/**
 * `GET /cms/ops/kpis` — exactly what `CmsOpsService#kpis` returns. Six
 * aggregates over fixed windows, nothing more: no provider health, no time
 * series, no activity feed, no alert stream. The dashboard renders these and
 * says which window each covers rather than implying a trend it cannot see.
 */
export const opsKpisSchema = z.object({
  placeFreshness: z
    .object({
      fresh: z.number().int().default(0),
      stale: z.number().int().default(0),
      unknown: z.number().int().default(0),
    })
    .default({}),
  zeroResultsLast7d: z.number().int().default(0),
  suggestionRunsLast7d: z
    .object({
      succeeded: z.number().int().default(0),
      failed: z.number().int().default(0),
    })
    .default({}),
  currentPlansOverBudget: z.number().int().default(0),
  providerErrorsLast7d: z.number().int().default(0),
  moderationBacklog: z
    .object({
      reviews: z.number().int().default(0),
      reports: z.number().int().default(0),
    })
    .default({}),
})
export type OpsKpis = z.infer<typeof opsKpisSchema>

/**
 * `GET /cms/search-analytics` — built from a daily aggregate, never a
 * per-request log. A term is named only once at least 5 searches produced it;
 * below that floor the rows are still counted in `hiddenBelowFloor` but the
 * text is withheld, because a query one person typed is that person's query.
 */
export const searchAnalyticsSchema = z.object({
  days: z.number().int(),
  totals: z.object({
    searches: z.number().int(),
    zeroResults: z.number().int(),
    zeroResultRate: z.number(),
    avgResults: z.number(),
    avgLatencyMs: z.number().int(),
  }),
  trend: z
    .array(
      z.object({
        day: z.string(),
        searches: z.number().int(),
        zeroResults: z.number().int(),
        zeroResultRate: z.number(),
      }),
    )
    .default([]),
  worstQueries: z
    .array(
      z.object({
        query: z.string(),
        searches: z.number().int(),
        zeroResults: z.number().int(),
        zeroResultRate: z.number(),
      }),
    )
    .default([]),
  hiddenBelowFloor: z.object({
    terms: z.number().int(),
    searches: z.number().int(),
    zeroResults: z.number().int(),
  }),
})
export type SearchAnalytics = z.infer<typeof searchAnalyticsSchema>

/**
 * `GET /cms/audit` and `GET /cms/places/{id}/audit` (GoGo-BE#158).
 *
 * `ipAddress` is returned only to ops_admin and above — it is staff PII kept to
 * tell "that admin did it" apart from "that admin's account was taken over".
 * For every other role the field is absent, which is not missing data: the UI
 * must not render an empty cell where a role is simply not entitled to look.
 *
 * The log is immutable (FR-CMS-008): there is no write path here, by design.
 */
export const auditActorTypeSchema = z.enum(['admin', 'user', 'system'])
export const authorizationPathSchema = z.enum(['exact_role', 'rank_read', 'super_admin_bypass'])
export type AuthorizationPath = z.infer<typeof authorizationPathSchema>

export const auditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actorType: auditActorTypeSchema,
  actorId: z.string().nullish(),
  actorRole: adminRoleSchema.nullish(),
  resourceType: z.string(),
  resourceId: z.string(),
  occurredAt: z.string(),
  diff: z.unknown().nullish(),
  reason: z.string().nullish(),
  breakGlass: z.boolean().default(false),
  requestId: z.string().nullish(),
  ipAddress: z.string().nullish(),
  authorizationPath: authorizationPathSchema.nullish(),
})
export type AuditEntry = z.infer<typeof auditEntrySchema>

export const auditPageSchema = z.object({
  items: z.array(auditEntrySchema).default([]),
  nextCursor: z.string().nullable(),
})
export type AuditPage = z.infer<typeof auditPageSchema>

/**
 * PI-CMS-007 — `GET /cms/place-submissions`.
 *
 * The queue deliberately carries no submitter identity: deciding whether a
 * place belongs in the catalog does not need to know who proposed it, so the
 * server sends only `fromRegisteredUser`.
 */
export const placeSubmissionSchema = z.object({
  id: z.string(),
  googlePlaceId: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'merged']),
  /** Repeat proposals of the same place are one row; this is how many. */
  submissionCount: z.number(),
  categoryKey: z.string().nullish(),
  estimatedPrice: z.object({ min: z.number(), max: z.number(), unit: z.string() }).nullish(),
  vibeKeys: z.array(z.string()).default([]),
  note: z.string().nullish(),
  roomId: z.string().nullish(),
  resultPlaceId: z.string().nullish(),
  resultPlaceName: z.string().nullish(),
  fromRegisteredUser: z.boolean(),
  createdAt: z.string(),
  decidedAt: z.string().nullish(),
  decisionReason: z.string().nullish(),
})
export type PlaceSubmission = z.infer<typeof placeSubmissionSchema>

export const placeSubmissionListSchema = z.object({
  items: z.array(placeSubmissionSchema),
  nextCursor: z.string().nullable(),
})
export type PlaceSubmissionList = z.infer<typeof placeSubmissionListSchema>

/**
 * Trust & Safety rules (GoGo-BE#225).
 *
 * Rule **definitions**. Nothing evaluates them yet — the enforcement path is
 * separate work — but a rule here can suspend an account with no human in the
 * loop, which is why the resource is `ops_admin` in both directions and why
 * every decision it eventually causes carries `reasonCode`.
 *
 * `conditions` is a closed shape chosen by `ruleType`, never an expression
 * language. The per-type shapes live in `features/safety/conditions.ts`, which
 * mirrors the server's domain module; this schema keeps the field as an object
 * so an unknown key survives a round-trip to the editor instead of being
 * dropped on read.
 */
export const safetyRuleTypeSchema = z.enum([
  'spam',
  'abusive_content',
  'blocked_words',
  'review_abuse',
  'user_abuse',
  'repeated_reports',
  'rate_limit',
])
export type SafetyRuleType = z.infer<typeof safetyRuleTypeSchema>

export const safetyRuleTriggerSchema = z.enum([
  'review_created',
  'review_updated',
  'report_created',
  'checkin_created',
  'place_submitted',
  'user_registered',
])
export type SafetyRuleTrigger = z.infer<typeof safetyRuleTriggerSchema>

export const safetyRuleActionSchema = z.enum([
  'flag_for_review',
  'auto_hide',
  'require_moderation',
  'suspend_user',
  'block_action',
])
export type SafetyRuleAction = z.infer<typeof safetyRuleActionSchema>

export const safetyRuleSeveritySchema = z.enum(['low', 'medium', 'high', 'critical'])
export type SafetyRuleSeverity = z.infer<typeof safetyRuleSeveritySchema>

export const safetyRuleStatusSchema = z.enum(['draft', 'active', 'disabled'])
export type SafetyRuleStatus = z.infer<typeof safetyRuleStatusSchema>

export const cmsSafetyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  ruleType: safetyRuleTypeSchema,
  trigger: safetyRuleTriggerSchema,
  conditions: z.record(z.string(), z.unknown()).default({}),
  action: safetyRuleActionSchema,
  severity: safetyRuleSeveritySchema,
  status: safetyRuleStatusSchema,
  /** Lower runs first, so two rules matching one event resolve the same way. */
  priority: z.number().int(),
  /** Stamped on every decision this rule causes, so it can be traced back. */
  reasonCode: z.string(),
  createdBy: adminRefSchema.nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsSafetyRule = z.infer<typeof cmsSafetyRuleSchema>

export const cmsSafetyRulePageSchema = z.object({
  items: z.array(cmsSafetyRuleSchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type CmsSafetyRulePage = z.infer<typeof cmsSafetyRulePageSchema>

/**
 * CMS-scoped media upload (GoGo-BE#227).
 *
 * `POST /cms/uploads` authorizes a presigned PUT for a staff purpose. The
 * bytes go straight to storage and never cross the API, which is why the
 * server cannot report the image's pixel dimensions here — nothing has read
 * the object yet.
 */
export const cmsUploadPurposeSchema = z.enum(['banner_image', 'campaign_image'])
export type CmsUploadPurpose = z.infer<typeof cmsUploadPurposeSchema>

/** Exactly what the presigner will sign for. Anything else is refused. */
export const cmsUploadContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])
export type CmsUploadContentType = z.infer<typeof cmsUploadContentTypeSchema>

export const cmsUploadSchema = z.object({
  id: z.string(),
  /** Server-generated — actor plus a UUID, never anything the client supplied. */
  key: z.string(),
  /** Presigned PUT, signed for this key and this content type, and it expires. */
  uploadUrl: z.string(),
  expiresAt: z.string(),
  maxBytes: z.number().int(),
  contentType: z.string(),
  /**
   * Where the object will be readable once uploaded. Null until media hosting
   * is configured — an honest absence rather than a URL that would 404.
   */
  readUrl: z.string().nullable(),
})
export type CmsUpload = z.infer<typeof cmsUploadSchema>

/**
 * Banners (GoGo-BE#224).
 *
 * Two statuses on purpose. `lifecycleStatus` is what a person set;
 * `status` is what the banner is right now, with `expired` **computed by the
 * server** from the end time on every read rather than stored — a stored
 * expiry is wrong for as long as it takes something to notice, or forever if
 * nothing runs.
 */
export const bannerPlacementSchema = z.enum(['home_hero', 'home_secondary'])
export type BannerPlacement = z.infer<typeof bannerPlacementSchema>

/** The lifecycle a person controls. `expired` is not settable. */
export const bannerStatusSchema = z.enum(['draft', 'scheduled', 'published', 'archived'])
export type BannerStatus = z.infer<typeof bannerStatusSchema>

export const bannerEffectiveStatusSchema = z.enum([
  'draft',
  'scheduled',
  'published',
  'archived',
  'expired',
])
export type BannerEffectiveStatus = z.infer<typeof bannerEffectiveStatusSchema>

export const bannerDestinationSchema = z.enum([
  'none',
  'place',
  'recommendation',
  'plan_template',
  'campaign',
  'external_url',
])
export type BannerDestination = z.infer<typeof bannerDestinationSchema>

export const cmsBannerSchema = z.object({
  id: z.string(),
  /** The editorial name — what an editor searches, not what a user reads. */
  name: z.string(),
  imageKey: z.string(),
  /** Null until media hosting is configured, rather than a URL that would 404. */
  imageUrl: z.string().nullish(),
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  ctaLabel: z.string().nullish(),
  destinationType: bannerDestinationSchema,
  destinationValue: z.string().nullish(),
  audience: contentAudienceSchema.nullish(),
  placement: bannerPlacementSchema,
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  /** Higher first, between banners competing for one placement. */
  priority: z.number().int(),
  status: bannerEffectiveStatusSchema,
  lifecycleStatus: bannerStatusSchema,
  createdByAdminId: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsBanner = z.infer<typeof cmsBannerSchema>

export const cmsBannerPageSchema = z.object({
  items: z.array(cmsBannerSchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type CmsBannerPage = z.infer<typeof cmsBannerPageSchema>

/**
 * Notification campaigns (GoGo-BE#226).
 *
 * A campaign is composed here and **sent by the worker**, never from a
 * request. The API only ever writes a row; a scheduled row is what a worker
 * tick picks up, resolves an audience for, and hands to the push provider
 * adapter. There is deliberately no API path that reaches a provider, because
 * a campaign that has gone out cannot be recalled.
 */
export const campaignStatusSchema = z.enum([
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
  'failed',
])
export type CampaignStatus = z.infer<typeof campaignStatusSchema>

/**
 * Only what the backend can resolve from data it holds. `city`, `app_version`
 * and `custom_segment` from the mockup are absent on purpose: nothing stores a
 * user's city or their app version, and a campaign aimed at a segment the
 * server has to guess at reaches the wrong people — the one failure with no
 * undo.
 */
export const campaignAudienceSchema = z.enum(['all', 'couple', 'group', 'platform'])
export type CampaignAudience = z.infer<typeof campaignAudienceSchema>

/** `platform` is the only audience carrying a filter, and this is its shape. */
export const campaignPlatformSchema = z.enum(['ios', 'android', 'web'])
export type CampaignPlatform = z.infer<typeof campaignPlatformSchema>

/**
 * `plan_template` rather than `plan`: a campaign points every recipient at the
 * same thing, and a plan belongs to one room.
 */
export const campaignDestinationSchema = z.enum([
  'home',
  'place',
  'recommendation',
  'plan_template',
  'saved',
  'external_url',
])
export type CampaignDestination = z.infer<typeof campaignDestinationSchema>

export const cmsCampaignSchema = z.object({
  id: z.string(),
  /** The editorial name. `title` is what lands on a screen. */
  name: z.string(),
  title: z.string(),
  body: z.string(),
  imageKey: z.string().nullish(),
  ctaLabel: z.string().nullish(),
  audienceType: campaignAudienceSchema,
  audienceFilter: z.record(z.string(), z.unknown()).default({}),
  destinationType: campaignDestinationSchema,
  destinationValue: z.string().nullish(),
  status: campaignStatusSchema,
  scheduledAt: z.string().nullish(),
  startedAt: z.string().nullish(),
  completedAt: z.string().nullish(),
  /** Resolved at send time, not at schedule time. */
  recipientCount: z.number().int().nullish(),
  /**
   * How many the provider accepted. Not "seen", and not a guarantee of
   * delivery to a device.
   */
  sentCount: z.number().int(),
  failedCount: z.number().int(),
  lastError: z.string().nullish(),
  testSendRequestedAt: z.string().nullish(),
  testSendCompletedAt: z.string().nullish(),
  createdByAdminId: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsCampaign = z.infer<typeof cmsCampaignSchema>

export const cmsCampaignPageSchema = z.object({
  items: z.array(cmsCampaignSchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type CmsCampaignPage = z.infer<typeof cmsCampaignPageSchema>

/**
 * A read with no side effect. The number is a snapshot: the audience is
 * resolved again at send time by the same predicate, so it can move between
 * the estimate and the send. Counts only accounts with a registered device.
 */
export const cmsCampaignAudienceEstimateSchema = z.object({
  campaignId: z.string(),
  audienceType: campaignAudienceSchema,
  estimatedRecipients: z.number().int(),
  estimatedAt: z.string(),
})
export type CmsCampaignAudienceEstimate = z.infer<typeof cmsCampaignAudienceEstimateSchema>

export const cmsCampaignTestSendSchema = z.object({
  campaignId: z.string(),
  status: campaignStatusSchema,
  testSendQueued: z.boolean(),
})
export type CmsCampaignTestSend = z.infer<typeof cmsCampaignTestSendSchema>

/**
 * Ops observability (GoGo-BE#247).
 *
 * Three reads, each honest about what it does not know:
 * - health: `unknown` is a first-class answer — nothing measured, not healthy.
 * - queues: `failed24hTruncated` marks a floor, not a count.
 * - costs: `providers: []` with `sourcesConfigured: false` means "no source
 *   connected", never "nothing was spent" — the console must render those as
 *   different claims.
 */
export const serviceHealthStatusSchema = z.enum(['healthy', 'degraded', 'down', 'unknown'])
export type ServiceHealthStatus = z.infer<typeof serviceHealthStatusSchema>

export const cmsServiceHealthSchema = z.object({
  /** Open set: a provider appears once the circuit breaker has seen it. */
  key: z.string(),
  status: serviceHealthStatusSchema,
  /** Present only where the check actually timed something. */
  latencyMs: z.number().int().nullish(),
  checkedAt: z.string(),
  /** Why it is degraded or unknown, in words the console can show. */
  detail: z.string().nullish(),
})
export type CmsServiceHealth = z.infer<typeof cmsServiceHealthSchema>

export const cmsOpsHealthSchema = z.object({
  services: z.array(cmsServiceHealthSchema).default([]),
})
export type CmsOpsHealth = z.infer<typeof cmsOpsHealthSchema>

export const cmsQueueStatsSchema = z.object({
  name: z.string(),
  /** Where the numbers came from — BullMQ, or the Postgres outbox. */
  source: z.enum(['bullmq', 'database']),
  pending: z.number().int(),
  running: z.number().int(),
  failed24h: z.number().int(),
  /** True when the scan hit its cap: `failed24h` is a floor, not a count. */
  failed24hTruncated: z.boolean(),
  deadLetter: z.number().int(),
  oldestPendingSeconds: z.number().int().nullish(),
  workers: z.number().int().nullish(),
})
export type CmsQueueStats = z.infer<typeof cmsQueueStatsSchema>

export const cmsOpsQueuesSchema = z.object({
  queues: z.array(cmsQueueStatsSchema).default([]),
})
export type CmsOpsQueues = z.infer<typeof cmsOpsQueuesSchema>

export const cmsCostLineSchema = z.object({
  key: z.string(),
  /** Minor units (USD cents). */
  today: z.number().int(),
  monthToDate: z.number().int(),
  currency: z.string(),
  /** An estimate and an invoice are different claims about the same provider. */
  basis: z.enum(['billed', 'estimated']),
  /** 0–1, present only where the provider reports a quota. */
  quotaUsedRatio: z.number().nullish(),
  /**
   * GoGo-BE#335 — the exact figures behind the rounded cents, and the measured
   * quantity the money is derived from. Optional so a server that has not
   * shipped #335 still parses.
   */
  todayMicros: z.number().int().optional(),
  monthToDateMicros: z.number().int().optional(),
  billableUnitsToday: z.number().int().optional(),
  billableUnitsMonthToDate: z.number().int().optional(),
})
export type CmsCostLine = z.infer<typeof cmsCostLineSchema>

/**
 * GoGo-BE#335 — why a number is missing. Two absences, never merged.
 *
 * `not_instrumented` — nobody counted it, so there are no units to price. The
 * Maps SDK renders on the handset and the backend never sees a map load.
 * `price_unknown` — the units are exact and the list price is unverified;
 * Routes bills per matrix element.
 *
 * Both render as "chưa đo" on screen, but an operator chasing one does
 * something completely different from an operator chasing the other, so the
 * console shows which.
 */
export const opsCostGapSchema = z.object({
  key: z.string(),
  provider: z.string().nullable(),
  kind: z.enum(['not_instrumented', 'price_unknown']),
  detail: z.string(),
})
export type OpsCostGap = z.infer<typeof opsCostGapSchema>

/**
 * COST-CMS-010 (GoGo-BE#382) — manual / fixed cost items, `/cms/ops/costs/manual-items`.
 *
 * A fee somebody typed in: Apple Developer, a domain, a VPS, Play Console.
 * `amountMicros` is micros of `currency` **per period**, never a daily share
 * — the server spreads it into MANUAL rows up to today, so the Cost Center
 * sees it beside estimated and actual spend. Which services may carry one is
 * the registry's answer (`eligibleServices`), not a list in this client.
 */
export const manualCostPeriodSchema = z.enum(['ONE_TIME', 'MONTHLY', 'YEARLY'])
export type ManualCostPeriod = z.infer<typeof manualCostPeriodSchema>

export const cmsManualCostItemSchema = z.object({
  id: z.string(),
  environment: z.string(),
  providerId: z.string(),
  serviceId: z.string(),
  name: z.string(),
  amountMicros: z.number().int(),
  currency: z.string(),
  period: manualCostPeriodSchema,
  /** `YYYY-MM-DD`, inclusive. */
  effectiveFrom: z.string(),
  /** `YYYY-MM-DD`, inclusive; null = open-ended. Ignored for ONE_TIME. */
  effectiveTo: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string(),
})
export type CmsManualCostItem = z.infer<typeof cmsManualCostItemSchema>

export const cmsManualCostEligibleServiceSchema = z.object({
  providerId: z.string(),
  providerDisplayName: z.string(),
  serviceId: z.string(),
  displayName: z.string(),
})
export type CmsManualCostEligibleService = z.infer<typeof cmsManualCostEligibleServiceSchema>

export const cmsManualCostItemsSchema = z.object({
  items: z.array(cmsManualCostItemSchema),
  eligibleServices: z.array(cmsManualCostEligibleServiceSchema),
})
export type CmsManualCostItems = z.infer<typeof cmsManualCostItemsSchema>

export const cmsManualCostItemEnvelopeSchema = z.object({ item: cmsManualCostItemSchema })

/**
 * BE-CMS-P2 (GoGo-BE#315) — the monitoring view.
 *
 * The console reads these and never `/v1/metrics`, never Grafana. It holds no
 * metrics token, no Grafana credential, and sends no PromQL: `window` is an
 * enum and the server owns every query.
 *
 * Nullable is load-bearing throughout. A `null` here means *not measured*,
 * which is a different claim from a measured zero — rendering the second when
 * the first is true is the failure this whole screen is designed around.
 */
export const opsWindowSchema = z.enum(['1h', '24h', '7d', '30d'])
export type OpsWindow = z.infer<typeof opsWindowSchema>

export const opsPercentilesSchema = z.object({
  p50: z.number().nullable(),
  p95: z.number().nullable(),
  /** Null below the server's sample floor — too few observations to mean anything. */
  p99: z.number().nullable(),
})

export const opsEnvelopeSchema = z.object({
  window: opsWindowSchema,
  /** What the store could actually answer. Shorter than `window` when retention is. */
  effectiveWindow: z.string(),
  retentionDays: z.number().int(),
  truncated: z.boolean(),
  generatedAt: z.string(),
  stale: z.boolean().optional(),
  asOf: z.string().optional(),
  backend: z.object({
    status: z.enum(['ok', 'degraded', 'unavailable']),
    detail: z.string().optional(),
  }),
})

/**
 * GoGo-BE#335 gave this surface a price list, so `kind` can now be
 * `'estimated'` and the money fields carry numbers.
 *
 * Both kinds stay in the union: a console deployed ahead of the backend must
 * keep parsing `units_only`, and that tolerance is also the rollback path.
 * Everything money-shaped is optional for the same reason.
 *
 * `estimatedCost` is integer USD **minor units**, which is what `formatMoney`
 * takes. `null` is "chưa đo" and must never be rendered as `$0.00`.
 */
export const opsCostModelSchema = z.object({
  kind: z.enum(['units_only', 'estimated']),
  estimatedCost: z.number().nullable(),
  estimatedCostMicros: z.number().nullable().optional(),
  currency: z.string().nullable(),
  basis: z.string(),
  confidence: z.string().nullish(),
  pricingVersion: z.string().nullish(),
  /**
   * False on the windowed surface: a free cap is monthly and the window is
   * 1h–30d. Month-to-date spend with the cap applied lives on the dashboard's
   * cost card, from `/cms/ops/costs`.
   */
  freeCapApplied: z.boolean().optional(),
  /**
   * False when an operation in view has no verified price. The amount shown is
   * then a floor, not a total, and the screen has to say so — `unpricedOperations`
   * names them.
   */
  costComplete: z.boolean().optional(),
  unpricedOperations: z.array(z.string()).default([]),
  measurementGaps: z.array(opsCostGapSchema).default([]),
  note: z.string(),
})
export type OpsCostModel = z.infer<typeof opsCostModelSchema>

export const opsLatencySemanticsSchema = z.object({
  unit: z.literal('seconds'),
  source: z.string(),
  excludesHttpStatuses: z.array(z.string()),
  excludesReason: z.string(),
  p99MinSamples: z.number().int(),
})

export const opsSeriesSchema = z.array(z.object({ t: z.string(), v: z.number() })).default([])

export const opsTrendsSchema = z.object({
  stepSeconds: z.number().int(),
  series: z.object({
    requests: opsSeriesSchema,
    failures: opsSeriesSchema,
    latencyP95: opsSeriesSchema,
    costUnits: opsSeriesSchema,
  }),
})

export const opsTotalsSchema = z.object({
  providerRequests: z.number(),
  providerSuccesses: z.number(),
  providerFailures: z.number(),
  providerRejected: z.number(),
  providerSuccessRate: z.number().nullable(),
  providerFailureRate: z.number().nullable(),
  providerRejectedRate: z.number().nullable(),
  latency: opsPercentilesSchema,
  rejectedLatency: z.object({ p50: z.number().nullable(), p95: z.number().nullable() }),
  billableUnits: z.number(),
  estimatedCost: z.number().nullable().optional(),
  estimatedCostMicros: z.number().nullable().optional(),
  costComplete: z.boolean().optional(),
  unpricedOperations: z.array(z.string()).default([]),
})

export const opsProviderSchema = z.object({
  /**
   * `maps_sdk` (GoGo-BE#335) always arrives with `instrumented: false` — the
   * SDK renders on the handset and the backend sees no map load. It is a row
   * rather than an omission so the table can name it: an absent row and a zero
   * row read the same to anyone who is not holding the spec.
   */
  provider: z.enum(['places', 'routes', 'sheets', 'maps_sdk']),
  /** False = no metric exists for it. Render "chưa đo", never "0 lượt gọi". */
  instrumented: z.boolean(),
  calls: z.number(),
  successes: z.number(),
  failures: z.number(),
  rejected: z.number(),
  successRate: z.number().nullable(),
  latency: opsPercentilesSchema,
  /** Null where the provider has no SKU counter — Sheets is quota-limited. */
  billableUnits: z.number().nullable(),
  /** USD minor units at list price. Null = no verified price here, not free. */
  estimatedCost: z.number().nullable().optional(),
  estimatedCostMicros: z.number().nullable().optional(),
  costComplete: z.boolean().optional(),
  unpricedOperations: z.array(z.string()).default([]),
})
export type OpsProviderRow = z.infer<typeof opsProviderSchema>

export const opsOperationSchema = opsProviderSchema
  .omit({ provider: true, instrumented: true })
  .extend({ method: z.string(), googleSku: z.string().nullish() })
export type OpsOperationRow = z.infer<typeof opsOperationSchema>

export const opsSummarySchema = opsEnvelopeSchema.extend({
  totals: opsTotalsSchema.nullable(),
  trends: opsTrendsSchema.nullable(),
  costModel: opsCostModelSchema,
  latencySemantics: opsLatencySemanticsSchema,
})
export type OpsSummary = z.infer<typeof opsSummarySchema>

export const opsProvidersSchema = opsEnvelopeSchema.extend({
  providers: z.array(opsProviderSchema).default([]),
  costModel: opsCostModelSchema,
  latencySemantics: opsLatencySemanticsSchema,
})
export type OpsProviders = z.infer<typeof opsProvidersSchema>

export const opsProviderDetailSchema = opsEnvelopeSchema.extend({
  provider: opsProviderSchema
    .extend({ operations: z.array(opsOperationSchema).default([]) })
    .nullable(),
  trends: opsTrendsSchema.nullable(),
  costModel: opsCostModelSchema,
  latencySemantics: opsLatencySemanticsSchema,
})
export type OpsProviderDetail = z.infer<typeof opsProviderDetailSchema>

export const cmsOpsCostsSchema = z.object({
  providers: z.array(cmsCostLineSchema).default([]),
  /**
   * False = no durable cost source connected. An empty list must not render as
   * zero.
   *
   * True since GoGo-BE#335, where a per-day ledger replaced the in-process
   * counter — so an empty amount from a connected source **is** a measured
   * zero, and is allowed to render as one. What is genuinely unknown moved to
   * `gaps` rather than disappearing.
   */
  sourcesConfigured: z.boolean(),
  currency: z.string().optional(),
  pricingVersion: z.string().optional(),
  basis: z.string().optional(),
  confidence: z.string().optional(),
  /** Newest ledger write — how fresh these numbers are. */
  asOf: z.string().nullish(),
  gaps: z.array(opsCostGapSchema).default([]),
})
export type CmsOpsCosts = z.infer<typeof cmsOpsCostsSchema>

/**
 * App-user management (GoGo-BE#246 §1–§4).
 *
 * Minimum PII by construction: no coordinates, no device tokens, no raw
 * preference selections. A field that is not returned cannot leak from a
 * console session — so these schemas do not model one.
 */
export const appUserStatusSchema = z.enum(['active', 'suspended', 'banned', 'deleted'])
export type AppUserStatus = z.infer<typeof appUserStatusSchema>

export const cmsAppUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  /** Null on a deleted account — the address is freed for re-registration. */
  email: z.string().nullable(),
  status: appUserStatusSchema,
  /**
   * One real value today (`password`); reported rather than assumed, and
   * deliberately unfiltered — a control that can only return everything is
   * not a control.
   */
  authMethod: z.enum(['password', 'none']),
  locale: z.string(),
  createdAt: z.string(),
  /** Newest session use. Null for an account that never signed in. */
  lastActiveAt: z.string().nullish(),
  counters: z.object({
    roomsCreated: z.number().int(),
    roomsJoined: z.number().int(),
    reviews: z.number().int(),
    savedPlaces: z.number().int(),
  }),
  /** Reports filed against this person, open or decided. */
  reportCount: z.number().int(),
})
export type CmsAppUser = z.infer<typeof cmsAppUserSchema>

export const cmsAppUserPageSchema = z.object({
  items: z.array(cmsAppUserSchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type CmsAppUserPage = z.infer<typeof cmsAppUserPageSchema>

export const cmsAppUserRoomSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  decisionMode: z.string(),
  participantCount: z.number().int(),
  title: z.string().nullish(),
  role: z.string(),
  joinedAt: z.string(),
  createdAt: z.string(),
})
export type CmsAppUserRoom = z.infer<typeof cmsAppUserRoomSchema>

export const cmsAppUserDetailSchema = cmsAppUserSchema.extend({
  /**
   * From the audit log, not a column — the reason is already written there
   * with who set it and when. Absent while the account is active.
   */
  statusReason: z.string().nullish(),
  statusChangedAt: z.string().nullish(),
  /** The 20 most recently joined. No invite code. */
  rooms: z.array(cmsAppUserRoomSchema).default([]),
  /**
   * #255. A direct delete outside the privacy workflow never touches the
   * ledger — so the console warns before an operator takes that path.
   */
  openPrivacyRequestCount: z.number().int().default(0),
})
export type CmsAppUserDetail = z.infer<typeof cmsAppUserDetailSchema>

export const cmsUserStatusResultSchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'suspended', 'banned']),
})
export type CmsUserStatusResult = z.infer<typeof cmsUserStatusResultSchema>

/**
 * Ops read of rooms. `code` is never returned — it is a bearer secret, and an
 * operations list is exactly the kind of place such a value gets copied out
 * of. The host is an id, not a name: identity lives on the access-controlled
 * account detail.
 */
export const cmsRoomSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  decisionMode: z.string(),
  participantCount: z.number().int(),
  title: z.string().nullish(),
  hostUserId: z.string(),
  memberCount: z.number().int(),
  planCount: z.number().int(),
  createdAt: z.string(),
})
export type CmsRoomSummary = z.infer<typeof cmsRoomSummarySchema>

export const cmsRoomPageSchema = z.object({
  items: z.array(cmsRoomSummarySchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type CmsRoomPage = z.infer<typeof cmsRoomPageSchema>

export const cmsPlanSummarySchema = z.object({
  id: z.string(),
  roomId: z.string(),
  version: z.number().int(),
  status: z.string(),
  isStale: z.boolean(),
  stopCount: z.number().int(),
  createdAt: z.string(),
})
export type CmsPlanSummary = z.infer<typeof cmsPlanSummarySchema>

export const cmsPlanPageSchema = z.object({
  items: z.array(cmsPlanSummarySchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type CmsPlanPage = z.infer<typeof cmsPlanPageSchema>

/**
 * Guests of one room (GoGo-BE#257, G11).
 *
 * Room-scoped on purpose — there is no global guest directory: no moderation
 * case needs one, and a list of every guest's name and activity would be a
 * new PII surface with no reader. The bearer credential never appears.
 */
export const cmsRoomGuestSchema = z.object({
  memberId: z.string(),
  guestSessionId: z.string(),
  displayName: z.string(),
  selectionStatus: z.string(),
  joinedAt: z.string(),
  sessionExpiresAt: z.string(),
  sessionRevokedAt: z.string().nullish(),
  removedAt: z.string().nullish(),
  /** The session was claimed by a registered account. */
  claimed: z.boolean(),
})
export type CmsRoomGuest = z.infer<typeof cmsRoomGuestSchema>

export const cmsRoomGuestsSchema = z.object({
  guests: z.array(cmsRoomGuestSchema).default([]),
})
export type CmsRoomGuests = z.infer<typeof cmsRoomGuestsSchema>

/**
 * Privacy-request ledger (GoGo-BE#255 / ADR-0011).
 *
 * The ledger, not the audit log: the audit log says who did what, this says
 * what was received, where it stands, what the deadline is and how it ended.
 * `sla` is computed server-side from the stored dates — the console renders
 * it, never recomputes the rule.
 */
export const privacyRequestTypeSchema = z.enum(['export', 'delete', 'correction'])
export type PrivacyRequestType = z.infer<typeof privacyRequestTypeSchema>

export const privacyRequestStatusSchema = z.enum(['open', 'acknowledged', 'in_progress', 'closed'])
export type PrivacyRequestStatus = z.infer<typeof privacyRequestStatusSchema>

/** Separate from `status` on purpose: "how it ended" is not "where it is". */
export const privacyRequestOutcomeSchema = z.enum([
  'completed',
  'no_account_found',
  'identity_not_verified',
  'rejected',
  'failed',
])
export type PrivacyRequestOutcome = z.infer<typeof privacyRequestOutcomeSchema>

export const privacySlaSchema = z.enum(['ON_TRACK', 'DUE_SOON', 'OVERDUE', 'COMPLETED'])
export type PrivacySla = z.infer<typeof privacySlaSchema>

export const privacyDeliveryMethodSchema = z.enum(['in_app', 'secure_download', 'other'])
export type PrivacyDeliveryMethod = z.infer<typeof privacyDeliveryMethodSchema>

export const privacyRequestSchema = z.object({
  id: z.string(),
  type: privacyRequestTypeSchema,
  source: z.enum(['self_service', 'support', 'cms']),
  status: privacyRequestStatusSchema,
  outcome: privacyRequestOutcomeSchema.nullish(),
  /** Structured — never one free-text field that becomes a PII dumping ground. */
  subject: z.object({
    subjectType: z.enum(['user', 'email', 'external']),
    userId: z.string().nullish(),
    contactEmail: z.string().nullish(),
    externalReference: z.string().nullish(),
    identityStatus: z.enum(['matched', 'no_account_found', 'unverified']),
  }),
  receivedAt: z.string(),
  ackDueAt: z.string(),
  acknowledgedAt: z.string().nullish(),
  fulfillmentDueAt: z.string(),
  extendedDueAt: z.string().nullish(),
  extensionReason: z.string().nullish(),
  executedAt: z.string().nullish(),
  completedAt: z.string().nullish(),
  closedAt: z.string().nullish(),
  deliveryMethod: privacyDeliveryMethodSchema.nullish(),
  deliveredAt: z.string().nullish(),
  /** Stamped at closure; the retention job deletes the row then, unless held. */
  retentionAt: z.string().nullish(),
  retentionHold: z
    .object({
      heldAt: z.string(),
      heldBy: z.string(),
      reason: z.string(),
      legalBasis: z.string(),
      reviewAt: z.string(),
      holdUntil: z.string().nullish(),
      /** Nothing auto-releases and nothing auto-deletes — a person must look. */
      reviewOverdue: z.boolean(),
    })
    .nullish(),
  reasonCode: z.string().nullish(),
  ticketReference: z.string().nullish(),
  operatorNote: z.string().nullish(),
  sla: privacySlaSchema,
})
export type PrivacyRequest = z.infer<typeof privacyRequestSchema>

export const privacyRequestPageSchema = z.object({
  items: z.array(privacyRequestSchema).default([]),
  nextCursor: z.string().nullable().default(null),
  totalCount: z.number().int().default(0),
})
export type PrivacyRequestPage = z.infer<typeof privacyRequestPageSchema>

export const privacyExecuteResultSchema = z.object({
  request: privacyRequestSchema,
  /** Present for an export — the same payload `/me/export` returns. */
  data: z.record(z.string(), z.unknown()).nullish(),
})
export type PrivacyExecuteResult = z.infer<typeof privacyExecuteResultSchema>
