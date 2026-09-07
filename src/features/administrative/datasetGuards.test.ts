import { describe, expect, it } from 'vitest'
import type {
  AdministrativeCapability,
  AdministrativeDatasetDetail,
} from '@/shared/api/contracts-administrative'
import {
  capabilityFacts,
  orderedCategories,
  publishBlock,
  rollbackBlock,
  stale,
  validateBlock,
} from './datasetGuards'

const OK = { canManage: true, online: true }

function detail(over: Partial<AdministrativeDatasetDetail> = {}): AdministrativeDatasetDetail {
  const base: AdministrativeDatasetDetail = {
    id: 'ds-1',
    combinedDatasetVersion: 'v5.0.0+v2.4.1+7fac+none+r0',
    combinedChecksum: 'sum-1',
    status: 'VALIDATED',
    effectiveDate: '2025-07-01',
    overrideRevision: 0,
    sources: {
      currentSourceVersion: 'v5.0.0',
      historicalSourceVersion: 'v2.4.1',
      mappingSourceCommit: '7fac',
      boundarySourceVersion: 'v5.0.0',
    },
    importedAt: '2026-09-01T00:00:00.000Z',
    publishedAt: null,
    validation: {
      validationId: 'val-1',
      validatorVersion: 'adm-004.1',
      ranAt: '2026-09-01T01:00:00.000Z',
      errors: 0,
      warnings: 2,
      publishable: true,
      warningGates: ['commune_code_reuse'],
    },
    validationReport: null,
    diffSummary: null,
  }
  return { ...base, ...over }
}

/**
 * These mirror GoGo-BE's `publishRefusal` / `rollbackRefusal`, in its order.
 * If one starts failing, read the gate before changing the expectation — the
 * server is the authority and this file is the copy an operator sees first.
 */
