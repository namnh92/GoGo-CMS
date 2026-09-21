import { z } from 'zod'
import type { Schemas } from './generated'

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
  provinceCode: z.string().nullable(),
  communeCode: z.string().nullable(),
  datasetVersion: z.string().nullable(),
  updatedAt: z.string(),
  /** True for anything that is not VERIFIED; the reason is on the detail. */
  blocksApproval: z.boolean(),
})
export type AdministrativeMappingListItem = z.infer<typeof administrativeMappingListItemSchema>

export const administrativeMappingPageSchema = z.object({
  items: z.array(administrativeMappingListItemSchema),
  nextCursor: z.string().nullable(),
  /** One per mapping status, plus `actionable`. */
  counts: z.record(z.string(), z.number()),
})
export type AdministrativeMappingPage = z.infer<typeof administrativeMappingPageSchema>

const evidenceSchema = z.object({
  method: z.string(),
  provinceCode: z.string().nullable(),
  communeCode: z.string().nullable(),
  legacyDistrictCode: z.string().nullish(),
  hierarchyValid: z.boolean(),
  /** False for anything that may only ever be offered to a person. */
  deterministic: z.boolean(),
  /**
   * Boundary evidence only, and *optional* rather than nullable — the contract
   * omits the key instead of sending null. The binding below caught the
   * difference, which #153 had guessed at.
   */
  onEdge: z.boolean().optional(),
  detail: z.string(),
})

/**
 * `REVALIDATED` is the healthy case and the one a screen most easily gets
 * wrong: the mapping is labelled with an older dataset version and is still
 * true. A version difference alone is not staleness, and nothing is written
 * for it.
 */
export const administrativeStaleVerdictSchema = z.object({
  stale: z.boolean(),
  reason: z.enum([
    'NO_MAPPING',
    'CURRENT',
    'REVALIDATED',
    'UNIT_NOT_IN_ACTIVE_DATASET',
    'UNIT_NOT_CURRENT',
    'HIERARCHY_CHANGED',
  ]),
  reviewerOwned: z.boolean(),
  requiresReview: z.boolean(),
  storedDatasetVersion: z.string().nullable(),
  activeDatasetVersion: z.string(),
})
export type AdministrativeStaleVerdict = z.infer<typeof administrativeStaleVerdictSchema>

export const administrativeApprovalBlockCodeSchema = z.enum([
  'MAPPING_UNMAPPED',
  'MAPPING_NOT_VERIFIED',
  'MAPPING_REJECTED',
  'MAPPING_STALE',
  'MAPPING_INCOMPLETE',
  'MAPPING_UNIT_NOT_CURRENT',
  'MAPPING_HIERARCHY_INVALID',
])
export type AdministrativeApprovalBlockCode = z.infer<typeof administrativeApprovalBlockCodeSchema>

