import type {
  SafetyRuleAction,
  SafetyRuleSeverity,
  SafetyRuleTrigger,
  SafetyRuleType,
} from '@/shared/api/contracts'

/**
 * What a Trust & Safety rule is allowed to say.
 *
 * A mirror of GoGo-BE's `safety-rule-conditions.ts` (BE-CMS-G4d, #225), field
 * for field and bound for bound. Two reasons it is duplicated rather than
 * derived from the generated types: the OpenAPI declares `conditions` as a
 * free object with the per-type shapes described in prose, and an editor
 * should learn that `maxLinks` tops out at 50 from the form, not from a 400.
 *
 * It decides what the form OFFERS. The server still validates every write —
 * if this file and the server ever disagree, the server is right and this file
 * is the bug.
 *
 * There is no rule builder and no expression language here either: adding a
 * capability means adding a field below, and the backend shipping the code
 * that reads it.
 */

export const RATE_LIMITED_ACTIONS = [
  'review_create',
  'report_create',
  'checkin_create',
  'place_submit',
  'room_join',
] as const

/**
 * Every field name any rule type can carry. A union rather than `string` so a
 * new field cannot ship without its label: `t('safety.condition.<name>')` stops
 * typechecking until the catalogue has one.
 */
export type ConditionFieldName =
  | 'terms'
  | 'matchMode'
  | 'caseSensitive'
  | 'maxLinks'
  | 'maxDuplicatesPerWindow'
  | 'windowHours'
  | 'minAccountAgeHours'
  | 'minReports'
  | 'maxReviewsPerWindow'
  | 'maxReviewsPerPlace'
  | 'maxReportsAgainstUser'
  | 'upheldOnly'
  | 'distinctReporters'
  | 'action'
  | 'limit'
  | 'windowSeconds'

/** Same reasoning for the enum choices — each needs a label to be offered. */
export type ConditionOption = 'substring' | 'exact' | (typeof RATE_LIMITED_ACTIONS)[number]

export type ConditionField =
  | {
      kind: 'number'
      name: ConditionFieldName
      min: number
      max: number
      required: boolean
      fallback?: number
    }
  | { kind: 'terms'; name: ConditionFieldName; maxTerms: number; required: boolean }
  | { kind: 'boolean'; name: ConditionFieldName; fallback: boolean }
  | {
      kind: 'enum'
      name: ConditionFieldName
      options: readonly ConditionOption[]
      required: boolean
    }

/** At least one element, so "the first legal action" needs no assertion. */
type NonEmpty<T> = readonly [T, ...T[]]

const HOUR_MAX = 24 * 30

/** `windowHours` is the same field everywhere it appears; only its default moves. */
const windowHours = (fallback: number): ConditionField => ({
  kind: 'number',
  name: 'windowHours',
  min: 1,
  max: HOUR_MAX,
  required: false,
  fallback,
})

export const CONDITION_FIELDS: Record<SafetyRuleType, readonly ConditionField[]> = {
  blocked_words: [
    { kind: 'terms', name: 'terms', maxTerms: 500, required: true },
    { kind: 'enum', name: 'matchMode', options: ['substring', 'exact'] as const, required: false },
    { kind: 'boolean', name: 'caseSensitive', fallback: false },
  ],
  spam: [
    { kind: 'number', name: 'maxLinks', min: 0, max: 50, required: false },
    { kind: 'number', name: 'maxDuplicatesPerWindow', min: 1, max: 100, required: false },
    windowHours(24),
    { kind: 'number', name: 'minAccountAgeHours', min: 0, max: 24 * 365, required: false },
  ],
  abusive_content: [
    { kind: 'terms', name: 'terms', maxTerms: 500, required: false },
    { kind: 'number', name: 'minReports', min: 1, max: 100, required: false, fallback: 1 },
    windowHours(24),
  ],
  review_abuse: [
    { kind: 'number', name: 'maxReviewsPerWindow', min: 1, max: 500, required: true },
    windowHours(24),
    { kind: 'number', name: 'maxReviewsPerPlace', min: 1, max: 50, required: false },
  ],
  user_abuse: [
    { kind: 'number', name: 'maxReportsAgainstUser', min: 1, max: 500, required: true },
    windowHours(24 * 7),
    { kind: 'boolean', name: 'upheldOnly', fallback: false },
  ],
  repeated_reports: [
    { kind: 'number', name: 'minReports', min: 2, max: 500, required: true },
    windowHours(24),
    { kind: 'boolean', name: 'distinctReporters', fallback: true },
  ],
  rate_limit: [
    { kind: 'enum', name: 'action', options: RATE_LIMITED_ACTIONS, required: true },
    { kind: 'number', name: 'limit', min: 1, max: 10_000, required: true },
    { kind: 'number', name: 'windowSeconds', min: 1, max: 86_400, required: true },
  ],
}

/**
 * Which actions each rule type may take. A blocked-words rule suspending an
 * account, or a rate-limit rule hiding content it never looked at, are
 * configurations that make sense to a form and not to the system.
 */
