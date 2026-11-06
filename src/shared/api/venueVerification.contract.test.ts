import { describe, expect, it } from 'vitest'
import { cmsPlaceDetailSchema, cmsVenueVerificationSchema } from './contracts'
import type { Schemas } from './generated'
import { places } from '@/shared/test/fixtures'

const verification = {
  status: 'verified',
  verifiedAt: '2026-11-06T08:00:00.000Z',
  identityRevision: 2,
  version: 1,
  etag: '"2:1"',
} satisfies Schemas['CmsVenueVerification']

describe('CMS venue verification boundary (6.0)', () => {
  it('preserves independent venue verification and its concurrency facts', () => {
    expect(cmsPlaceDetailSchema.parse({ ...places[0]!, verification })).toHaveProperty(
      'verification',
      verification,
    )
  })

  it('accepts an unverified venue with no verification timestamp', () => {
    const unverified = { status: 'unverified', identityRevision: 1, version: 0, etag: '"1:0"' }
    expect(cmsPlaceDetailSchema.parse({ ...places[0]!, verification: unverified })).toHaveProperty(
      'verification',
      unverified,
    )
  })

  it('accepts existing detail responses without the optional verification', () => {
    expect(cmsPlaceDetailSchema.safeParse(places[0]).success).toBe(true)
  })
})

describe('verification mutation response boundary', () => {
  it('retains the next opaque ETag for a subsequent revoke', () => {
    expect(cmsVenueVerificationSchema.parse(verification)).toEqual(verification)
  })

  it.each([
    { ...verification, etag: undefined },
    { ...verification, identityRevision: 0 },
    { ...verification, version: -1 },
    { ...verification, status: 'approved' },
  ])('refuses malformed concurrency/state facts: %j', (response) => {
    expect(cmsVenueVerificationSchema.safeParse(response).success).toBe(false)
  })
})