describe('publish', () => {
  it('offers a validated, error-free version', () => {
    expect(publishBlock(detail(), OK)).toBeNull()
  })

  it('lets a version publish on warnings alone', () => {
    // The 2025 reorganisation legitimately trips two gates. A publication path
    // a warning could block would teach reviewers to suppress warnings.
    const block = publishBlock(
      detail({
        validation: {
          validationId: 'v',
          validatorVersion: 'adm-004.1',
          ranAt: '2026-09-01T01:00:00.000Z',
          errors: 0,
          warnings: 1034,
          publishable: true,
          warningGates: ['commune_code_reuse', 'quarantined_change_rows'],
        },
      }),
      OK,
    )
    expect(block).toBeNull()
  })

  it('refuses on a single ERROR, and says so with the count', () => {
    const block = publishBlock(
      detail({
        validation: {
          validationId: 'v',
          validatorVersion: 'adm-004.1',
          ranAt: '2026-09-01T01:00:00.000Z',
          errors: 3,
          warnings: 0,
          publishable: false,
          warningGates: [],
        },
      }),
      OK,
    )
    expect(block?.code).toBe('VALIDATION_HAS_ERRORS')
    expect(block?.values).toEqual({ errors: 3 })
  })

  it('never lets a client override an ERROR by any route', () => {
    // `publishable` and `errors` disagree only if something is wrong; either
    // one alone is enough to refuse.
    for (const validation of [
      { errors: 0, publishable: false },
      { errors: 2, publishable: true },
    ]) {
      const block = publishBlock(
        detail({
          validation: {
            validationId: 'v',
            validatorVersion: 'adm-004.1',
            ranAt: '2026-09-01T01:00:00.000Z',
            warnings: 0,
            warningGates: [],
            ...validation,
          },
        }),
        OK,
      )
      expect(block?.code).toBe('VALIDATION_HAS_ERRORS')
    }
  })

  it('refuses each lifecycle state with its own reason', () => {
    expect(publishBlock(detail({ status: 'PUBLISHED' }), OK)?.code).toBe(
      'DATASET_ALREADY_PUBLISHED',
    )
    expect(publishBlock(detail({ status: 'REJECTED' }), OK)?.code).toBe('DATASET_REJECTED')
    expect(publishBlock(detail({ status: 'STAGED', validation: null }), OK)?.code).toBe(
      'DATASET_NOT_VALIDATED',
    )
    expect(publishBlock(detail({ status: 'ROLLED_BACK', validation: null }), OK)?.code).toBe(
      'DATASET_NOT_VALIDATED',
    )
  })

  it('names the errors, not the lifecycle, when a failed validation caused the lifecycle', () => {
    // GoGo-BE puts a failing validation back to STAGED. "Validate it first" is
    // the one instruction that would be wrong here.
    const block = publishBlock(
      detail({
        status: 'STAGED',
        validation: {
          validationId: 'v',
          validatorVersion: 'adm-004.1',
          ranAt: '2026-09-01T01:00:00.000Z',
          errors: 2,
          warnings: 1,
          publishable: false,
          warningGates: [],
        },
      }),
      OK,
    )
    expect(block?.code).toBe('VALIDATION_HAS_ERRORS')
    expect(block?.values).toEqual({ errors: 2 })
  })

  it('refuses a version with no stored validation', () => {
    expect(publishBlock(detail({ validation: null }), OK)?.code).toBe('VALIDATION_MISSING')
  })

  it('refuses a validation bound to something else', () => {
    const bound = {
      datasetVersionId: 'ds-1',
      combinedDatasetVersion: 'v5.0.0+v2.4.1+7fac+none+r0',
      combinedChecksum: 'sum-1',
      snapshotFingerprint: 'fp-1',
      overrideRevision: 0,
    }
    for (const drift of [
      { datasetVersionId: 'ds-2' },
      { combinedDatasetVersion: 'v5.1.0+v2.4.1+7fac+none+r0' },
      { combinedChecksum: 'sum-2' },
      { overrideRevision: 1 },
    ]) {
      const data = detail({
        validationReport: {
          datasetVersion: 'v5.0.0+v2.4.1+7fac+none+r0',
          ranAt: '2026-09-01T01:00:00.000Z',
          findings: [],
          errors: 0,
          warnings: 0,
          publishable: true,
          counts: {
            currentProvinces: 34,
            currentCommunes: 3321,
            historicalProvinces: 63,
            historicalDistricts: 705,
            historicalCommunes: 10598,
            canonicalChanges: 10598,
            quarantined: 1033,
          },
          validationId: 'val-1',
          validatorVersion: 'adm-004.1',
          boundTo: { ...bound, ...drift },
        },
      })
      expect(stale(data)).toBe(true)
      expect(publishBlock(data, OK)?.code).toBe('VALIDATION_STALE')
    }
  })

  it('refuses a role that may read but not manage, and says which', () => {
    expect(publishBlock(detail(), { canManage: false, online: true })?.code).toBe('NO_PERMISSION')
    expect(publishBlock(detail(), { canManage: true, online: false })?.code).toBe('OFFLINE')
  })
})

describe('rollback', () => {
  const restored = detail({ status: 'ROLLED_BACK', publishedAt: '2026-08-01T00:00:00.000Z' })

  it('offers a previously published version the server lists as restorable', () => {
    expect(rollbackBlock(restored, { ...OK, restorable: true })).toBeNull()
  })

  it('refuses a version that was never published', () => {
    expect(rollbackBlock(detail(), { ...OK, restorable: false })?.code).toBe(
      'DATASET_NEVER_PUBLISHED',
    )
  })

  it('refuses the already active version', () => {
    expect(
      rollbackBlock(detail({ status: 'PUBLISHED', publishedAt: '2026-09-01T00:00:00.000Z' }), {
        ...OK,
        restorable: false,
      })?.code,
    ).toBe('DATASET_ALREADY_PUBLISHED')
  })

  it('offers nothing the server left out of the restorable list', () => {
    // The server decides; a row that merely looks restorable from here is not.
    expect(rollbackBlock(restored, { ...OK, restorable: false })?.code).toBe(
      'DATASET_NOT_RESTORABLE',
    )
  })
})

