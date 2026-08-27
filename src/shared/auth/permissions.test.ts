import { describe, expect, it } from 'vitest'
import { landingPathFor, roleCan } from './permissions'

describe('permission matrix', () => {
  it('keeps import publish ops-only', () => {
    expect(roleCan('editor', 'import.publish')).toBe(false)
    expect(roleCan('ops_admin', 'import.publish')).toBe(true)
    expect(roleCan('super_admin', 'import.publish')).toBe(true)
  })

  it('keeps a moderator out of the catalog and an editor out of moderation decisions', () => {
    expect(roleCan('moderator', 'place.write')).toBe(false)
    expect(roleCan('editor', 'moderation.decide')).toBe(false)
    // Both may decide on user-submitted places, though.
    expect(roleCan('editor', 'submission.decide')).toBe(true)
    expect(roleCan('moderator', 'submission.decide')).toBe(true)
  })

  it('reserves admin creation for super admin', () => {
    expect(roleCan('ops_admin', 'admin.create')).toBe(false)
    expect(roleCan('super_admin', 'admin.create')).toBe(true)
  })

  it('lands every role on a screen it can actually use', () => {
    expect(landingPathFor('moderator')).toBe('/moderation')
    expect(landingPathFor('editor')).toBe('/places')
    expect(landingPathFor('ops_admin')).toBe('/')
  })

  it('never grants anything without a role', () => {
    expect(roleCan(null, 'place.read')).toBe(false)
  })
})
