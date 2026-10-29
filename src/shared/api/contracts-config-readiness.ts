import { z } from 'zod'
import type { Schemas } from './generated'

/*
 * `GET /v1/cms/ops/config-readiness` (GoGo-CMS#264, GoGo-BE#727; GoGo-Infra#309
 * D-9/D-10). Mirrors the `CmsConfigReadiness` component schemas of contract
 * 2.0.0-alpha.5 exactly; `ContractBinding` below fails the typecheck when the
 * two drift apart.
 *
 * Facts only. Every variable is a boolean — the response never carries a
 * value, a prefix, a length or a hash, and nothing on the page derives one.
 * Every verdict is GoGo-Infra's, copied by GoGo-BE; the page displays them and
 * computes none of its own (A-F-11).
 */

export const readinessVerdictSchema = z.enum(['OK', 'FAIL', 'UNKNOWN'])
export type ReadinessVerdict = z.infer<typeof readinessVerdictSchema>

export const configVariableSchema = z.object({
  name: z.string(),
  present: z.boolean(),
  optional: z.boolean(),
  conditional: z.boolean(),
})
export type ConfigVariable = z.infer<typeof configVariableSchema>

export const configInfraRowSchema = z.object({
  path: z.string(),
  env_var: z.string().nullable(),
  lifecycle: z.string(),
  presence: z.enum(['present', 'absent', 'unknown']),
  findings: z.array(z.string()),
  verdict: readinessVerdictSchema,
  capabilities: z.array(z.string()),
  applicable: z.enum(['api', 'host']),
  process_present: z.boolean().nullable(),
})
export type ConfigInfraRow = z.infer<typeof configInfraRowSchema>

export const configInfraSchema = z.object({
  label: z.literal('deploy_snapshot'),
  schema_version: z.literal(1),
  env: z.string(),
  generated_at: z.string(),
  manifest_sha: z.string().nullable(),
  deploy_id: z.string(),
  release_sha: z.string(),
  run_id: z.string(),
  run_attempt: z.string(),
  process_deploy_id: z.string().nullable(),
  deploy_match: z.boolean(),
  rows: z.array(configInfraRowSchema),
})
export type ConfigInfra = z.infer<typeof configInfraSchema>

export const configCapabilitySchema = z.object({
  name: z.string(),
  status: z.enum(['enabled', 'planned']),
  ssm_verdict: readinessVerdictSchema,
  ssm_ready: z.boolean(),
  ssm_missing: z.array(z.string()),
  ssm_present: z.object({ present: z.number().int(), total: z.number().int() }),
  process_ready: z.boolean().nullable(),
  process_missing: z.array(z.string()),
  excluded_from_process: z.array(z.string()),
})
export type ConfigCapability = z.infer<typeof configCapabilitySchema>

export const configUnavailableReasonSchema = z.enum([
  'not_configured',
  'missing',
  'unreadable',
  'invalid',
  'unknown_schema',
])
export type ConfigUnavailableReason = z.infer<typeof configUnavailableReasonSchema>

export const configReadinessSchema = z.object({
  process: z.array(configVariableSchema),
  process_dynamic: z.array(configVariableSchema),
  infra: configInfraSchema.nullable(),
  reason: configUnavailableReasonSchema.nullable(),
  capabilities: z.array(configCapabilitySchema),
})
export type ConfigReadiness = z.infer<typeof configReadinessSchema>

type Exact<A extends B, B extends C, C = A> = A

export type ContractBinding = [
  Exact<ConfigVariable, Schemas['CmsConfigVariable']>,
  Exact<ConfigInfraRow, Schemas['CmsConfigInfraRow']>,
  Exact<ConfigInfra, Schemas['CmsConfigInfra']>,
  Exact<ConfigCapability, Schemas['CmsConfigCapability']>,
  Exact<ConfigReadiness, Schemas['CmsConfigReadiness']>,
]
