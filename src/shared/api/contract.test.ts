import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CMS #167 — the vendored contract, checked as content rather than as a hash.
 *
 * `pnpm api:check` already proves the generated client matches the spec and
 * that the spec declares the version the client expects. What it cannot prove
 * is that the spec is *the right one*: a stale copy is perfectly self-consistent,
 * which is exactly how GoGo-CMS and GoGo-MobileApp both sat fourteen paths
 * behind `develop` while every drift gate stayed green (GoGo-BE#449).
 *
 * So these assert the paths a re-vendor could silently drop. The failure they
 * exist to catch is resolving `openapi/gogo.v1.yaml` in a merge by accepting an
 * older hand-edited copy — which would take the administrative surface with it.
 */

// `import.meta.url` is a Vite module URL under the browser-ish test env, so the
// paths resolve from the project root instead.
const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8')
const spec = read('openapi/gogo.v1.yaml')
const drift = read('scripts/check-openapi-drift.mjs')
const generated = read('src/shared/api/schema.d.ts')
const administrativeContracts = read('src/shared/api/contracts-administrative.ts')

const EXPECTED = '1.0.0-alpha.15'

/**
 * The vendored file byte for byte, as GoGo-BE published it.
 *
 * `openapi/gogo.v1.yaml` is in `.prettierignore`, so nothing in this repo may
 * touch it — a copy that differs from the upstream by even a newline has been
 * hand-edited, and this is what makes that visible rather than invisible. A
 * legitimate re-vendor updates the version above and this digest together.
 */
const SPEC_SHA256 = 'cfe37de741a0fba5ded305876fca6ea38df6361f87dd3379015ff99afb9c9fdb'

/** `pnpm api:routes` on GoGo-BE reports the same number against the real router. */
const SERVED_OPERATIONS = 249

describe('the vendored OpenAPI contract', () => {
  it(`declares ${EXPECTED}, and the drift gate expects the same`, () => {
    expect(/^ {2}version: (\S+)$/m.exec(spec)?.[1]).toBe(EXPECTED)
    expect(drift).toContain(`?? '${EXPECTED}'`)
  })

  it('is byte-identical to what GoGo-BE published', () => {
    expect(
      createHash('sha256')
        .update(readFileSync(resolve(process.cwd(), 'openapi/gogo.v1.yaml')))
        .digest('hex'),
    ).toBe(SPEC_SHA256)
  })

  it('still carries every operation the API actually serves', () => {
    // Operations, not paths: a re-vendor that silently drops one fails here
    // rather than at the first request the CMS makes against it.
    expect(spec.match(/^ {6}operationId:/gm)?.length).toBe(SERVED_OPERATIONS)
  })

  it('keeps every administrative path the dataset screen is built on', () => {
    // CMS #153/#154. Losing any of these to a merge resolution would leave the
    // screen calling routes the vendored contract no longer describes.
    for (const path of [
      '/cms/administrative-datasets:',
      '/cms/administrative-datasets/capability:',
      '/cms/administrative-datasets/import:',
      '/cms/administrative-datasets/restorable:',
      '/cms/administrative-datasets/{id}:',
      '/cms/administrative-datasets/{id}/diff:',
      '/cms/administrative-datasets/{id}/validate:',
      '/cms/administrative-datasets/{id}/publish:',
      '/cms/administrative-datasets/{id}/rollback:',
      '/cms/administrative-mappings:',
      '/cms/administrative-mappings/remediation:',
      '/cms/places/{id}/administrative-mapping:',
    ]) {
      expect(spec).toContain(path)
    }
  })

  it('carries the administrative surface the place forms now depend on (GoGo-BE#496/#497)', () => {
    // ADM-106/107. These are properties rather than paths, so a re-vendor that
    // dropped them would not fail the path checks above — and the console would
    // go on sending codes the contract no longer describes.
    expect(spec).toContain('PlaceAdministrativeSummary:')
    expect(spec).toContain('ImportAdministrativeIdentity:')
    expect(administrativeContracts).toBeTruthy()

    const editBody = spec.slice(spec.indexOf('      operationId: cmsUpdatePlace'))
    expect(editBody.slice(0, 12_000)).toContain('provinceCode:')
    expect(editBody.slice(0, 12_000)).toContain('communeCode:')

    const detail = spec.slice(spec.indexOf('    CmsPlaceDetail:'))
    expect(detail.slice(0, 4_000)).toContain(
      "administrative:\n          $ref: '#/components/schemas/PlaceAdministrativeSummary'",
    )
  })

  it('carries the whole resolve answer the create form now applies (GoGo-BE#501)', () => {
    // PI-BE-021. These are properties on `ResolveLinkResult.candidate`, so a
    // re-vendor that dropped them would pass every path check above while the
    // console silently went back to filling three boxes out of nine.
    const candidate = spec.slice(spec.indexOf('    ResolveLinkResult:'))
    for (const field of [
      'googleMapsUri:',
      'priceLevel:',
      'primaryType:',
      'categoryKey:',
      'openingHours:',
    ]) {
      expect(candidate.slice(0, 8_000)).toContain(field)
    }
    // The administrative preview the province/commune selectors open on.
    expect(candidate.slice(0, 8_000)).toContain('ImportAdministrativeIdentity')
  })

  it('carries the hierarchy counts and the filters they reconcile with (GoGo-BE#502)', () => {
    // ADM-018. The path, the operation and the three list parameters that make
    // a count clickable — a re-vendor that lost any of them would leave the
    // panel reading numbers the table cannot reproduce.
    expect(spec).toContain('/cms/places/administrative-summary:')
    expect(spec).toContain('operationId: cmsPlaceAdministrativeSummary')
    expect(spec).toContain('CmsPlaceAdministrativeSummary:')

    const list = spec.slice(spec.indexOf('      operationId: cmsListPlaces'))
    for (const parameter of [
      'name: provinceCode',
      'name: communeCode',
      'name: administrativeState',
    ]) {
      expect(list.slice(0, 6_000)).toContain(parameter)
    }

    // The list row now names the unit it is in, so the list, the detail and the
    // forms all say a place's address the same way.
    const item = spec.slice(spec.indexOf('    CmsPlaceListItem:'))
    expect(item.slice(0, 2_500)).toContain('administrativeMappingStatus:')
    expect(item.slice(0, 2_500)).toContain('communeName:')
  })

  it('keeps the manual-cost paths that were already on develop', () => {
    // COST-CMS-010 (#106) merged long before the administrative work. The
    // branch it came from still carries an alpha.1 spec, and re-vendoring from
    // that copy is the specific mistake this test refuses to let through.
    expect(spec).toContain('/cms/ops/costs/manual-items:')
    expect(spec).toContain('/cms/ops/costs/manual-items/{id}:')
  })

  it('carries the source-drift adjudication surface from GoGo-BE#484', () => {
    // CMS #155 is built on these. A vendor that lost them would leave the queue
    // calling routes the contract no longer describes.
    for (const path of [
      '/cms/administrative-datasets/{id}/quarantine:',
      '/cms/administrative-datasets/{id}/quarantine/{rowId}:',
      '/cms/administrative-datasets/{id}/override-set:',
      '/cms/administrative-datasets/{id}/quarantine/{rowId}/accept:',
      '/cms/administrative-datasets/{id}/quarantine/{rowId}/reject:',
      '/cms/administrative-datasets/{id}/override-set/materialize:',
      '/cms/administrative-datasets/{id}/override-set/abandon:',
    ]) {
      expect(spec).toContain(path)
    }
  })

  it('describes the queue by more than a code and a count', () => {
    const queue = spec.slice(
      spec.indexOf('  /cms/administrative-datasets/{id}/quarantine:'),
      spec.indexOf('  /cms/administrative-datasets/{id}/quarantine/{rowId}:'),
    )
    // Both filters the screen needs, and the three count groups it must not
    // collapse into one.
    expect(queue).toContain('name: classification')
    expect(queue).toContain('name: decisionState')
    expect(queue).toContain('name: cursor')
    expect(spec).toContain('AdministrativeQuarantineCounts')
    for (const group of ['canonical:', 'backlog:', 'decisions:']) {
      expect(spec).toContain(group)
    }
    // A code alone is not an identity; the effective period travels with it.
    expect(spec).toContain('AdministrativeUnitIdentity')
    expect(spec).toContain('AdministrativeQuarantineDetail')
  })

  it('requires a named target, a reason and the revision on every decision', () => {
    const accept = spec.slice(
      spec.indexOf('  /cms/administrative-datasets/{id}/quarantine/{rowId}/accept:'),
      spec.indexOf('  /cms/administrative-datasets/{id}/quarantine/{rowId}/reject:'),
    )
    expect(accept).toContain('IdempotencyKey')
    expect(accept).toContain('targetCode')
    expect(accept).toContain('targetEffectiveFrom')
    expect(accept).toContain('expectedRevision')
    expect(accept).toContain("'409'")
    expect(accept).toContain('OVERRIDE_SET_REVISION_CONFLICT')
    // There is deliberately no positional way in.
    expect(accept).not.toContain('candidateIndex')
  })

  it('carries the additive validate contract from GoGo-BE#482', () => {
    const validate = spec.slice(
      spec.indexOf('/cms/administrative-datasets/{id}/validate:'),
      spec.indexOf('/cms/administrative-datasets/{id}/publish:'),
    )
    expect(validate).toContain('IdempotencyKey')
    expect(validate).toContain("'409'")
    expect(validate).toContain('DATASET_STATE_NOT_VALIDATABLE')
    expect(validate).toContain('DATASET_CHANGED_DURING_VALIDATION')
    // The refusal is audited under its own action, never as a validation that ran.
    expect(validate).toContain('administrative_dataset.validate_rejected')
  })
})

/**
 * The generated client is what the screens actually import, and it is the half
 * a re-vendor can get wrong silently: `api:check` regenerates and diffs, so a
 * stale `schema.d.ts` fails there — but nothing checks that the *shape* the
 * screens need survived generation.
 */
describe('the generated client', () => {
  it('exposes every source-drift operation by name', () => {
    for (const operation of [
      'listAdministrativeQuarantine',
      'getAdministrativeQuarantineRow',
      'getAdministrativeOverrideSet',
      'acceptAdministrativeQuarantineRow',
      'rejectAdministrativeQuarantineRow',
      'materializeAdministrativeOverrideSet',
      'abandonAdministrativeOverrideSet',
    ]) {
      expect(generated).toContain(`${operation}:`)
    }
  })

  it('generates the Idempotency-Key header and the concurrency field', () => {
    const accept = generated.slice(
      generated.indexOf('acceptAdministrativeQuarantineRow: {'),
      generated.indexOf('rejectAdministrativeQuarantineRow: {'),
    )
    expect(accept).toContain('"Idempotency-Key"')
    expect(accept).toContain('expectedRevision')
    expect(accept).toContain('targetEffectiveFrom')
    // 201 like every other POST in this API, and a documented 409.
    expect(accept).toContain('201:')
    expect(accept).toContain('409:')
  })

  it('keeps the operations the console already ships on', () => {
    for (const operation of [
      'listAdministrativeDatasets',
      'getAdministrativeCapability',
      'validateAdministrativeDataset',
      'publishAdministrativeDataset',
      'rollbackAdministrativeDataset',
      'listAdministrativeMappings',
      'verifyPlaceAdministrativeMapping',
    ]) {
      expect(generated).toContain(`${operation}:`)
    }
  })
})

describe('nothing is hand-written alongside the contract', () => {
  it('declares no CMS-only schema for the source-drift surface', () => {
    /*
     * CMS #155 is not in this PR, and when it arrives its shapes come from the
     * vendored contract. A zod schema for a quarantine row written here would
     * be a second contract that drifts from the first in silence — which is the
     * whole failure this file exists to prevent.
     */
    for (const invented of [
      'quarantineListItemSchema',
      'quarantineDetailSchema',
      'overrideSetSchema',
      'overrideDecisionSchema',
    ]) {
      expect(administrativeContracts).not.toContain(invented)
    }
  })
})
