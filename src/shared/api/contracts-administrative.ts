import { z } from 'zod'

/**
 * CMS #153 — boundary schemas for the administrative surface (GoGo-BE ADM-005
 * and ADM-009, OpenAPI `1.0.0-alpha.8`).
 *
 * In their own file rather than appended to `contracts.ts`, which is already 65
 * KB and shared by every other feature: four CMS issues are going to grow this
 * surface, and a file the whole console rebuilds on is the wrong place for
 * that.
 *
 * Every shape here mirrors a component schema in the vendored spec. Optional
 * fields are `nullish()` for the reason the rest of the boundary uses: a
 * backend that omits one should degrade a cell to "—", not blank a screen.
 */

export const administrativeCapabilityStateSchema = z.enum(['AVAILABLE', 'MISSING', 'ERROR'])

export const administrativeMappingStatusSchema = z.enum([
  'UNMAPPED',
  'AUTO_MATCHED',
  'NEEDS_REVIEW',
  'VERIFIED',
  'REJECTED',
  'STALE',
])
export type AdministrativeMappingStatus = z.infer<typeof administrativeMappingStatusSchema>

/**
 * What the environment can currently do.
 *
 * The exact dataset and boundary versions live here rather than in a metric
 * label, which is the whole reason the endpoint exists: a label whose values
 * grow with every publication is a series set that never stops growing.
 */
export const administrativeCapabilitySchema = z.object({
  dataset: z.object({
    state: administrativeCapabilityStateSchema,
    version: z.string().nullish(),
    publishedAt: z.string().nullish(),
    ageSeconds: z.number().nullish(),
    counts: z.record(z.string(), z.number()).default({}),
    quarantined: z.number().default(0),
    unresolved: z.number().default(0),
    validation: z.object({ errors: z.number(), warnings: z.number() }).nullish(),
  }),
  boundaries: z.object({
    state: administrativeCapabilityStateSchema,
    version: z.string().nullish(),
    loadedAt: z.string().nullish(),
    ageSeconds: z.number().nullish(),
    provinces: z.number().default(0),
    communes: z.number().default(0),
  }),
  resolver: z.enum(['FULL', 'PARTIAL', 'UNAVAILABLE']),
  publication: z.enum(['ENABLED', 'BLOCKED']),
  mappings: z.record(z.string(), z.number()).default({}),
  remediation: z.record(z.string(), z.number()).default({}),
  observedAt: z.string(),
})
export type AdministrativeCapability = z.infer<typeof administrativeCapabilitySchema>

const validationSummarySchema = z.object({
  validationId: z.string(),
  validatorVersion: z.string(),
  ranAt: z.string(),
  errors: z.number(),
  warnings: z.number(),
  publishable: z.boolean(),
  warningGates: z.array(z.string()).default([]),
})

export const administrativeDatasetSummarySchema = z.object({
  id: z.string(),
  combinedDatasetVersion: z.string(),
  combinedChecksum: z.string(),
  status: z.enum(['STAGED', 'VALIDATED', 'REJECTED', 'PUBLISHED', 'ROLLED_BACK']),
  effectiveDate: z.string(),
  overrideRevision: z.number(),
  sources: z.object({
    currentSourceVersion: z.string(),
    historicalSourceVersion: z.string().nullish(),
    mappingSourceCommit: z.string().nullish(),
    boundarySourceVersion: z.string().nullish(),
  }),
  importedAt: z.string(),
  publishedAt: z.string().nullish(),
  validation: validationSummarySchema.nullish(),
})
export type AdministrativeDatasetSummary = z.infer<typeof administrativeDatasetSummarySchema>

export const administrativeDatasetPageSchema = z.object({
  items: z.array(administrativeDatasetSummarySchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})
export type AdministrativeDatasetPage = z.infer<typeof administrativeDatasetPageSchema>

/**
 * One side of a change. A code alone is not an identity: 2,212 of the 3,321
 * commune codes changed meaning on 2025-07-01, so the effective date travels
 * with the code everywhere it is shown.
 */
const administrativeUnitRefSchema = z.object({
  code: z.string().nullish(),
  effectiveFrom: z.string().nullish(),
})

export const administrativeDiffEntrySchema = z.object({
  key: z.string(),
  category: z.string(),
  from: administrativeUnitRefSchema.nullish(),
  to: administrativeUnitRefSchema.nullish(),
  detail: z.string(),
  provenance: z.string().nullish(),
  validation: z.array(z.string()).default([]),
})
export type AdministrativeDiffEntry = z.infer<typeof administrativeDiffEntrySchema>

const administrativePlaceSampleSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  code: z.string(),
  status: z.string(),
})