export const ALLOWED_ACTIONS: Record<SafetyRuleType, NonEmpty<SafetyRuleAction>> = {
  blocked_words: ['flag_for_review', 'auto_hide', 'require_moderation', 'block_action'],
  spam: ['flag_for_review', 'auto_hide', 'require_moderation', 'block_action'],
  abusive_content: ['flag_for_review', 'auto_hide', 'require_moderation'],
  review_abuse: ['flag_for_review', 'require_moderation', 'block_action', 'suspend_user'],
  user_abuse: ['flag_for_review', 'require_moderation', 'suspend_user'],
  repeated_reports: ['flag_for_review', 'auto_hide', 'require_moderation', 'suspend_user'],
  rate_limit: ['block_action'],
}

export const ALLOWED_TRIGGERS: Record<SafetyRuleType, NonEmpty<SafetyRuleTrigger>> = {
  blocked_words: ['review_created', 'review_updated', 'checkin_created', 'place_submitted'],
  spam: ['review_created', 'review_updated', 'checkin_created', 'place_submitted'],
  abusive_content: ['review_created', 'review_updated', 'report_created', 'checkin_created'],
  review_abuse: ['review_created', 'review_updated'],
  user_abuse: ['report_created', 'user_registered'],
  repeated_reports: ['report_created'],
  rate_limit: [
    'review_created',
    'report_created',
    'checkin_created',
    'place_submitted',
    'user_registered',
  ],
}

const SEVERITY_RANK: Record<SafetyRuleSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

/**
 * Suspension takes an account away from a person automatically, so it needs a
 * severity that says somebody meant it.
 */
export const SUSPENSION_MIN_SEVERITY: SafetyRuleSeverity = 'high'

export function severityAllowsSuspension(severity: SafetyRuleSeverity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[SUSPENSION_MIN_SEVERITY]
}

/** `^[a-z][a-z0-9_]{2,63}$` — machine-readable, stamped on every decision. */
export const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{2,63}$/

/** The editable draft: every field a string or a boolean, whatever its stored type. */
export type ConditionDraft = Record<string, string | boolean>

/**
 * Stored conditions → editable draft.
 *
 * A field the stored object does not carry becomes an empty string, NOT the
 * schema default: "not set, so the server applies its default" and "set to the
 * number the default happens to be" are different states, and only the first
 * one follows a later change of that default.
 */
export function toDraft(
  ruleType: SafetyRuleType,
  conditions: Record<string, unknown>,
): ConditionDraft {
  const draft: ConditionDraft = {}
  for (const field of CONDITION_FIELDS[ruleType]) {
    const value = conditions[field.name]
    if (field.kind === 'boolean') {
      draft[field.name] = typeof value === 'boolean' ? value : field.fallback
    } else if (field.kind === 'terms') {
      draft[field.name] = Array.isArray(value) ? value.join('\n') : ''
    } else {
      draft[field.name] = value === undefined || value === null ? '' : String(value)
    }
  }
  return draft
}

export type ConditionError = {
  field: string
  code: 'required' | 'range' | 'terms' | 'spamNeedsOne'
}

export type ParsedConditions =
  { ok: true; conditions: Record<string, unknown> } | { ok: false; errors: ConditionError[] }

/** Terms come from a textarea: one per line, blanks dropped, each ≤ 64 chars. */
function parseTerms(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * Draft → what `POST`/`PATCH` sends.
 *
 * An omitted optional field is left out of the payload entirely rather than
 * sent as `null` or `0`: the server's `.strict()` schemas apply their own
 * defaults, and a zero written where nothing was typed is a different rule.
 */
export function parseConditions(ruleType: SafetyRuleType, draft: ConditionDraft): ParsedConditions {
  const errors: ConditionError[] = []
  const conditions: Record<string, unknown> = {}

  for (const field of CONDITION_FIELDS[ruleType]) {
    const raw = draft[field.name]

    if (field.kind === 'boolean') {
      conditions[field.name] = raw === true
      continue
    }

    if (field.kind === 'terms') {
      const terms = parseTerms(typeof raw === 'string' ? raw : '')
      if (terms.length === 0) {
        if (field.required) errors.push({ field: field.name, code: 'required' })
        else conditions[field.name] = []
        continue
      }
      if (terms.length > field.maxTerms || terms.some((term) => term.length > 64)) {
        errors.push({ field: field.name, code: 'terms' })
        continue
      }
      conditions[field.name] = terms
      continue
    }

    const text = typeof raw === 'string' ? raw.trim() : ''
    if (text === '') {
      if (field.required) errors.push({ field: field.name, code: 'required' })
      continue
    }

    if (field.kind === 'enum') {
      // `includes` on a narrowed union will not take a plain string; the
      // widened view is the point — an unknown value must be rejected, not
      // refused a comparison.
      const options: readonly string[] = field.options
      if (!options.includes(text)) errors.push({ field: field.name, code: 'required' })
      else conditions[field.name] = text
      continue
    }

    const parsed = Number(text)
    if (!Number.isInteger(parsed) || parsed < field.min || parsed > field.max) {
      errors.push({ field: field.name, code: 'range' })
      continue
    }
    conditions[field.name] = parsed
  }

  // The one cross-field rule the server states: a spam rule that counts
  // neither links nor duplicates counts nothing.
  if (
    ruleType === 'spam' &&
    conditions.maxLinks === undefined &&
    conditions.maxDuplicatesPerWindow === undefined
  ) {
    errors.push({ field: 'maxLinks', code: 'spamNeedsOne' })
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, conditions }
}
