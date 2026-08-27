import { z } from 'zod'

/*
 * Boundary schemas for the `/v1/cms/*` surface.
 *
 * Request bodies follow `openapi/gogo.v1.yaml` exactly (see each feature's
 * api.ts). Responses are validated here because the CMS half of the spec
 * documents most GETs with a prose description and no schema — see
 * `docs/adr/0002-boundary-validation.md`.
 *
 * Every shape below was read off GoGo-BE's controllers and services rather
 * than assumed, so several are leaner and less tidy than a DTO would be:
 * `/cms/places/stale` and `/cms/places/duplicates` return bare arrays of raw
 * snake_case SQL rows. The feature `api.ts` normalizes those into the camelCase
 * the UI uses, so the awkwardness stops at the boundary.
 *
 * Optional fields are `nullish()` so a backend that omits one degrades a cell
 * to "—" instead of blanking the screen.
 */

export const adminRoleSchema = z.enum(['editor', 'moderator', 'ops_admin', 'super_admin'])
export type AdminRole = z.infer<typeof adminRoleSchema>

export const placeStatusSchema = z.enum([
  'draft',
  'community_submitted',
  'review',
  'published',
  'suspended',
  'archived',
])
export type PlaceStatus = z.infer<typeof placeStatusSchema>

export const priceUnitSchema = z.enum(['per_person', 'per_item', 'per_hour', 'per_night'])
export type PriceUnit = z.infer<typeof priceUnitSchema>

/** Ratings are stored and shown separately — never merged into one number. */
export const placeRatingsSchema = z.object({
  googleRating: z.number().nullish(),
  googleRatingCount: z.number().int().nullish(),
  gogoRating: z.number().nullish(),
  gogoRatingCount: z.number().int().nullish(),
  compositeScore: z.number().nullish(),
})

export const placePriceSchema = z.object({
  id: z.string().nullish(),
  priceMin: z.number().int(),
  priceMax: z.number().int(),
  currency: z.string().default('VND'),
  unit: priceUnitSchema.default('per_person'),
  observedAt: z.string().nullish(),
  observedBy: z.string().nullish(),
})
export type PlacePrice = z.infer<typeof placePriceSchema>

export const placeHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openMinute: z.number().int().min(0).max(1439),
  closeMinute: z.number().int().min(0).max(1439),
  isOvernight: z.boolean().default(false),
})
export type PlaceHour = z.infer<typeof placeHourSchema>

export const placeSourceSchema = z.object({
  kind: z.string(),
  label: z.string().nullish(),
  url: z.string().nullish(),
  fetchedAt: z.string().nullish(),
  attribution: z.string().nullish(),
})

export const placeMediaSchema = z.object({
  id: z.string(),
  url: z.string(),
  source: z.string().nullish(),
  attribution: z.string().nullish(),
})

/**
 * `CmsPlaceListItem` in the spec — the only CMS response with a real schema
 * today (GoGo-BE#141). Deliberately lean: the list is a keyset-paged index,
 * not a projection of the whole place. Anything richer belongs on a detail
 * endpoint, which does not exist yet.
 */
export const cmsPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: placeStatusSchema,
  areaKey: z.string().nullish(),
  /** One blended figure on the list; the detail view keeps the sources apart. */
  rating: z.number().nullish(),
  confidence: z.number(),
  freshnessCheckedAt: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CmsPlace = z.infer<typeof cmsPlaceSchema>

/**
 * ⚠ Aspirational. `GET /cms/places/{id}` does not exist in GoGo-BE yet — only
 * `PATCH` does — so this shape is what the editor screen needs, agreed with
 * nobody. It is served by MSW today and tracked in the README; do not treat it
 * as contract until the endpoint lands.
 */
export const cmsPlaceDetailSchema = cmsPlaceSchema.extend({
  description: z.string().nullish(),
  addressText: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  avgVisitMinutes: z.number().int().nullish(),
  isLodging: z.boolean().nullish(),
  curatedRank: z.number().int().nullish(),
  taxonomyKeys: z.array(z.string()).default([]),
  taxonomyIds: z.array(z.string()).default([]),
  ratings: placeRatingsSchema.default({}),
  sourceCount: z.number().int().default(0),
  updatedBy: z.string().nullish(),
  hours: z.array(placeHourSchema).default([]),
  prices: z.array(placePriceSchema).default([]),
  sources: z.array(placeSourceSchema).default([]),
  media: z.array(placeMediaSchema).default([]),
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
])
export type TaxonomyKind = z.infer<typeof taxonomyKindSchema>

export const taxonomySynonymSchema = z.object({
  id: z.string().nullish(),
  term: z.string(),
  locale: z.string().default('vi'),
})

