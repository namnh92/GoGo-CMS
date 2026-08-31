import { describe, expect, it } from 'vitest'
import { formatFlagValue, parseFlagValue, resolveOverride } from './flagValue'

describe('flag value parsing (CMS-030)', () => {
  it('keeps an explicit falsy value distinct from no value at all', () => {
    // The whole reason the catalog returns `defaultValue`: 0 and "" and false
    // are settings, not absence.
    expect(formatFlagValue(0, 'number')).toBe('0')
    expect(formatFlagValue('', 'string')).toBe('')
    expect(formatFlagValue(false, 'boolean')).toBe('false')
    expect(formatFlagValue(undefined, 'number')).toBe('')
    expect(formatFlagValue(null, 'string')).toBe('')
  })

  it('accepts an empty string as a real value for a string key', () => {
    expect(parseFlagValue('', 'string')).toEqual({ ok: true, value: '' })
  })

  it('refuses an empty value where the type needs one', () => {
    expect(parseFlagValue('   ', 'number')).toEqual({ ok: false, error: 'required' })
    expect(parseFlagValue('', 'version')).toEqual({ ok: false, error: 'required' })
  })

  it('validates numbers, versions and JSON the way the server does', () => {
    expect(parseFlagValue('12', 'number')).toEqual({ ok: true, value: 12 })
    expect(parseFlagValue('0', 'number')).toEqual({ ok: true, value: 0 })
    expect(parseFlagValue('abc', 'number')).toEqual({ ok: false, error: 'number' })

    expect(parseFlagValue('1.2.3', 'version')).toEqual({ ok: true, value: '1.2.3' })
    expect(parseFlagValue('1.2', 'version')).toEqual({ ok: false, error: 'version' })

    expect(parseFlagValue('{"a":1}', 'json')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseFlagValue('{a:1}', 'json')).toEqual({ ok: false, error: 'json' })
  })

  it('sends no value for a boolean key — `enabled` is the value', () => {
    expect(parseFlagValue('anything', 'boolean')).toEqual({ ok: true, value: undefined })
  })
})

describe('override resolution (CMS-030)', () => {
  const rows = [
    { key: 'k', environment: 'all', platform: 'all' },
    { key: 'k', environment: 'production', platform: 'ios' },
    { key: 'other', environment: 'all', platform: 'all' },
  ]

  it('prefers the narrower row for its own scope', () => {
    expect(resolveOverride(rows, 'k', 'production', 'ios')).toEqual({
      key: 'k',
      environment: 'production',
      platform: 'ios',
    })
  })

  it('falls back to the unscoped row elsewhere', () => {
    expect(resolveOverride(rows, 'k', 'staging', 'android')).toEqual({
      key: 'k',
      environment: 'all',
      platform: 'all',
    })
  })

  it('returns nothing when the key has no row at all', () => {
    expect(resolveOverride(rows, 'missing', 'all', 'all')).toBeUndefined()
  })
})
