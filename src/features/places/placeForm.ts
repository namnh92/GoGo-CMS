import { useCallback } from 'react'
import { z } from 'zod'
import { useLabel, useT } from '@/shared/i18n/i18n'
import { PLACE_FIELD_LIMITS, placeFieldLimit } from '@/shared/api/cmsPlaceContract'
import type { FieldError } from '@/shared/api/errors'
import type { UpdatePlaceInput } from './api'

const L = PLACE_FIELD_LIMITS

/**
 * An untouched `<input>` reads back as `''`. That is "no value", never `0`.
 *
 * The editor used to declare these fields with `z.coerce.number()`, which turns
 * `''` into `0`. Two bugs came out of the same line (GoGo-CMS#122):
 *
 *  - `avgVisitMinutes` became `0`, the local rule said `.min(0)` and the server
 *    says `.min(10)` — so every place whose visit duration was null could not
 *    be saved at all, with only "Request validation failed" to go on.
 *  - `lat`/`lng` became `0` too, and the server *accepts* `lat: 0, lng: 0`. An
 *    editor who never touched the coordinates silently moved the place into the
 *    Gulf of Guinea and invalidated every cached travel leg for it
 *    (`invalidateTravelOnMove`). An empty coordinate box must send nothing.
 */
function optionalNumber(schema: z.ZodNumber) {
  return z.preprocess((value) => {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') return undefined
      const parsed = Number(trimmed)
      // A non-numeric string is handed through untouched so zod reports
      // "not a number" against what was typed, rather than swallowing it.
      return Number.isNaN(parsed) ? value : parsed
    }
    return value
  }, schema.optional())
}

/**
 * Messages here are i18n keys, resolved by `usePlaceFieldError`. Limits come
 * from the contract mirror, so they cannot drift away from GoGo-BE silently.
 */
const placeIdentityFields = z.object({
  name: z.string().trim().min(L.name.min, 'placeEditor.error.required').max(L.name.max),
  addressText: z.string().max(L.addressText.max).optional(),
  areaKey: z.string().max(L.areaKey.max).optional(),
  /**
   * ADR-0016 legacy free text. Kept in the model because existing places carry
   * it and the detail screen shows it; **not** offered as an input any more —
   * the administrative address is `provinceCode` + `communeCode`.
   */
  city: z.string().max(L.city.max).optional(),
  /**
   * Legacy only, and no longer editable anywhere: district-level units were
   * dissolved on 2025-07-01. Present so a stored value round-trips untouched.
   */
  district: z.string().max(L.district.max).optional(),
  /**
   * ADM-106 — the canonical administrative address.
   *
   * `''` is "not chosen", the way every other text field in this form reads an
   * untouched input. The pair rule is GoGo-BE's and is enforced there against
   * the published dataset; what this form guarantees is that a commune is only
   * ever picked from the chosen province's own list, so the pair it sends is
   * one the hierarchy holds.
   */
  provinceCode: z.string().max(L.provinceCode.max).optional(),
  communeCode: z.string().max(L.communeCode.max).optional(),
  /*
   * Neither is validated for shape here. GoGo-BE normalizes a phone to E.164
   * and a website to `http(s)`, and a second, slightly different rule in the
   * browser would refuse values the server accepts (and accept ones it
   * refuses). The editor sends what was typed and renders the server's
   * `field_errors` — one normalizer, on the side that stores the value.
   */
  phone: z.string().max(L.phone.max).optional(),
  website: z.string().max(L.website.max).optional(),
  description: z.string().max(L.description.max).optional(),
  avgVisitMinutes: optionalNumber(
    z.number().int().min(L.avgVisitMinutes.min).max(L.avgVisitMinutes.max),
  ),
  lat: optionalNumber(z.number().min(L.lat.min).max(L.lat.max)),
  lng: optionalNumber(z.number().min(L.lng.min).max(L.lng.max)),
})

export const placeIdentitySchema = placeIdentityFields.superRefine((values, ctx) => {
  /*
   * ADM-106 — a province with no commune is not an address, and a commune with
   * no province is a code with nothing to check it against. GoGo-BE answers
   * `400 ADMINISTRATIVE_CODES_INCOMPLETE` for either; saying so here points at
   * the empty box instead of raising a toast.
   */
  const province = (values.provinceCode ?? '').trim()
  const commune = (values.communeCode ?? '').trim()
  if (province !== '' && commune === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['communeCode'],
      message: 'placeEditor.error.communeRequired',
    })
  }
  if (commune !== '' && province === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['provinceCode'],
      message: 'placeEditor.error.provinceRequired',
    })
  }

  // The server moves the pin only when both arrive; one alone is a silent
  // no-op there, so it is a visible rejection here.
  if ((values.lat === undefined) === (values.lng === undefined)) return
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [values.lat === undefined ? 'lat' : 'lng'],
    message: 'placeEditor.error.coordinatePair',
  })
})

