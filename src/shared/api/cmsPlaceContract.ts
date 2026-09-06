import { z } from 'zod'

/**
 * The CMS place **write** contract, mirrored field for field from
 * `placeEditSchema` / `hoursSchema` in
 * `GoGo-BE/libs/modules/cms/presentation/cms.controllers.ts`.
 *
 * It lives here, once, because three places used to carry their own copy of
 * these numbers: the editor form, the mock API and nobody's tests. The mock
 * accepted anything (`Object.assign(place, await request.json())`), so the
 * frontend drifting to `avgVisitMinutes: 0..1440` against a server that
 * enforces `10..720` showed up as a "Request validation failed" toast in
 * production and as a green test suite here (GoGo-CMS#122).
 *
 * Change GoGo-BE, change this file, and `cmsPlaceContract.test.ts` tells you
 * whether the two still agree.
 */
export type PlaceFieldName =
  | 'name'
  | 'description'
  | 'addressText'
  | 'areaKey'
  | 'lat'
  | 'lng'
  | 'avgVisitMinutes'
  | 'curatedRank'
  | 'taxonomyIds'

export type PlaceFieldLimit = {
  /** Decides how a rejection is worded: a length, a range or a count. */
  kind: 'text' | 'number' | 'list'
  min?: number
  max?: number
  integer?: boolean
}

export const PLACE_FIELD_LIMITS = {
  name: { kind: 'text', min: 1, max: 200 },
  description: { kind: 'text', max: 4000 },
  addressText: { kind: 'text', max: 400 },
  areaKey: { kind: 'text', max: 64 },
  lat: { kind: 'number', min: -90, max: 90 },
  lng: { kind: 'number', min: -180, max: 180 },
  avgVisitMinutes: { kind: 'number', min: 10, max: 720, integer: true },
  curatedRank: { kind: 'number', min: 0, integer: true },
  taxonomyIds: { kind: 'list', max: 30 },
} as const satisfies Record<PlaceFieldName, PlaceFieldLimit>

/** `PUT /cms/places/{id}/hours` — a whole week, replaced in one call. */
export const PLACE_HOURS_LIMITS = {
  /** Three windows a day at most; the server counts rows, not days. */
  maxRows: 21,
  dayOfWeek: { min: 0, max: 6 },
  minuteOfDay: { min: 0, max: 1439 },
} as const

const H = PLACE_HOURS_LIMITS

export const PLACE_HOUR_FIELD_LIMITS = {
  hours: { kind: 'list', max: H.maxRows },
  dayOfWeek: { kind: 'number', min: H.dayOfWeek.min, max: H.dayOfWeek.max, integer: true },
  openMinute: { kind: 'number', min: H.minuteOfDay.min, max: H.minuteOfDay.max, integer: true },
  closeMinute: { kind: 'number', min: H.minuteOfDay.min, max: H.minuteOfDay.max, integer: true },
} as const satisfies Record<string, PlaceFieldLimit>

const LIMITS_BY_NAME: Record<string, PlaceFieldLimit> = {
  ...PLACE_FIELD_LIMITS,
  ...PLACE_HOUR_FIELD_LIMITS,
}

/**
 * The rule behind a field path off the wire.
 *
 * `ZodValidationPipe` joins the whole path — `hours.0.closeMinute`,
 * `taxonomyIds.4` — and the rule belongs to the named segment, not the index.
 */
export function placeFieldLimit(field: string): PlaceFieldLimit | undefined {
  const named = field.split('.').filter((segment) => !/^\d+$/.test(segment))
  const name = named[named.length - 1]
  return name ? LIMITS_BY_NAME[name] : undefined
}

const L = PLACE_FIELD_LIMITS

function buildPlaceEditSchema(taxonomyId: z.ZodType<string>) {
  return z.object({
    name: z.string().trim().min(L.name.min).max(L.name.max).optional(),
    description: z.string().max(L.description.max).optional(),
    addressText: z.string().max(L.addressText.max).optional(),
    areaKey: z.string().max(L.areaKey.max).optional(),
    lat: z.number().min(L.lat.min).max(L.lat.max).optional(),
    lng: z.number().min(L.lng.min).max(L.lng.max).optional(),
    avgVisitMinutes: z
      .number()
      .int()
      .min(L.avgVisitMinutes.min)
      .max(L.avgVisitMinutes.max)
      .optional(),
    suitability: z.record(z.string(), z.number().min(0).max(1)).optional(),
    isLodging: z.boolean().optional(),
    curatedRank: z.number().int().min(L.curatedRank.min).nullable().optional(),
    taxonomyIds: z.array(taxonomyId).max(L.taxonomyIds.max).optional(),
  })
}

/** Exactly what GoGo-BE enforces on `PATCH /cms/places/{id}`. */
export const cmsPlaceEditSchema = buildPlaceEditSchema(z.string().uuid())

/**
 * The same rules with the uuid format relaxed.
 *
 * The mock catalogue is keyed by readable ids (`pl-chao-ban`, `tx-cat-cafe`)
 * rather than uuids — as is every other id in `fixtures.ts` — so enforcing the
 * format in the mock would fail on the fixtures instead of on a real drift.
 * Every other rule is identical, which is the half that drifts.
 */
export const cmsPlaceEditMockSchema = buildPlaceEditSchema(z.string().min(1))

export const cmsPlaceHoursSchema = z.object({
  hours: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(H.dayOfWeek.min).max(H.dayOfWeek.max),
        openMinute: z.number().int().min(H.minuteOfDay.min).max(H.minuteOfDay.max),
        closeMinute: z.number().int().min(H.minuteOfDay.min).max(H.minuteOfDay.max),
        isOvernight: z.boolean().default(false),
      }),
    )
    .max(H.maxRows),
})

/**
 * The shape `ZodValidationPipe` turns a rejected body into
 * (`GoGo-BE/libs/modules/shared/zod-validation.pipe.ts`). The mock reuses it so
 * a mocked 400 is byte-for-byte the envelope the client parses in production.
 */
export function toFieldErrors(
  issues: readonly z.ZodIssue[],
): { field: string; code: string; message: string }[] {
  return issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    code: issue.code,
    message: issue.message,
  }))
}
