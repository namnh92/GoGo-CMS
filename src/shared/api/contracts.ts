import { z } from 'zod'

/*
 * Boundary schemas for the `/v1/cms/*` surface.
 *
 * Request bodies follow `openapi/gogo.v1.yaml` exactly (see each feature's
 * api.ts). Responses are validated here because the CMS half of the spec
 * documents most GETs with a prose description and no schema — see
 * `docs/adr/0002-boundary-validation.md`. Everything optional is `nullish()`
 * so a backend that omits a field degrades a cell to "—" instead of blanking
 * the screen.
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

export const cmsPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  addressText: z.string().nullish(),
  areaKey: z.string().nullish(),
  status: placeStatusSchema,
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  avgVisitMinutes: z.number().int().nullish(),
  isLodging: z.boolean().nullish(),
  curatedRank: z.number().int().nullish(),
  taxonomyKeys: z.array(z.string()).default([]),
  taxonomyIds: z.array(z.string()).default([]),
  ratings: placeRatingsSchema.default({}),
  priceRange: z
    .object({
      min: z.number().int().nullish(),
      max: z.number().int().nullish(),
      currency: z.string().default('VND'),
    })
    .nullish(),
  freshnessVerifiedAt: z.string().nullish(),
  confidence: z.number().nullish(),
  sourceCount: z.number().int().default(0),
  coverUrl: z.string().nullish(),
  updatedAt: z.string().nullish(),
  updatedBy: z.string().nullish(),
})
export type CmsPlace = z.infer<typeof cmsPlaceSchema>

export const cmsPlaceDetailSchema = cmsPlaceSchema.extend({
  hours: z.array(placeHourSchema).default([]),
  prices: z.array(placePriceSchema).default([]),
  sources: z.array(placeSourceSchema).default([]),
  media: z.array(placeMediaSchema).default([]),
})
export type CmsPlaceDetail = z.infer<typeof cmsPlaceDetailSchema>

export const placeListSchema = z.object({
  items: z.array(cmsPlaceSchema).default([]),
  total: z.number().int().nullish(),
  nextCursor: z.string().nullish(),
})

export const stalePlaceSchema = cmsPlaceSchema.extend({
  staleDays: z.number().int().nullish(),
})
export const staleListSchema = z.object({ items: z.array(stalePlaceSchema).default([]) })

export const duplicatePairSchema = z.object({
  canonical: cmsPlaceSchema,
  duplicate: cmsPlaceSchema,
  similarity: z.number(),
  distanceMeters: z.number().nullish(),
  sharedProviderId: z.boolean().default(false),
  /** What a merge would move over — the confirmation must show this. */
  moves: z
    .object({
      sources: z.number().int().default(0),
      media: z.number().int().default(0),
      prices: z.number().int().default(0),
      reviews: z.number().int().default(0),
      seeds: z.number().int().default(0),
    })
    .default({}),
})
export type DuplicatePair = z.infer<typeof duplicatePairSchema>
export const duplicateListSchema = z.object({ items: z.array(duplicatePairSchema).default([]) })

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

export const collectionItemSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  addressText: z.string().nullish(),
  coverUrl: z.string().nullish(),
  note: z.string().nullish(),
})

export const collectionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  locale: z.string().default('vi'),
  title: z.string(),
  description: z.string().nullish(),
  status: collectionStatusSchema,
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  coverUrl: z.string().nullish(),
  items: z.array(collectionItemSchema).default([]),
  updatedAt: z.string().nullish(),
  updatedBy: z.string().nullish(),
})
export type Collection = z.infer<typeof collectionSchema>
export const collectionListSchema = z.object({ items: z.array(collectionSchema).default([]) })

export const moderationSeveritySchema = z.enum(['high', 'medium', 'low'])

const moderationBase = {
  id: z.string(),
  createdAt: z.string().nullish(),
  severity: moderationSeveritySchema.default('low'),
  reason: z.string().nullish(),
  placeId: z.string().nullish(),
  placeName: z.string().nullish(),
  /** Pseudonymous handle — the queue never needs an email or a phone number. */
  authorLabel: z.string().nullish(),
}

