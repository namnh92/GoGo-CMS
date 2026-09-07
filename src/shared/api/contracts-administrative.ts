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

export const administrativeDatasetDiffSchema = z.object({
  fromVersion: z.string().nullish(),
  toVersion: z.string(),
  countsByCategory: z.record(z.string(), z.number()).default({}),
  entries: z
    .array(
      z.object({
        key: z.string(),
        category: z.string(),
        detail: z.string(),
        provenance: z.string().nullish(),
        validation: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  entriesTruncated: z.boolean(),
  entryLimit: z.number(),
  affectedPlaces: z.object({
    total: z.number(),
    truncated: z.boolean(),
    sampleLimit: z.number(),
  }),
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
