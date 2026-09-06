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
 *
 * GoGo-BE#425 added the half of the contract that makes an editor able to
 * *undo* a value: `null` clears a field, an absent key leaves it alone. Every
 * clearable field is therefore `.nullable().optional()` here, and the two are
 * not interchangeable — sending `undefined` where `null` was meant is exactly
 * the bug that made a filled box impossible to empty again.
 */
export type PlaceFieldName =
  | 'name'
  | 'description'
  | 'addressText'
  | 'areaKey'
  | 'city'
  | 'district'
  | 'phone'
  | 'website'
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
  city: { kind: 'text', max: 120 },
  district: { kind: 'text', max: 120 },
  phone: { kind: 'text', max: 40 },
  website: { kind: 'text', max: 500 },
  lat: { kind: 'number', min: -90, max: 90 },
  lng: { kind: 'number', min: -180, max: 180 },
  avgVisitMinutes: { kind: 'number', min: 10, max: 720, integer: true },
  curatedRank: { kind: 'number', min: 0, integer: true },
  taxonomyIds: { kind: 'list', max: 30 },
} as const satisfies Record<PlaceFieldName, PlaceFieldLimit>

/**
 * The fields where `null` means *clear this*, and an absent key means *leave
 * it alone* (GoGo-BE#425). `name` is not among them: it is required, so
 * "empty" is a rejection, not an instruction.
 *
 * `lat`/`lng` are not among them either, and deliberately so — the contract
 * has no null for a coordinate, so a pin cannot be removed through this
 * endpoint, only moved.
 */
export const PLACE_CLEARABLE_FIELDS = [
  'description',
  'addressText',
  'areaKey',
  'city',
  'district',
  'phone',
  'website',
  'avgVisitMinutes',
] as const satisfies readonly PlaceFieldName[]

export type PlaceClearableField = (typeof PLACE_CLEARABLE_FIELDS)[number]

export function isClearableField(field: string): field is PlaceClearableField {
  return (PLACE_CLEARABLE_FIELDS as readonly string[]).includes(field)
}

/** `PUT /cms/places/{id}/hours` — a whole week, replaced in one call. */
export const PLACE_HOURS_LIMITS = {
  /**
   * Seven days x at most four services. Raised from 21 by GoGo-BE#425, when a
   * day gained the right to hold more than one window; the server still counts
   * rows, not days.
   */
  maxRows: 28,
  /** Per day, enforced by `validateWeek` in GoGo-BE, not by the row count. */
  maxIntervalsPerDay: 4,
  dayOfWeek: { min: 0, max: 6 },
  minuteOfDay: { min: 0, max: 1439 },
  /**
   * A day asserts one of these, or has no row at all. **There is no `unknown`
   * kind** — GoGo-BE is explicit that "we have no data" is not something a row
   * asserts about a place (ADR-0016), so unknown is the absence of a row.
   */
  kinds: ['interval', 'closed', 'open_24h'] as const,
  /** Omitted on write means `editor`. */
  sources: ['provider', 'editor'] as const,
} as const

const H = PLACE_HOURS_LIMITS

export const PLACE_HOUR_FIELD_LIMITS = {
  hours: { kind: 'list', max: H.maxRows },
  dayOfWeek: { kind: 'number', min: H.dayOfWeek.min, max: H.dayOfWeek.max, integer: true },
  openMinute: { kind: 'number', min: H.minuteOfDay.min, max: H.minuteOfDay.max, integer: true },
  closeMinute: { kind: 'number', min: H.minuteOfDay.min, max: H.minuteOfDay.max, integer: true },
} as const satisfies Record<string, PlaceFieldLimit>

/**
 * `POST|PATCH /cms/places/{placeId}/media` (GoGo-BE#191).
 *
 * `maxUploadBytes` is the presigner's ceiling, mirrored here because the size
 * is declared to `POST /cms/uploads` up front: an oversized file is refused
 * *before* a URL exists, so checking it in the browser saves a round-trip and
 * lets the refusal name the file it is about.
 */
