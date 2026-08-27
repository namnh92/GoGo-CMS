import type { components, operations, paths } from './schema'

/**
 * Types generated from `openapi/gogo.v1.yaml` (`pnpm api:types`). Never edit
 * `schema.d.ts` and never hand-write a DTO — regenerate instead.
 *
 * Request bodies come from here. Most CMS *responses* are documented in the
 * spec with prose and no schema, so they widen to `unknown`; those are
 * validated with zod in `contracts.ts` until GoGo-BE fills the schemas in.
 */
export type { components, operations, paths }

export type Schemas = components['schemas']

export type RequestBody<O extends keyof operations> = operations[O] extends {
  requestBody?: { content: { 'application/json': infer B } }
}
  ? B
  : never

export type CmsLoginBody = RequestBody<'cmsLogin'>
export type CmsUpdatePlaceBody = RequestBody<'cmsUpdatePlace'>
export type CmsTransitionPlaceBody = RequestBody<'cmsTransitionPlace'>
export type CmsSetPlaceHoursBody = RequestBody<'cmsSetPlaceHours'>
export type CmsAddPlacePriceBody = RequestBody<'cmsAddPlacePrice'>
export type CmsMergePlacesBody = RequestBody<'cmsMergePlaces'>
export type CmsCreateTaxonomyBody = RequestBody<'cmsCreateTaxonomy'>
export type CmsUpdateTaxonomyBody = RequestBody<'cmsUpdateTaxonomy'>
export type CmsAddSynonymBody = RequestBody<'cmsAddSynonym'>
export type CmsCreateCollectionBody = RequestBody<'cmsCreateCollection'>
export type CmsSetCollectionItemsBody = RequestBody<'cmsSetCollectionItems'>
export type CmsCreateRankingConfigBody = RequestBody<'cmsCreateRankingConfig'>
export type CmsSetFeatureFlagBody = RequestBody<'cmsSetFeatureFlag'>
export type DecidePlaceSubmissionBody = RequestBody<'decidePlaceSubmission'>
export type CreateSheetImportBody = RequestBody<'createPlaceImportFromSheet'>

export type ModerationDecisionBody = Schemas['ModerationDecision']
export type ImportJobDto = Schemas['ImportJob']
export type ImportRowDto = Schemas['ImportRow']
export type ImportCandidateDto = Schemas['ImportCandidate']
export type ErrorEnvelopeDto = Schemas['ErrorEnvelope']
export type AdminRoleDto = Schemas['AdminRole']
