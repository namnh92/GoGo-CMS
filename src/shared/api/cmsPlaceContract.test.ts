import { describe, expect, it } from 'vitest'
import {
  PLACE_CLEARABLE_FIELDS,
  PLACE_FIELD_LIMITS,
  PLACE_HOURS_LIMITS,
  PLACE_MEDIA_LIMITS,
  cmsPlaceEditSchema,
  cmsPlaceHoursSchema,
  cmsPlaceMediaAttachSchema,
  cmsPlaceMediaPatchSchema,
  moderationReasonMissing,
  placeFieldLimit,
  toFieldErrors,
} from './cmsPlaceContract'

/**
 * These numbers are GoGo-BE's, copied from `placeEditSchema` / `hoursSchema` in
 * `libs/modules/cms/presentation/cms.controllers.ts`. Spelling them out here
 * means a change on either side fails a test instead of surfacing as a
 * "Request validation failed" toast (GoGo-CMS#122).
 */
describe('CMS place write contract', () => {
  it('states the limits GoGo-BE enforces', () => {
    expect(PLACE_FIELD_LIMITS.name).toMatchObject({ min: 1, max: 200 })
    expect(PLACE_FIELD_LIMITS.description.max).toBe(4000)
    expect(PLACE_FIELD_LIMITS.addressText.max).toBe(400)
    expect(PLACE_FIELD_LIMITS.areaKey.max).toBe(64)
    // GoGo-BE#425 made the administrative address and the contact writable.
    expect(PLACE_FIELD_LIMITS.city.max).toBe(120)
    expect(PLACE_FIELD_LIMITS.district.max).toBe(120)
    expect(PLACE_FIELD_LIMITS.phone.max).toBe(40)
    expect(PLACE_FIELD_LIMITS.website.max).toBe(500)
    expect(PLACE_FIELD_LIMITS.lat).toMatchObject({ min: -90, max: 90 })
    expect(PLACE_FIELD_LIMITS.lng).toMatchObject({ min: -180, max: 180 })
    expect(PLACE_FIELD_LIMITS.avgVisitMinutes).toMatchObject({ min: 10, max: 720, integer: true })
    expect(PLACE_FIELD_LIMITS.curatedRank).toMatchObject({ min: 0, integer: true })
    expect(PLACE_FIELD_LIMITS.taxonomyIds.max).toBe(30)
    expect(PLACE_HOURS_LIMITS).toMatchObject({
      // Raised from 21 by GoGo-BE#425, when a day gained the right to hold
      // more than one service. This assertion failing is the mirror doing its
      // job: the number moved on the server, so it moves here deliberately.
      maxRows: 28,
      maxIntervalsPerDay: 4,
      kinds: ['interval', 'closed', 'open_24h'],
      dayOfWeek: { min: 0, max: 6 },
      minuteOfDay: { min: 0, max: 1439 },
    })
  })

  it('refuses the avgVisitMinutes the old editor sent for an empty box', () => {
    const result = cmsPlaceEditSchema.safeParse({ avgVisitMinutes: 0 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(toFieldErrors(result.error.issues)).toEqual([
      {
        field: 'avgVisitMinutes',
        code: 'too_small',
        message: 'Number must be greater than or equal to 10',
      },
    ])
  })

  it('accepts a body with no optional field at all', () => {
    expect(cmsPlaceEditSchema.safeParse({}).success).toBe(true)
  })

  it('takes null on every clearable field, and only on those', () => {
    // `null` clears, an absent key leaves it alone (GoGo-BE#425). Getting this
    // wrong is not a type error anywhere — it is a value that cannot be erased.
    for (const field of PLACE_CLEARABLE_FIELDS) {
      expect(cmsPlaceEditSchema.safeParse({ [field]: null }).success).toBe(true)
    }
    // `name` is required, so empty is a rejection rather than an instruction,
    // and a coordinate has no null in the contract: a pin moves, never leaves.
    expect(cmsPlaceEditSchema.safeParse({ name: null }).success).toBe(false)
    expect(cmsPlaceEditSchema.safeParse({ lat: null }).success).toBe(false)
    expect(cmsPlaceEditSchema.safeParse({ lng: null }).success).toBe(false)
  })

  it('takes the loaded version as expectedUpdatedAt, and only an ISO one', () => {
    expect(
      cmsPlaceEditSchema.safeParse({ expectedUpdatedAt: '2026-03-02T10:30:00.000Z' }).success,
    ).toBe(true)
    expect(cmsPlaceEditSchema.safeParse({ expectedUpdatedAt: '2026-03-02' }).success).toBe(false)
  })

  it('reports a nested path the way ZodValidationPipe does', () => {
    const result = cmsPlaceHoursSchema.safeParse({
      hours: [{ dayOfWeek: 1, openMinute: 480, closeMinute: 1440, isOvernight: false }],
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(toFieldErrors(result.error.issues)[0]).toMatchObject({
      field: 'hours.0.closeMinute',
      code: 'too_big',
    })
  })

  it('finds the rule behind a dotted server path', () => {
    // The rule belongs to the named segment, never to the array index.
    expect(placeFieldLimit('hours.0.closeMinute')).toMatchObject({ min: 0, max: 1439 })
    expect(placeFieldLimit('taxonomyIds.4')).toMatchObject({ kind: 'list', max: 30 })
    expect(placeFieldLimit('(root)')).toBeUndefined()
  })

  it('names the root when the body itself is the wrong shape', () => {
    const result = cmsPlaceHoursSchema.safeParse([])
    expect(result.success).toBe(false)
    if (result.success) return
    expect(toFieldErrors(result.error.issues)[0]?.field).toBe('(root)')
  })
})

/**
 * `POST|PATCH /cms/places/{placeId}/media` (GoGo-BE#191). Same discipline: the
 * numbers are GoGo-BE's, spelled out so a change on either side fails a test
 * rather than turning up as a rejected save nobody can explain.
 */
describe('CMS place media write contract', () => {
  it('states the limits GoGo-BE enforces', () => {
    expect(PLACE_MEDIA_LIMITS.maxUploadBytes).toBe(10 * 1024 * 1024)
    expect(PLACE_MEDIA_LIMITS.storageKey.max).toBe(400)
    expect(PLACE_MEDIA_LIMITS.caption.max).toBe(300)
    expect(PLACE_MEDIA_LIMITS.attribution.max).toBe(300)
    expect(PLACE_MEDIA_LIMITS.moderationReason).toMatchObject({ min: 3, max: 500 })
    expect(PLACE_MEDIA_LIMITS.sortOrder).toMatchObject({ min: 0, max: 999 })
  })

  it('refuses an empty patch rather than writing an audit row for nothing', () => {
    expect(cmsPlaceMediaPatchSchema.safeParse({}).success).toBe(false)
    expect(cmsPlaceMediaPatchSchema.safeParse({ sortOrder: 3 }).success).toBe(true)
  })

  it('needs a reason only when the decision actually changes', () => {
    // Re-sending the state a photo is already in is not a decision.
    expect(moderationReasonMissing('pending', { moderation: 'pending' })).toBe(false)
    expect(moderationReasonMissing('pending', { moderation: 'approved' })).toBe(true)
    expect(
      moderationReasonMissing('pending', { moderation: 'approved', moderationReason: 'ok' }),
    ).toBe(true)
    expect(
      moderationReasonMissing('pending', { moderation: 'approved', moderationReason: 'quá mờ' }),
    ).toBe(false)
    // Reordering touches no decision, so it needs no reason.
    expect(moderationReasonMissing('approved', {})).toBe(false)
  })

  it('takes a key, never bytes', () => {
    expect(cmsPlaceMediaAttachSchema.safeParse({ storageKey: '' }).success).toBe(false)
    expect(
      cmsPlaceMediaAttachSchema.safeParse({ storageKey: 'cms/place_image/a/b.jpg' }).success,
    ).toBe(true)
  })
})
