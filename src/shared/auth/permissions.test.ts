import { describe, expect, it } from 'vitest'
import { canAccess, landingPathFor, roleCan } from './permissions'

/**
 * These mirror GoGo-BE's `AdminGuard` (GoGo-BE#144). If one of them starts
 * failing, check the guard before changing the expectation — the server is the
 * source of truth, this file is the copy.
 */
describe('read is hierarchical, write is exact', () => {
  it('lets every staff role read the catalog, and only the editor write it', () => {
    for (const role of ['editor', 'moderator', 'ops_admin', 'super_admin'] as const) {
      expect(roleCan(role, 'place.read')).toBe(true)
    }
    expect(roleCan('editor', 'place.write')).toBe(true)
    expect(roleCan('super_admin', 'place.write')).toBe(true)
    // ops_admin publishes imports that create places but may not edit them.
    expect(roleCan('ops_admin', 'place.write')).toBe(false)
    expect(roleCan('moderator', 'place.write')).toBe(false)
  })

  it('lets every staff role read the moderation queue, and only the moderator decide', () => {
    for (const role of ['editor', 'moderator', 'ops_admin', 'super_admin'] as const) {
      expect(roleCan(role, 'moderation.read')).toBe(true)
    }
    expect(roleCan('moderator', 'moderation.decide')).toBe(true)
    expect(roleCan('ops_admin', 'moderation.decide')).toBe(false)
    expect(roleCan('editor', 'moderation.decide')).toBe(false)
  })

  it('never lets a lower rank read above it', () => {
    // `ops` routes ask for ops_admin (rank 2); rank-1 peers cannot read them.
    expect(roleCan('editor', 'ops.dashboard')).toBe(false)
    expect(roleCan('moderator', 'ops.dashboard')).toBe(false)
    expect(roleCan('ops_admin', 'ops.dashboard')).toBe(true)
    expect(roleCan('super_admin', 'ops.dashboard')).toBe(true)
  })

  it('keeps import publish ops-only while the rest of ingestion stays shared', () => {
    expect(roleCan('editor', 'import.manage')).toBe(true)
    expect(roleCan('ops_admin', 'import.manage')).toBe(true)
    expect(roleCan('editor', 'import.publish')).toBe(false)
    expect(roleCan('ops_admin', 'import.publish')).toBe(true)
    // Reading the job list is a safe method, so a moderator on shift can look.
    expect(roleCan('moderator', 'import.read')).toBe(true)
  })

  it('lets editor and ops both write editorial content', () => {
    expect(roleCan('editor', 'taxonomy.manage')).toBe(true)
    expect(roleCan('ops_admin', 'collection.manage')).toBe(true)
    expect(roleCan('moderator', 'collection.manage')).toBe(false)
  })

  it('lets anyone on shift take content down', () => {
    for (const role of ['editor', 'moderator', 'ops_admin', 'super_admin'] as const) {
      expect(roleCan(role, 'emergency.takedown')).toBe(true)
    }
  })

  it('opens the audit log to every role, because it is declared on editor', () => {
    // `CmsAuditController` is @RequireRole('editor') (rank 1), so rank-based
    // read reaches it from every role — an editor needs to know who last
    // touched a place as much as ops does.
    for (const role of ['editor', 'moderator', 'ops_admin', 'super_admin'] as const) {
      expect(roleCan(role, 'audit.read')).toBe(true)
    }
  })

  it('keeps experiments and search analytics on the ops controller', () => {
    expect(roleCan('ops_admin', 'experiment.manage')).toBe(true)
    expect(roleCan('super_admin', 'experiment.manage')).toBe(true)
    expect(roleCan('editor', 'experiment.read')).toBe(false)
    expect(roleCan('moderator', 'searchAnalytics.read')).toBe(false)
    expect(roleCan('ops_admin', 'searchAnalytics.read')).toBe(true)
    // Evaluating a config is a GET on the same ops controller.
    expect(roleCan('editor', 'ranking.evaluate')).toBe(false)
    expect(roleCan('ops_admin', 'ranking.evaluate')).toBe(true)
  })

  it('reserves admin creation for super admin, reads included', () => {
    expect(roleCan('ops_admin', 'admin.create')).toBe(false)
    expect(canAccess('ops_admin', 'admins', 'read')).toBe(false)
    expect(roleCan('super_admin', 'admin.create')).toBe(true)
  })

  it('grants nothing without a role', () => {
    expect(roleCan(null, 'place.read')).toBe(false)
    expect(canAccess(undefined, 'catalog', 'read')).toBe(false)
  })

  it('lands every role on a screen it can act on, not merely read', () => {
    expect(landingPathFor('moderator')).toBe('/moderation')
    expect(landingPathFor('editor')).toBe('/places')
    expect(landingPathFor('ops_admin')).toBe('/')
  })
})