/**
 * `total` is counted in the database; `samples` is capped at `sampleLimit`.
 * They are deliberately separate numbers — reporting the sample length as the
 * total is how a LIMIT becomes a fact.
 */
export const administrativeAffectedPlacesSchema = z.object({
  total: z.number(),
  samples: z.array(administrativePlaceSampleSchema).default([]),
  truncated: z.boolean(),
  sampleLimit: z.number(),
})
export type AdministrativeAffectedPlaces = z.infer<typeof administrativeAffectedPlacesSchema>

export const administrativeDatasetDiffSchema = z.object({
  fromVersion: z.string().nullish(),
  toVersion: z.string(),
  countsByCategory: z.record(z.string(), z.number()).default({}),
  entries: z.array(administrativeDiffEntrySchema).default([]),
  entriesTruncated: z.boolean(),
  entryLimit: z.number(),
  affectedPlaces: administrativeAffectedPlacesSchema,
  pagination: z
    .object({
      offset: z.number(),
      limit: z.number(),
      totalEntries: z.number(),
      hasMore: z.boolean(),
    })
    .nullish(),
})
export type AdministrativeDatasetDiff = z.infer<typeof administrativeDatasetDiffSchema>

export const administrativeMappingListItemSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  placeStatus: z.string(),
  mappingStatus: administrativeMappingStatusSchema,
  provinceCode: z.string().nullish(),
  communeCode: z.string().nullish(),
  datasetVersion: z.string().nullish(),
  updatedAt: z.string(),
  blocksApproval: z.boolean(),
})
export type AdministrativeMappingListItem = z.infer<typeof administrativeMappingListItemSchema>

export const administrativeMappingPageSchema = z.object({
  items: z.array(administrativeMappingListItemSchema),
  nextCursor: z.string().nullish(),
  counts: z.record(z.string(), z.number()).default({}),
})
export type AdministrativeMappingPage = z.infer<typeof administrativeMappingPageSchema>

const evidenceSchema = z.object({
  method: z.string(),
  provinceCode: z.string().nullish(),
  communeCode: z.string().nullish(),
  legacyDistrictCode: z.string().nullish(),
  hierarchyValid: z.boolean(),
  deterministic: z.boolean(),
  onEdge: z.boolean().nullish(),
  detail: z.string(),
})

export const administrativeMappingDetailSchema = z.object({
  placeId: z.string(),
  place: z.object({
    name: z.string(),
    status: z.string(),
    addressText: z.string().nullish(),
    city: z.string().nullish(),
    district: z.string().nullish(),
    geometry: z.object({ lng: z.number(), lat: z.number() }),
    /** Send back as `expectedUpdatedAt` on any decision. */
    updatedAt: z.string(),
  }),
  mapping: z.object({
    status: administrativeMappingStatusSchema,
    provinceCode: z.string().nullish(),
    communeCode: z.string().nullish(),
    legacyDistrictCode: z.string().nullish(),
    provinceName: z.string().nullish(),
    communeName: z.string().nullish(),
    legacyDistrictName: z.string().nullish(),
    method: z.string().nullish(),
    confidence: z.string().nullish(),
    datasetVersion: z.string().nullish(),
    boundaryVersion: z.string().nullish(),
    mappedAt: z.string().nullish(),
    reviewer: z.object({ id: z.string(), displayName: z.string() }).nullish(),
  }),
  activeDatasetVersion: z.string(),
  evidence: z.array(evidenceSchema).default([]),
  candidates: z
    .array(
      z.object({
        method: z.string(),
        provinceCode: z.string().nullish(),
        communeCode: z.string().nullish(),
        detail: z.string(),
      }),
    )
    .default([]),
  unresolvedReason: z.string().nullish(),
  hierarchyValid: z.boolean(),
  staleness: z.object({
    stale: z.boolean(),
    reason: z.string(),
    reviewerOwned: z.boolean(),
    requiresReview: z.boolean(),
    storedDatasetVersion: z.string().nullish(),
    activeDatasetVersion: z.string(),
  }),
  approval: z.object({
    blocked: z.boolean(),
    block: z.object({ code: z.string(), message: z.string() }).nullish(),
  }),
  /** What this role may do — the server still enforces it. */
  permittedActions: z.array(z.string()).default([]),
})
export type AdministrativeMappingDetail = z.infer<typeof administrativeMappingDetailSchema>

export const administrativeRemediationSchema = z.object({
  activeDatasetVersion: z.string(),
  counts: z.record(z.string(), z.number()).default({}),
  samples: z.record(z.string(), z.array(z.string())).default({}),
})
export type AdministrativeRemediation = z.infer<typeof administrativeRemediationSchema>

// --- CMS #154: validation, import, transition ---------------------------------