export const PLACE_MEDIA_LIMITS = {
  maxUploadBytes: 10 * 1024 * 1024,
  storageKey: { max: 400 },
  caption: { max: 300 },
  attribution: { max: 300 },
  /** A decision with a two-character reason is not auditable, hence min 3. */
  moderationReason: { min: 3, max: 500 },
  sortOrder: { min: 0, max: 999 },
} as const

const M = PLACE_MEDIA_LIMITS

export const PLACE_MEDIA_FIELD_LIMITS = {
  storageKey: { kind: 'text', max: M.storageKey.max },
  caption: { kind: 'text', max: M.caption.max },
  attribution: { kind: 'text', max: M.attribution.max },
  moderationReason: { kind: 'text', min: M.moderationReason.min, max: M.moderationReason.max },
  sortOrder: { kind: 'number', min: M.sortOrder.min, max: M.sortOrder.max, integer: true },
} as const satisfies Record<string, PlaceFieldLimit>

const LIMITS_BY_NAME: Record<string, PlaceFieldLimit> = {
  ...PLACE_FIELD_LIMITS,
  ...PLACE_HOUR_FIELD_LIMITS,
  ...PLACE_MEDIA_FIELD_LIMITS,
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
    description: z.string().max(L.description.max).nullable().optional(),
    addressText: z.string().max(L.addressText.max).nullable().optional(),
    areaKey: z.string().trim().max(L.areaKey.max).nullable().optional(),
    city: z.string().trim().max(L.city.max).nullable().optional(),
    district: z.string().trim().max(L.district.max).nullable().optional(),
    phone: z.string().trim().max(L.phone.max).nullable().optional(),
    website: z.string().trim().max(L.website.max).nullable().optional(),
    lat: z.number().min(L.lat.min).max(L.lat.max).optional(),
    lng: z.number().min(L.lng.min).max(L.lng.max).optional(),
    avgVisitMinutes: z
      .number()
      .int()
      .min(L.avgVisitMinutes.min)
      .max(L.avgVisitMinutes.max)
      .nullable()
      .optional(),
    suitability: z.record(z.string(), z.number().min(0).max(1)).optional(),
    isLodging: z.boolean().optional(),
    curatedRank: z.number().int().min(L.curatedRank.min).nullable().optional(),
    taxonomyIds: z.array(taxonomyId).max(L.taxonomyIds.max).optional(),
    /** Optimistic concurrency — the `updatedAt` the form was loaded from. */
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
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
      z
        .object({
          dayOfWeek: z.number().int().min(H.dayOfWeek.min).max(H.dayOfWeek.max),
          kind: z.enum(H.kinds).default('interval'),
          openMinute: z.number().int().min(H.minuteOfDay.min).max(H.minuteOfDay.max).default(0),
          closeMinute: z.number().int().min(H.minuteOfDay.min).max(H.minuteOfDay.max).default(0),
          isOvernight: z.boolean().default(false),
          source: z.enum(H.sources).optional(),
        })
        // `.strict()` mirrors GoGo-BE: an unknown key is a client that thinks
        // this endpoint accepts something it does not.
        .strict(),
    )
    .max(H.maxRows),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
})

/** `POST /cms/places/{placeId}/media` — a key, never bytes. */
export const cmsPlaceMediaAttachSchema = z.object({
  storageKey: z.string().min(1).max(M.storageKey.max),
  caption: z.string().max(M.caption.max).nullish(),
  attribution: z.string().max(M.attribution.max).nullish(),
  isCover: z.boolean().optional(),
  width: z.number().int().nullish(),
  height: z.number().int().nullish(),
})

/**
 * `PATCH /cms/places/{placeId}/media/{mediaId}`.
 *
 * `minProperties: 1` in the spec: an empty patch is refused rather than
 * writing an audit row that records nothing. The moderation-needs-a-reason
 * rule is NOT here, because the server applies it only when the decision
 * actually changes — that needs the row's current value, which a body schema
 * does not have. `moderationReasonMissing` below is that check.
 */
export const cmsPlaceMediaPatchSchema = z
  .object({
    sortOrder: z.number().int().min(M.sortOrder.min).max(M.sortOrder.max).optional(),
    moderation: z.enum(['pending', 'approved', 'rejected']).optional(),
    moderationReason: z.string().min(M.moderationReason.min).max(M.moderationReason.max).optional(),
    caption: z.string().max(M.caption.max).nullish(),
    attribution: z.string().max(M.attribution.max).nullish(),
    isCover: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one property is required',
  })

