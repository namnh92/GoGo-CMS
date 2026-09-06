import { describe, expect, it } from 'vitest'
import { cmsPlaceEditSchema } from '@/shared/api/cmsPlaceContract'
import {
  diffAgainstServer,
  placeIdentitySchema,
  splitFieldErrors,
  toPlaceEditBody,
  type PlaceEditBaseline,
} from './placeForm'

/** What react-hook-form hands the resolver for an untouched form. */
const emptyForm = {
  name: 'Chào Bạn Cafe & Space',
  addressText: '',
  areaKey: '',
  city: '',
  district: '',
  phone: '',
  website: '',
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

/**
 * GoGo-CMS#123 — `null` clears a field, an absent key leaves it alone, and only
 * a field that actually changed goes on the wire at all.
 */
describe('place edit body against a baseline (GoGo-CMS#123)', () => {
  const loaded = placeIdentitySchema.parse({
    ...emptyForm,
    addressText: '126 Nguyễn Thị Minh Khai',
    areaKey: 'hcm_q3',
    city: 'TP.HCM',
    district: 'Quận 3',
    phone: '+842839301234',
    website: 'https://chaoban.cafe',
    description: 'Cà phê ba tầng',
    avgVisitMinutes: '90',
  })
  const baseline: PlaceEditBaseline = {
    values: loaded,
    taxonomyIds: ['tx-cat-cafe'],
    updatedAt: '2026-03-02T10:30:00.000Z',
  }

  it('sends nothing but the version when nothing changed', () => {
    const body = toPlaceEditBody(loaded, ['tx-cat-cafe'], baseline)
    // A save of one field must not restamp seven others as editorial.
    expect(Object.keys(body)).toEqual(['expectedUpdatedAt'])
    expect(body.expectedUpdatedAt).toBe('2026-03-02T10:30:00.000Z')
  })

  it('sends null for every emptied clearable box', () => {
    const emptied = placeIdentitySchema.parse({ ...emptyForm, avgVisitMinutes: '' })
    const body = toPlaceEditBody(emptied, ['tx-cat-cafe'], baseline)
    expect(body).toMatchObject({
      addressText: null,
      areaKey: null,
      city: null,
      district: null,
      phone: null,
      website: null,
      description: null,
      avgVisitMinutes: null,
    })
    // And the server accepts every one of those.
    const { taxonomyIds, ...rest } = body
    expect(taxonomyIds).toBeUndefined()
    expect(cmsPlaceEditSchema.safeParse(rest).success).toBe(true)
  })

  it('never sends null for a box that was already empty', () => {
    const blank = placeIdentitySchema.parse(emptyForm)
    const body = toPlaceEditBody(blank, [], { values: blank, taxonomyIds: [], updatedAt: 'x' })
    expect(body).not.toHaveProperty('city')
    expect(body).not.toHaveProperty('phone')
  })

  it('sends what was typed, not a value it normalized itself', () => {
    const typed = placeIdentitySchema.parse({ ...loaded, phone: '028 3822 9999' })
    // One normalizer, and it is the one that stores the value.
    expect(toPlaceEditBody(typed, ['tx-cat-cafe'], baseline).phone).toBe('028 3822 9999')
  })

  it('names exactly the fields a concurrent save would have overwritten', () => {
    const mine = placeIdentitySchema.parse({ ...loaded, name: 'Tên của tôi', city: 'Đà Nẵng' })
    // The row as it now stands on the server: identical to what was loaded,
    // except the name somebody else changed.
    const server = { ...loaded, name: 'Chào Bạn Coffee' }
    expect(diffAgainstServer(mine, server)).toEqual([
      { field: 'name', mine: 'Tên của tôi', theirs: 'Chào Bạn Coffee' },
      { field: 'city', mine: 'Đà Nẵng', theirs: 'TP.HCM' },
    ])
    // An untouched form against an unchanged row has nothing to report.
    expect(diffAgainstServer(loaded, loaded)).toEqual([])
  })
})
