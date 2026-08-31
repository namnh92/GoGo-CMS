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
 * The community tab lists PLACES in `community_submitted`, not submissions —
 * deciding one needs a submission id, which `GET /cms/place-submissions`
 * hands out (PI-CMS-007, `features/submissions`). This tab links there.
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
export const featureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  payload: z.unknown().nullish(),
  description: z.string().nullish(),
  updatedBy: adminRefSchema.nullish(),
  updatedAt: z.string(),
})
export type FeatureFlag = z.infer<typeof featureFlagSchema>
export const featureFlagListSchema = z.array(featureFlagSchema)

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