/**
 * GoGo-CMS#150 — the same fields, with the three a new row cannot do without.
 *
 * `POST /cms/places` requires a name and a position because search, routing and
 * duplicate detection all need them; on an existing place those are already
 * there, which is why the edit schema leaves them optional. Sharing the field
 * definitions keeps the two forms from drifting into different limits.
 */
export const placeCreateSchema = placeIdentityFields.extend({
  /**
   * GoGo-CMS#179 — one category, chosen at creation.
   *
   * The editor screen owns the full taxonomy (moods, settings, dietary) as
   * chips; this form takes the single field a Google link can actually fill.
   * `''` is "not chosen", the same reading every other box here gives an
   * untouched input, and the create body then carries no `taxonomyIds` at all.
   */
  categoryId: z.string().max(64).optional(),
  name: z.string().trim().min(L.name.min, 'placeEditor.error.required').max(L.name.max),
  lat: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number({ message: 'placeEditor.error.required' }).min(L.lat.min).max(L.lat.max),
  ),
  lng: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number({ message: 'placeEditor.error.required' }).min(L.lng.min).max(L.lng.max),
  ),
})

export type PlaceCreateForm = z.infer<typeof placeCreateSchema>

/**
 * Register options for the three optional number boxes.
 *
 * An empty `<input type="number">` reads back as `''`, so react-hook-form kept
 * `''` in `_formValues` while `applyIdentity` had seeded the default as
 * `undefined`. The two are never equal, which made `isDirty` true forever on
 * any place with a null `avgVisitMinutes`, `lat` or `lng`: a successful save
 * still said "Có thay đổi chưa lưu", and the leave guard offered to discard
 * changes that did not exist (#140). `reset()` could not clear it either — it
 * restored the `undefined` default, and the empty box immediately reported
 * `''` again.
 *
 * Mapping the empty box to `undefined` at the point react-hook-form reads it
 * puts both sides in the same vocabulary. Anything non-empty is handed on
 * untouched, so `optionalNumber` still does the parsing and still reports "not
 * a number" against what was typed.
 */
export const numberFieldRegister = {
  setValueAs: (value: unknown): unknown =>
    value === '' || value === null || value === undefined ? undefined : value,
}

export type PlaceIdentityForm = z.infer<typeof placeIdentitySchema>

/** The fields `PATCH /cms/places/{id}` shares with this form, by wire name. */
export const PLACE_IDENTITY_FIELDS = [
  'name',
  'addressText',
  'areaKey',
  'city',
  'district',
  'provinceCode',
  'communeCode',
  'phone',
  'website',
  'description',
  'avgVisitMinutes',
  'lat',
  'lng',
] as const

export type PlaceIdentityField = (typeof PLACE_IDENTITY_FIELDS)[number]

export function isIdentityField(field: string): field is PlaceIdentityField {
  return (PLACE_IDENTITY_FIELDS as readonly string[]).includes(field)
}

/**
 * Split a rejected save into the errors this form can point at and the ones it
 * cannot. Nothing is dropped: an unmapped path (`taxonomyIds.4`, `suitability`,
 * `(root)`) is still shown, because an error nobody renders is an editor
 * staring at a form that looks fine.
 */
export function splitFieldErrors(fieldErrors: readonly FieldError[]): {
  mapped: (FieldError & { field: PlaceIdentityField })[]
  unmapped: FieldError[]
} {
  const mapped: (FieldError & { field: PlaceIdentityField })[] = []
  const unmapped: FieldError[] = []
  for (const error of fieldErrors) {
    if (isIdentityField(error.field)) mapped.push({ ...error, field: error.field })
    else unmapped.push(error)
  }
  return { mapped, unmapped }
}

/**
 * What the form was loaded with — the other half of every "did this change?"
 * question the body builder has to answer.
 */
export type PlaceEditBaseline = {
  values: PlaceIdentityForm
  taxonomyIds: string[]
  /** The `updatedAt` the form was loaded from; travels as `expectedUpdatedAt`. */
  updatedAt: string
}

/** `'  '`, `''` and `undefined` are all "the editor left this box empty". */
function textOf(value: string | undefined): string {
  return (value ?? '').trim()
}

function sameIds(a: string[], b: string[]): boolean {
  return [...a].sort().join(',') === [...b].sort().join(',')
}

/**
 * The PATCH body.
 *
 * Three states, not two (GoGo-BE#425):
 *
 *  - **absent key** — the editor did not touch this field. The server leaves
 *    it alone, and does not record a provenance claim over a value nobody
 *    edited: saving a phone number must not re-stamp the description as
 *    editorial.
 *  - **`null`** — the editor emptied a box that had something in it. Before
 *    #425 this arrived as an absent key, so a value could be filled once and
 *    never removed.
 *  - **a value** — what was typed.
 *
 * Without `baseline` there is nothing to diff against, so every filled box is
 * sent and nothing is cleared: that is the safe reading of "we do not know
 * what this form started from".
 */