/**
 * CMS #153 — the administrative surface, mirroring GoGo-BE#458 and #462.
 *
 * The separation of duties is the point and it is deliberate: the person who
 * decides a place belongs in the catalogue is not the person who certifies
 * where it is, and neither of them publishes the dataset both depend on.
 */
describe('administrative surface', () => {
  it('lets every staff role read the mapping queue, and only the moderator decide', () => {
    for (const role of ['editor', 'moderator', 'ops_admin', 'super_admin'] as const) {
      expect(roleCan(role, 'administrativeMapping.read')).toBe(true)
    }
    expect(roleCan('moderator', 'administrativeMapping.review')).toBe(true)
    expect(roleCan('super_admin', 'administrativeMapping.review')).toBe(true)
    // The editor approves places and cannot certify where they are.
    expect(roleCan('editor', 'administrativeMapping.review')).toBe(false)
    // Ops publishes the dataset and does not thereby gain the moderator's job.
    expect(roleCan('ops_admin', 'administrativeMapping.review')).toBe(false)
  })

  it('keeps the dataset ops-only, readable from rank 2 up', () => {
    expect(roleCan('ops_admin', 'administrativeDataset.read')).toBe(true)
    expect(roleCan('super_admin', 'administrativeDataset.read')).toBe(true)
    // Rank 1 cannot read above itself, exactly as the guard decides.
    expect(roleCan('editor', 'administrativeDataset.read')).toBe(false)
    expect(roleCan('moderator', 'administrativeDataset.read')).toBe(false)

    expect(roleCan('ops_admin', 'administrativeDataset.manage')).toBe(true)
    expect(roleCan('moderator', 'administrativeDataset.manage')).toBe(false)
    expect(roleCan('editor', 'administrativeDataset.manage')).toBe(false)
  })

  it('does not let the moderator publish a place, nor the editor verify its mapping', () => {
    // The two halves of the approval policy, and neither role holds both.
    expect(roleCan('moderator', 'place.write')).toBe(false)
    expect(roleCan('editor', 'administrativeMapping.review')).toBe(false)
    expect(roleCan('editor', 'place.write')).toBe(true)
    expect(roleCan('moderator', 'administrativeMapping.review')).toBe(true)
  })

  it('gives super_admin both, which is the audited escape hatch and not a fourth role', () => {
    expect(roleCan('super_admin', 'administrativeMapping.review')).toBe(true)
    expect(roleCan('super_admin', 'administrativeDataset.manage')).toBe(true)
    expect(roleCan('super_admin', 'place.write')).toBe(true)
  })

  it('refuses everything to a signed-out caller', () => {
    for (const permission of [
      'administrativeMapping.read',
      'administrativeMapping.review',
      'administrativeDataset.read',
      'administrativeDataset.manage',
    ] as const) {
      expect(roleCan(null, permission)).toBe(false)
      expect(roleCan(undefined, permission)).toBe(false)
    }
  })

  it('mirrors the guard rule directly, group by group', () => {
    expect(canAccess('editor', 'administrativeMapping', 'read')).toBe(true)
    expect(canAccess('editor', 'administrativeMapping', 'write')).toBe(false)
    expect(canAccess('moderator', 'administrativeDataset', 'read')).toBe(false)
    expect(canAccess('ops_admin', 'administrativeDataset', 'write')).toBe(true)
  })
})