export const administrativeMappingDetailSchema = z.object({
  placeId: z.string(),
  place: z.object({
    name: z.string(),
    status: z.string(),
    addressText: z.string().nullable(),
    city: z.string().nullable(),
    district: z.string().nullable(),
    geometry: z.object({ lng: z.number(), lat: z.number() }),
    /** Send back as `expectedUpdatedAt` on any decision. */
    updatedAt: z.string(),
  }),
  mapping: z.object({
    status: administrativeMappingStatusSchema,
    provinceCode: z.string().nullable(),
    communeCode: z.string().nullable(),
    legacyDistrictCode: z.string().nullable(),
    provinceName: z.string().nullable(),
    communeName: z.string().nullable(),
    legacyDistrictName: z.string().nullable(),
    method: z.string().nullable(),
    /**
     * 1.00 or absent. A manual verification writes none, because a person's
     * judgement is not a probability — so null is "unscored", never zero.
     */
    confidence: z.string().nullable(),
    datasetVersion: z.string().nullable(),
    boundaryVersion: z.string().nullable(),
    mappedAt: z.string().nullable(),
    /** Who is responsible for the mapping the row carries now. Kept on STALE. */
    reviewer: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  }),
  activeDatasetVersion: z.string(),
  evidence: z.array(evidenceSchema),
  /** Alternatives the resolver refused to choose between. */
  candidates: z.array(
    z.object({
      method: z.string(),
      provinceCode: z.string().nullable(),
      communeCode: z.string().nullable(),
      detail: z.string(),
    }),
  ),
  unresolvedReason: z.string().nullable(),
  hierarchyValid: z.boolean(),
  staleness: administrativeStaleVerdictSchema,
  approval: z.object({
    blocked: z.boolean(),
    block: z
      .object({ code: administrativeApprovalBlockCodeSchema, message: z.string() })
      .nullable(),
  }),
  /** What this role may do. The server still enforces it. */
  permittedActions: z.array(z.string()),
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

// --- CMS #155: source-drift adjudication (GoGo-BE ADM-011, alpha.10) ---------

/**
 * These mirror the vendored contract, and are held to it at compile time.
 *
 * Zod stays because it is the boundary rule this repo runs on (ADR-0002): the
 * CMS half of the spec documents most GET responses with prose, so the
 * generated types widen and a shape drift would otherwise surface as
 * `undefined` deep inside a cell. What zod cannot do on its own is stay
 * *honest* — a hand-written schema is a second contract, and second contracts
 * drift in silence.
 *
 * So every schema below is bound to the generated DTO in both directions by the
 * assertions at the end of this file. A field renamed, dropped or invented here
 * stops compiling rather than shipping.
 */

/**
 * The states the contract names today. The set is declared extensible
 * (`x-extensible-enum`, GoGo-BE#619): a value outside it is data the server
 * may legitimately send, so the schema accepts any string and the screens
 * treat an unknown one as "not actionable here" — never as a broken response.
 *
 * `MATERIALIZED_*` is settled on this dataset version by a materialisation.
 * Not a draft: nothing in a later draft set un-settles it, and a new decision
 * on such a row reports as the draft.
 */
export const ADMINISTRATIVE_DECISION_STATES = [
  'UNDECIDED',
  'ACCEPTED_DRAFT',
  'REJECTED_DRAFT',
  'SUPERSEDED',
  'MATERIALIZED_ACCEPT',
  'MATERIALIZED_REJECT',
  /* Another row of the same source carried the decision (GoGo-BE#622). */
  'SOURCE_SETTLED',
] as const
export type KnownAdministrativeDecisionState = (typeof ADMINISTRATIVE_DECISION_STATES)[number]
export const administrativeDecisionStateSchema = z.string()
export type AdministrativeDecisionState = z.infer<typeof administrativeDecisionStateSchema>

export function isKnownDecisionState(value: string): value is KnownAdministrativeDecisionState {
  return (ADMINISTRATIVE_DECISION_STATES as readonly string[]).includes(value)
}

/**
 * A code and the effective date that makes it mean something. 2,212 of the
 * 3,321 current commune codes named a different unit before 2025-07-01, so a
 * code on its own is ambiguous rather than merely terse.
 */
export const administrativeUnitIdentitySchema = z.object({
  code: z.string().nullable(),
  name: z.string().nullable(),
  unitType: z.string().nullable(),
  level: z.string().nullable(),
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  parentCode: z.string().nullable(),
  status: z.string().nullable(),
})
export type AdministrativeUnitIdentity = z.infer<typeof administrativeUnitIdentitySchema>

/**
 * Three groups, never one. `canonical` counts every edge the dataset asserts,
 * `backlog` counts the quarantine rows themselves, and `decisions` counts them
 * by the state of their effective decision. Summing the import report's
 * classification map instead would report a backlog nine times too large.
 */
export const administrativeQuarantineCountsSchema = z.object({
  canonical: z.record(z.string(), z.number()),
  backlog: z.record(z.string(), z.number()),
  decisions: z.record(z.string(), z.number()),
})
export type AdministrativeQuarantineCounts = z.infer<typeof administrativeQuarantineCountsSchema>

export const administrativeQuarantineItemSchema = z.object({
  id: z.string(),
  classification: z.string(),
  validationReason: z.string(),
  source: z.object({ code: z.string().nullish(), name: z.string().nullish() }),
  /** What the upstream guessed. Shown, never pre-selected. */
  proposedTarget: z.object({ code: z.string().nullish(), name: z.string().nullish() }),
  upstreamFlags: z.record(z.string(), z.unknown()),
  candidateCount: z.number(),
  affectedPlaceCount: z.number(),
  decisionState: administrativeDecisionStateSchema,
  decidedAt: z.string().nullable(),
  sourceProvenance: z.string(),
})
export type AdministrativeQuarantineItem = z.infer<typeof administrativeQuarantineItemSchema>

export const administrativeQuarantinePageSchema = z.object({
  items: z.array(administrativeQuarantineItemSchema),
  nextCursor: z.string().nullable(),
  counts: administrativeQuarantineCountsSchema,
})
export type AdministrativeQuarantinePage = z.infer<typeof administrativeQuarantinePageSchema>

/** One opinion. Append-only: nothing here is ever rewritten. */
export const administrativeOverrideDecisionRecordSchema = z.object({
  id: z.string(),
  sequence: z.number(),
  decision: z.enum(['ACCEPT', 'REJECT']),
  targetCode: z.string().nullable(),
  targetEffectiveFrom: z.string().nullable(),
  reason: z.string(),
  supersedesDecisionId: z.string().nullish(),
  supersededById: z.string().nullish(),
  decidedAt: z.string(),
})
export type AdministrativeOverrideDecisionRecord = z.infer<
  typeof administrativeOverrideDecisionRecordSchema
>

export const administrativeQuarantineDetailSchema = z.object({
  id: z.string(),
  datasetVersionId: z.string(),
  classification: z.string(),
  validationReason: z.string(),
  sourceProvenance: z.string(),
  combinedDatasetVersion: z.string(),
  upstreamFlags: z.record(z.string(), z.unknown()).optional(),
  /** Verbatim up to a cap; `truncated` says when the cap applied. */
  rawPayload: z.object({ value: z.unknown(), truncated: z.boolean() }),
  source: administrativeUnitIdentitySchema,
  candidates: z.array(
    administrativeUnitIdentitySchema.extend({
      proposedByUpstream: z.boolean().optional(),
      hierarchyValid: z.boolean().optional(),
      selectable: z.boolean().optional(),
    }),
  ),
  affectedPlaces: administrativeAffectedPlacesSchema,
  overrideSet: z.object({
    id: z.string().nullable(),
    revision: z.number(),
    status: z.string(),
  }),
  decision: administrativeOverrideDecisionRecordSchema.nullable(),
  /**
   * The decision a materialisation carried into this version for this row.
   * `targetCode` is the successor the accepted edge names; null for a
   * rejection. Absent on a base nobody has materialised from.
   */
  materialized: z
    .object({
      decision: z.enum(['ACCEPT', 'REJECT']),
      targetCode: z.string().nullable(),
      reason: z.string().nullable(),
      decidedAt: z.string().nullable(),
      /** A carried REJECT that withdrew an earlier round's override (GoGo-BE#623). */
      retracted: z.object({ targetCode: z.string(), decisionId: z.string().nullable() }).nullable(),
    })
    .nullable()
    .optional(),
  /**
   * Another row of this source carried the override this version holds: the
   * source has its one successor, and this row cannot be accepted elsewhere
   * (GoGo-BE#622).
   */
  sourceSettled: z
    .object({
      targetCode: z.string(),
      sourceVersion: z.string(),
      decisionId: z.string().nullable(),
    })
    .nullable()
    .optional(),
  decisionState: administrativeDecisionStateSchema,
  history: z.array(administrativeOverrideDecisionRecordSchema),
})
export type AdministrativeQuarantineDetail = z.infer<typeof administrativeQuarantineDetailSchema>

export const administrativeOverrideSetSchema = z.object({
  /** Null until the first decision opens one. At most one per base dataset. */
  draft: z
    .object({
      id: z.string(),
      /** Send this back as `expectedRevision` on the next decision. */
      revision: z.number(),
      status: z.literal('DRAFT'),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .nullable(),
  counts: administrativeQuarantineCountsSchema,
  materialized: z.array(
    z.object({
      id: z.string(),
      revision: z.number(),
      datasetVersionId: z.string().nullable(),
      materializedAt: z.string().nullable(),
    }),
  ),
})
export type AdministrativeOverrideSet = z.infer<typeof administrativeOverrideSetSchema>

export const administrativeOverrideDecisionResultSchema = z.object({
  decisionId: z.string(),
  overrideSetId: z.string(),
  overrideSetRevision: z.number(),
  decision: z.enum(['ACCEPT', 'REJECT']),
  quarantineRowId: z.string(),
  supersededDecisionId: z.string().nullable(),
  decidedAt: z.string(),
  /** Set on a REJECT that retracts a base override when materialised (GoGo-BE#623). */
  retracts: z
    .object({
      decisionId: z.string().nullable(),
      targetCode: z.string(),
      sourceVersion: z.string(),
    })
    .nullable(),
})
export type AdministrativeOverrideDecisionResult = z.infer<
  typeof administrativeOverrideDecisionResultSchema
>

export const administrativeMaterializeResultSchema = z.object({
  overrideSetId: z.string(),
  overrideSetRevision: z.number(),
  /** STAGED, and served to nobody until it is published. */
  datasetVersionId: z.string(),
  combinedDatasetVersion: z.string(),
  combinedChecksum: z.string(),
  overrideRevision: z.number(),
  status: z.literal('STAGED'),
  decisions: z.object({
    effective: z.number(),
    accepted: z.number(),
    rejected: z.number(),
    /** A rejection produces none: it changes provenance, not content. */
    edges: z.number(),
    retracted: z.number(),
  }),
})
export type AdministrativeMaterializeResult = z.infer<typeof administrativeMaterializeResultSchema>

export const administrativeOverrideAbandonResultSchema = z.object({
  overrideSetId: z.string(),
  status: z.literal('ABANDONED'),
  abandonedAt: z.string().nullable(),
})

/*
 * The binding. Each pair asserts the zod shape and the generated DTO are
 * mutually assignable, so a schema above cannot rename, drop or invent a field
 * without failing the build. This is what keeps zod a boundary check rather
 * than a second contract.
 */
type Exact<A extends B, B extends C, C = A> = A

export type ContractBinding = [
  _Identity,
  _Counts,
  _Item,
  _Page,
  _Record,
  _Detail,
  _Set,
  _Decision,
  _Materialize,
]

type _Identity = Exact<AdministrativeUnitIdentity, Schemas['AdministrativeUnitIdentity']>
type _Counts = Exact<AdministrativeQuarantineCounts, Schemas['AdministrativeQuarantineCounts']>
type _Item = Exact<AdministrativeQuarantineItem, Schemas['AdministrativeQuarantineItem']>
type _Page = Exact<AdministrativeQuarantinePage, Schemas['AdministrativeQuarantinePage']>
type _Record = Exact<
  AdministrativeOverrideDecisionRecord,
  Schemas['AdministrativeOverrideDecisionRecord']
>
/*
 * `rawPayload.value` is re-stated rather than bound. TypeScript treats a
 * property whose type includes `undefined` as optional, and `unknown` includes
 * it — so no zod schema can infer a *required* `unknown` field, whatever the
 * contract says. Every other field of the detail is bound; this one is excepted
 * on the record rather than by loosening the whole assertion.
 */
type _Detail = Exact<
  Omit<AdministrativeQuarantineDetail, 'rawPayload'> & {
    rawPayload: { value: unknown; truncated: boolean }
  },
  Schemas['AdministrativeQuarantineDetail']
>
type _Set = Exact<AdministrativeOverrideSet, Schemas['AdministrativeOverrideSet']>
type _Decision = Exact<
  AdministrativeOverrideDecisionResult,
  Schemas['AdministrativeOverrideDecisionResult']
>
type _Materialize = Exact<
  AdministrativeMaterializeResult,
  Schemas['AdministrativeMaterializeResult']
>

// --- CMS #156: per-place mapping moderation ----------------------------------

/**
 * A current administrative unit, as GoGo-BE serves it.
 *
 * The selector reads these and submits the code it was given: display text is
 * never the identifier, and a commune is only ever offered under the province
 * it actually belongs to.
 */
export const administrativeUnitSchema = z.object({
  code: z.string(),
  name: z.string(),
  fullName: z.string(),
  nameEn: z.string().nullish(),
  codeName: z.string().nullish(),
  unitType: z.enum([
    'PROVINCE',
    'MUNICIPALITY',
    'WARD',
    'COMMUNE',
    'SPECIAL_ZONE',
    'LEGACY_DISTRICT',
  ]),
  level: z.enum(['PROVINCE', 'COMMUNE', 'LEGACY_DISTRICT']),
  parentCode: z.string().nullish(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'FUTURE']),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullish(),
  isCurrent: z.boolean(),
})
export type AdministrativeUnitDto = z.infer<typeof administrativeUnitSchema>

export const administrativeUnitPageSchema = z.object({
  items: z.array(administrativeUnitSchema),
  nextCursor: z.string().nullish(),
  /**
   * How many units the request matched in total, not how many this page holds.
   *
   * It is what lets a caller check it has the whole set without knowing how
   * many provinces or communes Vietnam currently has — a number that has
   * changed twice in two years and will change again.
   */
  total: z.number().int().nonnegative(),
  datasetVersion: z.string(),
})
export type AdministrativeUnitPage = z.infer<typeof administrativeUnitPageSchema>

export const administrativeVerifyResultSchema = z.object({
  placeId: z.string(),
  status: z.literal('VERIFIED'),
  datasetVersion: z.string(),
})

/**
 * GoGo-BE#613 — one request, N decisions, one outcome each.
 *
 * `outcome` is the whole point of the shape: a batch where one place moved
 * under the reviewer is a batch that partly succeeded, and the screen has to
 * say which part. `code` carries the refusal so the reviewer is told why rather
 * than that it failed.
 */
export const administrativeBatchVerifyResultSchema = z.object({
  placeId: z.string(),
  outcome: z.enum(['verified', 'conflict', 'refused']),
  status: administrativeMappingStatusSchema.nullable(),
  datasetVersion: z.string().nullable(),
  code: z.string().nullable(),
  message: z.string().nullable(),
})
export type AdministrativeBatchVerifyResult = z.infer<typeof administrativeBatchVerifyResultSchema>

export const administrativeBatchVerifyReportSchema = z.object({
  requested: z.number(),
  verified: z.number(),
  conflicts: z.number(),
  refused: z.number(),
  results: z.array(administrativeBatchVerifyResultSchema),
})
export type AdministrativeBatchVerifyReport = z.infer<typeof administrativeBatchVerifyReportSchema>

/** The resolver ran. It may land on any of three states, and none is a verification. */
export const administrativeRematchResultSchema = z.object({
  placeId: z.string(),
  status: z.enum(['UNMAPPED', 'AUTO_MATCHED', 'NEEDS_REVIEW']),
  communeCode: z.string().nullable(),
})
export type AdministrativeRematchResult = z.infer<typeof administrativeRematchResultSchema>

/** `changed: false` is the ordinary answer: a valid mapping needs no write. */
export const administrativeReconcileResultSchema = z.object({
  placeId: z.string(),
  changed: z.boolean(),
  verdict: administrativeStaleVerdictSchema,
})
export type AdministrativeReconcileResult = z.infer<typeof administrativeReconcileResultSchema>

type _Stale = Exact<AdministrativeStaleVerdict, Schemas['AdministrativeStaleVerdict']>
type _MappingItem = Exact<AdministrativeMappingListItem, Schemas['AdministrativeMappingListItem']>
type _MappingDetail = Exact<AdministrativeMappingDetail, Schemas['AdministrativeMappingDetail']>
type _Unit = Exact<AdministrativeUnitDto, Schemas['AdministrativeUnit']>

export type MappingContractBinding = [_Stale, _MappingItem, _MappingDetail, _Unit]