export const administrativeValidationFindingSchema = z.object({
  gate: z.string(),
  severity: z.enum(['ERROR', 'WARNING']),
  message: z.string(),
  count: z.number(),
  samples: z.array(z.string()).default([]),
})
export type AdministrativeValidationFinding = z.infer<typeof administrativeValidationFindingSchema>

/**
 * What a stored validation result is evidence *about*.
 *
 * Publication re-derives every one of these server-side and refuses on the
 * first disagreement. The screen compares the four it can see — a validation
 * bound to another version, checksum or override revision is visibly stale
 * before anyone clicks publish. The fifth, `snapshotFingerprint`, is a digest
 * of the stored rows: only the server can recompute it, so a row edited
 * directly in the database is a refusal the screen cannot predict, and it says
 * so rather than promising a publication it cannot know will be accepted.
 */
export const administrativeValidationBindingSchema = z.object({
  datasetVersionId: z.string(),
  combinedDatasetVersion: z.string(),
  combinedChecksum: z.string(),
  snapshotFingerprint: z.string(),
  overrideRevision: z.number(),
})
export type AdministrativeValidationBinding = z.infer<typeof administrativeValidationBindingSchema>

export const administrativeValidationReportSchema = z.object({
  datasetVersion: z.string(),
  ranAt: z.string(),
  findings: z.array(administrativeValidationFindingSchema).default([]),
  errors: z.number(),
  warnings: z.number(),
  /** Exactly `errors === 0`. A WARNING never affects it. */
  publishable: z.boolean(),
  counts: z.object({
    currentProvinces: z.number(),
    currentCommunes: z.number(),
    historicalProvinces: z.number(),
    historicalDistricts: z.number(),
    historicalCommunes: z.number(),
    canonicalChanges: z.number(),
    quarantined: z.number(),
  }),
  validationId: z.string(),
  validatorVersion: z.string(),
  boundTo: administrativeValidationBindingSchema,
})
export type AdministrativeValidationReport = z.infer<typeof administrativeValidationReportSchema>

/**
 * `diffSummary` is the diff stored when this version was last validated — it
 * describes the baseline that was active *then*. `GET /diff` recomputes against
 * today's, which is why the screen reads that endpoint for anything a reviewer
 * is about to act on and keeps this one labelled as history.
 */
export const administrativeDatasetDetailSchema = administrativeDatasetSummarySchema.extend({
  validationReport: administrativeValidationReportSchema.nullish(),
  diffSummary: z.record(z.string(), z.unknown()).nullish(),
})
export type AdministrativeDatasetDetail = z.infer<typeof administrativeDatasetDetailSchema>

export const administrativeRestorableSchema = z.object({
  items: z.array(administrativeDatasetSummarySchema).default([]),
})
export type AdministrativeRestorable = z.infer<typeof administrativeRestorableSchema>

export const administrativeImportReportSchema = z.object({
  datasetVersionId: z.string(),
  combinedDatasetVersion: z.string(),
  combinedChecksum: z.string(),
  counts: z.object({
    provinces: z.number(),
    communes: z.number(),
    legacyDistricts: z.number(),
    legacyCommunes: z.number(),
    canonicalChanges: z.number(),
    quarantined: z.number(),
  }),
  /** One count per quarantine class. An unresolvable row is never guessed. */
  classification: z.record(z.string(), z.number()).default({}),
  warnings: z.array(z.string()).default([]),
})
export type AdministrativeImportReport = z.infer<typeof administrativeImportReportSchema>

export const administrativeValidateResultSchema = z.object({
  validation: administrativeValidationReportSchema,
  diff: administrativeDatasetDiffSchema,
})
export type AdministrativeValidateResult = z.infer<typeof administrativeValidateResultSchema>

/**
 * Places whose administrative claim does not resolve against the version being
 * activated. Reported, never written: whether a claim a person verified should
 * be demoted is the moderation work's decision (#156), not a publication's.
 */
export const administrativeStaleMappingsSchema = administrativeAffectedPlacesSchema

export const administrativeTransitionResultSchema = z.object({
  datasetVersionId: z.string(),
  combinedDatasetVersion: z.string(),
  previousActiveVersion: z.string().nullish(),
  previousActiveVersionId: z.string().nullish(),
  publishedAt: z.string(),
  validationId: z.string(),
  warnings: z.number(),
  warningGates: z.array(z.string()).default([]),
  diff: administrativeDatasetDiffSchema,
  staleMappings: administrativeStaleMappingsSchema,
  /**
   * Whether this API process refilled its own active-version pointer after the
   * commit. False is not a failed publication — PostgreSQL is authoritative and
   * every process converges within the 60-second TTL.
   */
  cacheWarmed: z.boolean(),
})
export type AdministrativeTransitionResult = z.infer<typeof administrativeTransitionResultSchema>