/**
 * True when this patch changes the decision and carries no usable reason —
 * exactly the branch `CmsPlaceMediaService#update` answers `400` on, with
 * `field_errors[0].field === 'moderationReason'`.
 */
export function moderationReasonMissing(
  current: string,
  patch: { moderation?: string | undefined; moderationReason?: string | undefined },
): boolean {
  if (patch.moderation === undefined || patch.moderation === current) return false
  return (patch.moderationReason?.trim().length ?? 0) < M.moderationReason.min
}

/**
 * The rules `validateWeek` enforces on GoGo-BE beyond the row shape
 * (`libs/modules/cms/domain/place-hours.ts`). Mirrored here so the mock rejects
 * a week the real server would reject — an accepted-locally, refused-in-dev
 * week is exactly the class of drift GoGo-CMS#122 was about.
 *
 * Codes are the server's codes; the console renders both through one path.
 */
export function mockHoursIssues(
  hours: readonly {
    dayOfWeek: number
    kind: 'interval' | 'closed' | 'open_24h'
    openMinute: number
    closeMinute: number
    isOvernight: boolean
  }[],
): { field: string; code: string; message: string }[] {
  const issues: { field: string; code: string; message: string }[] = []
  const byDay = new Map<number, number[]>()

  hours.forEach((hour, index) => {
    byDay.set(hour.dayOfWeek, [...(byDay.get(hour.dayOfWeek) ?? []), index])
    if (hour.kind !== 'interval') {
      if (hour.openMinute !== 0 || hour.closeMinute !== 0 || hour.isOvernight) {
        issues.push({
          field: `hours.${index}.kind`,
          code: 'minutes_not_allowed',
          message: 'whole-day row carries minutes',
        })
      }
      return
    }
    if (hour.isOvernight) {
      if (hour.closeMinute > hour.openMinute) {
        issues.push({
          field: `hours.${index}.isOvernight`,
          code: 'not_overnight',
          message: 'ends the same day',
        })
      }
    } else if (hour.closeMinute <= hour.openMinute) {
      issues.push({
        field: `hours.${index}.closeMinute`,
        code: 'not_after_open',
        message: 'close is not after open',
      })
    }
  })

  for (const [, indexes] of byDay) {
    const wholeDay = indexes.filter((i) => hours[i]!.kind !== 'interval')
    if (wholeDay.length > 0 && indexes.length > 1) {
      issues.push({
        field: `hours.${wholeDay[0]}.kind`,
        code: 'conflicting_day',
        message: 'day is both whole-day and a span',
      })
    }
    if (indexes.length > PLACE_HOURS_LIMITS.maxIntervalsPerDay) {
      issues.push({
        field: `hours.${indexes[PLACE_HOURS_LIMITS.maxIntervalsPerDay]}`,
        code: 'too_many_intervals',
        message: 'too many services in one day',
      })
    }
  }

  if (issues.length > 0) return issues

  // The wrapped minute-of-week line, so a Saturday-night span colliding with
  // Sunday morning is caught the same way the server catches it.
  const DAY = 1440
  const WEEK = 7 * DAY
  const spans = hours.flatMap((hour, index) => {
    if (hour.kind === 'closed') return []
    const start = hour.dayOfWeek * DAY + (hour.kind === 'open_24h' ? 0 : hour.openMinute)
    const length =
      hour.kind === 'open_24h'
        ? DAY
        : hour.isOvernight
          ? DAY - hour.openMinute + hour.closeMinute
          : hour.closeMinute - hour.openMinute
    return [{ index, start, end: start + length }]
  })
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length; j += 1) {
      const a = spans[i]!
      const b = spans[j]!
      const hit = [-WEEK, 0, WEEK].some(
        (shift) => a.start < b.end + shift && b.start + shift < a.end,
      )
      if (hit) {
        issues.push({
          field: `hours.${Math.max(a.index, b.index)}`,
          code: 'overlapping',
          message: 'two services overlap',
        })
      }
    }
  }
  return issues
}

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
