import { describe, expect, it } from 'vitest'
import { cmsPlaceEditSchema } from '@/shared/api/cmsPlaceContract'
import { placeIdentitySchema, splitFieldErrors, toPlaceEditBody } from './placeForm'

/** What react-hook-form hands the resolver for an untouched form. */
const emptyForm = {
  name: 'Chào Bạn Cafe & Space',
  addressText: '',
  areaKey: '',
  description: '',
  avgVisitMinutes: '',
  lat: '',
  lng: '',
}

describe('place identity form (GoGo-CMS#122)', () => {
  it('sends nothing for an empty number box, instead of 0', () => {
    const result = placeIdentitySchema.safeParse(emptyForm)
    expect(result.success).toBe(true)
    if (!result.success) return
    // The bug: `z.coerce.number()` turned '' into 0, the server requires ≥ 10,
    // and every place with no visit duration became unsaveable.
    expect(result.data.avgVisitMinutes).toBeUndefined()
    // The worse bug: 0,0 is a coordinate the server accepts, so an untouched
    // form moved the place into the Gulf of Guinea.
    expect(result.data.lat).toBeUndefined()
    expect(result.data.lng).toBeUndefined()
  })

  it('produces a body the server schema accepts', () => {
    const result = placeIdentitySchema.parse(emptyForm)
    const body = toPlaceEditBody(result, ['tx-cat-cafe'])
    expect(body.avgVisitMinutes).toBeUndefined()
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('lat')
    // The uuid-strict server schema is the one that used to answer 400.
    expect(cmsPlaceEditSchema.safeParse({ ...body, taxonomyIds: undefined }).success).toBe(true)
  })

  it('holds the same numeric range as the server', () => {
    expect(placeIdentitySchema.safeParse({ ...emptyForm, avgVisitMinutes: '9' }).success).toBe(
      false,
    )
    expect(placeIdentitySchema.safeParse({ ...emptyForm, avgVisitMinutes: '10' }).success).toBe(
      true,
    )
    expect(placeIdentitySchema.safeParse({ ...emptyForm, avgVisitMinutes: '721' }).success).toBe(
      false,
    )
    expect(placeIdentitySchema.safeParse({ ...emptyForm, avgVisitMinutes: '90.5' }).success).toBe(
      false,
    )
  })

  it('holds the same text lengths as the server', () => {
    expect(
      placeIdentitySchema.safeParse({ ...emptyForm, addressText: 'x'.repeat(400) }).success,
    ).toBe(true)
    expect(
      placeIdentitySchema.safeParse({ ...emptyForm, addressText: 'x'.repeat(401) }).success,
    ).toBe(false)
    expect(placeIdentitySchema.safeParse({ ...emptyForm, areaKey: 'x'.repeat(64) }).success).toBe(
      true,
    )
    expect(placeIdentitySchema.safeParse({ ...emptyForm, areaKey: 'x'.repeat(65) }).success).toBe(
      false,
    )
    expect(placeIdentitySchema.safeParse({ ...emptyForm, name: '   ' }).success).toBe(false)
  })

  it('refuses half a coordinate, which the server would silently ignore', () => {
    const result = placeIdentitySchema.safeParse({ ...emptyForm, lat: '10.77' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]).toMatchObject({
      path: ['lng'],
      message: 'placeEditor.error.coordinatePair',
    })
    expect(
      placeIdentitySchema.safeParse({ ...emptyForm, lat: '10.77', lng: '106.7' }).success,
    ).toBe(true)
  })

  it('keeps a server field error nobody can point at', () => {
    const { mapped, unmapped } = splitFieldErrors([
      { field: 'avgVisitMinutes', code: 'too_small', message: 'x' },
      { field: 'taxonomyIds.4', code: 'invalid_string', message: 'y' },
      { field: '(root)', code: 'custom', message: 'z' },
    ])
    expect(mapped.map((error) => error.field)).toEqual(['avgVisitMinutes'])
    // Nothing is swallowed: the editor still gets to see the other two.
    expect(unmapped.map((error) => error.field)).toEqual(['taxonomyIds.4', '(root)'])
  })
})