export const moderationReviewSchema = z.object({
  ...moderationBase,
  kind: z.literal('review').default('review'),
  rating: z.number().nullish(),
  body: z.string().default(''),
})

export const moderationReportSchema = z.object({
  ...moderationBase,
  kind: z.literal('report').default('report'),
  targetType: z.string().nullish(),
  body: z.string().default(''),
})

export const moderationCheckinSchema = z.object({
  ...moderationBase,
  kind: z.literal('checkin').default('checkin'),
  photoCount: z.number().int().default(0),
  body: z.string().default(''),
})

export const moderationSubmissionSchema = z.object({
  ...moderationBase,
  kind: z.literal('submission').default('submission'),
  body: z.string().default(''),
  submissionCount: z.number().int().default(1),
  googlePlaceId: z.string().nullish(),
  providerSnapshot: z
    .object({
      name: z.string().nullish(),
      address: z.string().nullish(),
      rating: z.number().nullish(),
      ratingCount: z.number().int().nullish(),
      photoUrl: z.string().nullish(),
      fetchedAt: z.string().nullish(),
      attributions: z.array(z.string()).default([]),
    })
    .nullish(),
  matchedPlaceId: z.string().nullish(),
})

export type ModerationReview = z.infer<typeof moderationReviewSchema>
export type ModerationReport = z.infer<typeof moderationReportSchema>
export type ModerationCheckin = z.infer<typeof moderationCheckinSchema>
export type ModerationSubmission = z.infer<typeof moderationSubmissionSchema>
export type ModerationItem =
  ModerationReview | ModerationReport | ModerationCheckin | ModerationSubmission

export const moderationQueueSchema = z.object({
  reviews: z.array(moderationReviewSchema).default([]),
  reports: z.array(moderationReportSchema).default([]),
  checkins: z.array(moderationCheckinSchema).default([]),
  submissions: z.array(moderationSubmissionSchema).default([]),
  stats: z
    .object({
      pending: z.number().int().default(0),
      resolvedToday: z.number().int().default(0),
      avgResponseMinutes: z.number().nullish(),
    })
    .default({}),
})
export type ModerationQueue = z.infer<typeof moderationQueueSchema>

export const rankingConfigStatusSchema = z.enum(['draft', 'approved', 'active', 'superseded'])

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

export const providerHealthSchema = z.object({
  name: z.string(),
  status: z.enum(['healthy', 'degraded', 'down']),
  uptime: z.number().nullish(),
  latencyMs: z.number().nullish(),
  errorRate: z.number().nullish(),
  circuitBreaker: z.enum(['closed', 'open', 'half_open']).default('closed'),
})

export const opsKpisSchema = z.object({
  places: z
    .object({
      total: z.number().int().default(0),
      published: z.number().int().default(0),
      draft: z.number().int().default(0),
      suspended: z.number().int().default(0),
    })
    .default({}),
  freshnessScore: z.number().nullish(),
  freshnessDelta: z.number().nullish(),
  zeroResultRate: z.number().nullish(),
  zeroResultDelta: z.number().nullish(),
  suggestionSuccessRate: z.number().nullish(),
  suggestionSuccessDelta: z.number().nullish(),
  budgetViolationRate: z.number().nullish(),
  providers: z.array(providerHealthSchema).default([]),
  series: z
    .array(
      z.object({
        date: z.string(),
        zeroResultRate: z.number().nullish(),
        suggestionSuccessRate: z.number().nullish(),
      }),
    )
    .default([]),
  activity: z
    .array(
      z.object({
        id: z.string(),
        actor: z.string(),
        action: z.string(),
        resourceLabel: z.string().nullish(),
        resourceHref: z.string().nullish(),
        at: z.string(),
      }),
    )
    .default([]),
  alerts: z
    .array(
      z.object({
        id: z.string(),
        level: z.enum(['critical', 'warning']),
        title: z.string(),
        detail: z.string().nullish(),
      }),
    )
    .default([]),
})
export type OpsKpis = z.infer<typeof opsKpisSchema>

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
