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