export function toPlaceEditBody(
  values: PlaceIdentityForm,
  taxonomyIds: string[],
  baseline?: PlaceEditBaseline,
): UpdatePlaceInput {
  const body: UpdatePlaceInput = {}

  const text = (
    field:
      | 'addressText'
      | 'areaKey'
      | 'city'
      | 'district'
      | 'provinceCode'
      | 'communeCode'
      | 'phone'
      | 'website',
  ) => {
    const next = textOf(values[field])
    if (!baseline) {
      if (next) body[field] = next
      return
    }
    const before = textOf(baseline.values[field])
    if (next === before) return
    // Empty against a value that existed is the clear; empty against empty is
    // no change at all, and sending `null` for it would claim an edit.
    body[field] = next === '' ? null : next
  }

  // `description` keeps its whitespace — a paragraph break is content there.
  const nextDescription = values.description ?? ''
  const nextName = values.name.trim()
  if (!baseline) {
    if (nextName) body.name = nextName
    if (nextDescription) body.description = nextDescription
  } else {
    if (nextName !== baseline.values.name.trim()) body.name = nextName
    const beforeDescription = baseline.values.description ?? ''
    if (nextDescription !== beforeDescription) {
      body.description = nextDescription === '' ? null : nextDescription
    }
  }

  text('addressText')
  text('areaKey')
  // ADM-106 — `city` and `district` are no longer editable, so the diff below
  // finds them unchanged and sends nothing. They are still listed because a
  // form seeded from an older draft could still carry a value, and dropping
  // them from the diff would let that value be silently lost instead of sent.
  text('city')
  text('district')
  text('provinceCode')
  text('communeCode')
  text('phone')
  text('website')

  if (!baseline) {
    if (values.avgVisitMinutes !== undefined) body.avgVisitMinutes = values.avgVisitMinutes
  } else if (values.avgVisitMinutes !== baseline.values.avgVisitMinutes) {
    body.avgVisitMinutes = values.avgVisitMinutes ?? null
  }

  /*
   * Coordinates are the one pair with no `null` in the contract, so an emptied
   * box cannot ask for a pin to be removed — only for one to be moved. They
   * also travel together or not at all: the server ignores a lone value, and
   * `placeIdentitySchema` refuses to let one leave here on its own.
   */
  if (values.lat !== undefined && values.lng !== undefined) {
    if (!baseline || values.lat !== baseline.values.lat || values.lng !== baseline.values.lng) {
      body.lat = values.lat
      body.lng = values.lng
    }
  }

  if (!baseline || !sameIds(taxonomyIds, baseline.taxonomyIds)) body.taxonomyIds = taxonomyIds
  if (baseline) body.expectedUpdatedAt = baseline.updatedAt

  return body
}

/**
 * The fields whose current value differs from what the server now holds —
 * what a `409 PLACE_MODIFIED` needs to show, because "somebody else saved" is
 * useless without "and here is what you would have overwritten".
 */
export function diffAgainstServer(
  values: PlaceIdentityForm,
  server: Partial<Record<PlaceIdentityField, string | number | null | undefined>>,
): { field: PlaceIdentityField; mine: string; theirs: string }[] {
  const out: { field: PlaceIdentityField; mine: string; theirs: string }[] = []
  for (const field of PLACE_IDENTITY_FIELDS) {
    const mine = String(values[field] ?? '').trim()
    const theirs = String(server[field] ?? '').trim()
    if (mine !== theirs) out.push({ field, mine, theirs })
  }
  return out
}

/**
 * Vietnamese text for a rejected field, whether zod raised the issue in this
 * browser or `ZodValidationPipe` raised it in GoGo-BE — both speak the same
 * issue codes, so one mapping covers both and an editor never reads
 * "Number must be greater than or equal to 10".
 */
export function usePlaceFieldError(): (field: string, issue: FieldIssue) => string {
  const t = useT()
  const label = useLabel()
  return useCallback(
    (field: string, issue: FieldIssue) => {
      // A message our own schema authored is an i18n key.
      const authored = label(issue.message, '')
      if (authored) return authored

      const limit = placeFieldLimit(field)
      switch (issue.code) {
        case 'invalid_type':
          if (limit?.kind === 'number') {
            return t(limit.integer ? 'placeEditor.error.integer' : 'placeEditor.error.number')
          }
          return t('placeEditor.error.required')
        case 'not_finite':
          return t('placeEditor.error.number')
        case 'too_small':
          if (limit?.kind === 'text') return t('placeEditor.error.required')
          if (limit?.min != null) return t('placeEditor.error.min', { min: limit.min })
          break
        case 'too_big':
          if (limit?.kind === 'text' && limit.max != null) {
            return t('placeEditor.error.maxLength', { max: limit.max })
          }
          if (limit?.kind === 'list' && limit.max != null) {
            return t('placeEditor.error.maxItems', { max: limit.max })
          }
          if (limit?.max != null) return t('placeEditor.error.max', { max: limit.max })
          break
        case 'invalid_string':
          return t('placeEditor.error.format')
        default:
          break
      }
      // A code the client has never seen still says something true: the raw
      // server text, which is better than a blank line under the field.
      return issue.message || t('placeEditor.error.invalid')
    },
    [t, label],
  )
}

export type FieldIssue = { code: string; message: string }
