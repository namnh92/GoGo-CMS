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
export const placeIdentitySchema = z
  .object({
    name: z.string().trim().min(L.name.min, 'placeEditor.error.required').max(L.name.max),
    addressText: z.string().max(L.addressText.max).optional(),
    areaKey: z.string().max(L.areaKey.max).optional(),
    description: z.string().max(L.description.max).optional(),
    avgVisitMinutes: optionalNumber(
      z.number().int().min(L.avgVisitMinutes.min).max(L.avgVisitMinutes.max),
    ),
    lat: optionalNumber(z.number().min(L.lat.min).max(L.lat.max)),
    lng: optionalNumber(z.number().min(L.lng.min).max(L.lng.max)),
  })
  .superRefine((values, ctx) => {
    // The server moves the pin only when both arrive; one alone is a silent
    // no-op there, so it is a visible rejection here.
    if ((values.lat === undefined) === (values.lng === undefined)) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [values.lat === undefined ? 'lat' : 'lng'],
      message: 'placeEditor.error.coordinatePair',
    })
  })

export type PlaceIdentityForm = z.infer<typeof placeIdentitySchema>

/** The fields `PATCH /cms/places/{id}` shares with this form, by wire name. */
export const PLACE_IDENTITY_FIELDS = [
  'name',
  'addressText',
  'areaKey',
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

/** The PATCH body. `undefined` keys drop out of the JSON — that is the point. */
export function toPlaceEditBody(
  values: PlaceIdentityForm,
  taxonomyIds: string[],
): UpdatePlaceInput {
  return {
    name: values.name.trim(),
    addressText: values.addressText?.trim() || undefined,
    areaKey: values.areaKey?.trim() || undefined,
    description: values.description || undefined,
    avgVisitMinutes: values.avgVisitMinutes,
    lat: values.lat,
    lng: values.lng,
    taxonomyIds,
  }
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