/**
 * ⚠ Aspirational. There is no `GET /cms/taxonomies` — only the write side
 * exists. The public `GET /taxonomies` is not a substitute: the CMS needs
 * deactivated keys and usage counts, and that endpoint returns neither.
 * Served by MSW today; tracked in the README.
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
export const taxonomyListSchema = z.object({ items: z.array(taxonomySchema).default([]) })

export const collectionStatusSchema = z.enum(['draft', 'scheduled', 'published', 'archived'])
export type CollectionStatus = z.infer<typeof collectionStatusSchema>

/**
 * `GET /cms/collections` returns a bare array of headers — `CmsContentService`
 * selects the collection row and nothing else. The ordered place list is
 * writable (`PUT .../items`) but **not readable**: there is no endpoint that
 * returns the current items, so the editor can replace the list without being
 * able to see it. Tracked in the README; the screen says so rather than
 * showing an empty list as if it were the truth.
 */
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
 * `GET /cms/moderation` — four independent pending lists, straight from
 * `CmsOpsService#moderationQueue`. There is no severity, no place name and no
 * author on any of them, so the UI must not pretend otherwise: the queue is
 * deliberately PII-light and shows only what the decision needs.
 */
export const moderationReviewSchema = z.object({
  id: z.string(),
  rating: z.number().nullish(),
  text: z.string().nullish(),
  createdAt: z.string(),
})
export type ModerationReview = z.infer<typeof moderationReviewSchema>

export const moderationReportSchema = z.object({
  id: z.string(),
  targetType: z.string(),
  targetId: z.string().nullish(),
  reasonCode: z.string().nullish(),
})
export type ModerationReport = z.infer<typeof moderationReportSchema>

export const moderationCheckinSchema = z.object({
  id: z.string(),
  rating: z.number().nullish(),
  note: z.string().nullish(),
  photoCount: z.number().int().default(0),
  hasBill: z.boolean().default(false),
})
export type ModerationCheckin = z.infer<typeof moderationCheckinSchema>

/**
 * The community tab lists PLACES in `community_submitted`, not submissions.
 * `POST /cms/place-submissions/{id}/decide` wants a submission id, and no CMS
 * endpoint hands one out — so this tab can show the backlog but cannot act on
 * it yet. Tracked in the README.
 */
export const moderationCommunityPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
})
export type ModerationCommunityPlace = z.infer<typeof moderationCommunityPlaceSchema>

export const moderationQueueSchema = z.object({
  reviews: z.array(moderationReviewSchema).default([]),
  reports: z.array(moderationReportSchema).default([]),
  checkins: z.array(moderationCheckinSchema).default([]),
  communityPlaces: z.array(moderationCommunityPlaceSchema).default([]),
})
export type ModerationQueue = z.infer<typeof moderationQueueSchema>

export type ModerationKind = 'review' | 'report' | 'checkin' | 'community'

export const rankingConfigStatusSchema = z.enum(['draft', 'approved', 'active', 'superseded'])

/** ⚠ Aspirational — `GET /cms/ranking-configs` does not exist (write only). */
export const rankingConfigSchema = z.object({
  id: z.string(),
  key: z.enum(['suggestion.scoring', 'search.ranking']),
  version: z.number().int(),
  status: rankingConfigStatusSchema,
  weights: z.record(z.number()).default({}),
  createdBy: z.string().nullish(),
  createdAt: z.string().nullish(),
  approvedBy: z.string().nullish(),
  approvedAt: z.string().nullish(),
  activatedAt: z.string().nullish(),
})
export type RankingConfig = z.infer<typeof rankingConfigSchema>

export const rankingBoundSchema = z.object({
  weight: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().default(0.01),
  labelKey: z.string().nullish(),
})

export const rankingConfigListSchema = z.object({
  items: z.array(rankingConfigSchema).default([]),
  bounds: z.array(rankingBoundSchema).default([]),
})

/** ⚠ Aspirational — `GET /cms/feature-flags` does not exist (write only). */
export const featureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  description: z.string().nullish(),
  rolloutPercent: z.number().nullish(),
  isKillSwitch: z.boolean().default(false),
  updatedBy: z.string().nullish(),
  updatedAt: z.string().nullish(),
})
export type FeatureFlag = z.infer<typeof featureFlagSchema>
export const featureFlagListSchema = z.object({ items: z.array(featureFlagSchema).default([]) })

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

/** ⚠ Aspirational — no audit read endpoint exists yet (GoGo-BE#148 writes them). */
export const auditEntrySchema = z.object({
  id: z.string(),
  actor: z.string(),
  action: z.string(),
  at: z.string(),
  before: z.record(z.unknown()).nullish(),
  after: z.record(z.unknown()).nullish(),
})
export type AuditEntry = z.infer<typeof auditEntrySchema>
export const auditListSchema = z.object({ items: z.array(auditEntrySchema).default([]) })

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