describe('validate', () => {
  it('offers a staged or validated version', () => {
    expect(validateBlock({ status: 'STAGED' }, OK)).toBeNull()
    expect(validateBlock({ status: 'VALIDATED' }, OK)).toBeNull()
  })

  /*
   * GoGo-BE's validate writes `publishable ? VALIDATED : STAGED` with no
   * lifecycle guard, so validating the active version would demote it out of
   * PUBLISHED and leave the environment with no active dataset, and validating
   * a ROLLED_BACK version would drop it out of the restorable set. Neither is
   * something an operator asked for, so the screen does not offer it.
   */
  it('does not offer to validate the active version, or a restorable one', () => {
    expect(validateBlock({ status: 'PUBLISHED' }, OK)?.code).toBe('NOT_VALIDATABLE')
    expect(validateBlock({ status: 'ROLLED_BACK' }, OK)?.code).toBe('NOT_VALIDATABLE')
    expect(validateBlock({ status: 'REJECTED' }, OK)?.code).toBe('NOT_VALIDATABLE')
  })
})

describe('capability', () => {
  const base: AdministrativeCapability = {
    dataset: {
      state: 'AVAILABLE',
      version: 'v5.0.0+v2.4.1+7fac+none+r0',
      publishedAt: '2026-09-01T00:00:00.000Z',
      ageSeconds: 10,
      counts: { PUBLISHED: 1 },
      quarantined: 1033,
      unresolved: 1033,
      validation: { errors: 0, warnings: 2 },
    },
    boundaries: {
      state: 'AVAILABLE',
      version: 'v5.0.0',
      loadedAt: '2026-09-01T00:00:00.000Z',
      ageSeconds: 10,
      provinces: 34,
      communes: 3321,
    },
    resolver: 'FULL',
    publication: 'ENABLED',
    mappings: {},
    remediation: {},
    observedAt: '2026-09-01T00:00:00.000Z',
  }
  const toneOf = (capability: AdministrativeCapability, id: string) =>
    capabilityFacts(capability).find((fact) => fact.id === id)?.tone

  it('reports every facet on its own, because they fail independently', () => {
    expect(capabilityFacts(base).every((fact) => fact.tone === 'mint')).toBe(true)
  })

  it('treats a missing boundary release as degraded, not as an outage', () => {
    const partial = {
      ...base,
      boundaries: { ...base.boundaries, state: 'MISSING' as const },
      resolver: 'PARTIAL' as const,
    }
    expect(toneOf(partial, 'boundaries')).toBe('amber')
    expect(toneOf(partial, 'resolver')).toBe('amber')
    // The dataset is still there, so place approval is not affected by this.
    expect(toneOf(partial, 'dataset')).toBe('mint')
    expect(toneOf(partial, 'publication')).toBe('mint')
  })

  it('treats a missing dataset as the thing that stops work', () => {
    const missing = {
      ...base,
      dataset: { ...base.dataset, state: 'MISSING' as const, version: null },
      publication: 'BLOCKED' as const,
    }
    expect(toneOf(missing, 'dataset')).toBe('danger')
    expect(toneOf(missing, 'publication')).toBe('danger')
  })

  it('reports an errored facet as an error rather than as absence', () => {
    expect(toneOf({ ...base, dataset: { ...base.dataset, state: 'ERROR' } }, 'dataset')).toBe(
      'danger',
    )
    expect(
      toneOf({ ...base, boundaries: { ...base.boundaries, state: 'ERROR' } }, 'boundaries'),
    ).toBe('danger')
    expect(toneOf({ ...base, resolver: 'UNAVAILABLE' }, 'resolver')).toBe('danger')
  })
})

describe('diff categories', () => {
  it('keeps the contract order and appends anything the server invents', () => {
    expect(orderedCategories({ SOURCE_DRIFT: 1, CREATED: 2, WHAT_IS_THIS: 3 })).toEqual([
      'CREATED',
      'SOURCE_DRIFT',
      'WHAT_IS_THIS',
    ])
  })
})
