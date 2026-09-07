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

const EXPECTED = '1.0.0-alpha.9'

describe('the vendored OpenAPI contract', () => {
  it(`declares ${EXPECTED}, and the drift gate expects the same`, () => {
    expect(/^ {2}version: (\S+)$/m.exec(spec)?.[1]).toBe(EXPECTED)
    expect(drift).toContain(`?? '${EXPECTED}'`)
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

  it('keeps the manual-cost paths that were already on develop', () => {
    // COST-CMS-010 (#106) merged long before the administrative work. The
    // branch it came from still carries an alpha.1 spec, and re-vendoring from
    // that copy is the specific mistake this test refuses to let through.
    expect(spec).toContain('/cms/ops/costs/manual-items:')
    expect(spec).toContain('/cms/ops/costs/manual-items/{id}:')
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
