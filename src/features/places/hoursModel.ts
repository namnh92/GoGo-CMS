import { formatMinuteOfDay, parseMinuteOfDay } from '@/shared/format'
import type { PlaceHour, PlaceHourInput, HoursEntryKind } from '@/shared/api/contracts'

/**
 * The week an editor is holding, as opposed to the week the server stores.
 *
 * These are different shapes on purpose. The wire carries a flat list of rows,
 * each already a valid interval in minutes; a person types `1`, then `13`, then
 * `13:`, then `13:0`, and only the last of those parses. The old editor parsed
 * on every keystroke and dropped anything that did not — so typing a time was
 * a fight, and a half-typed value vanished the moment focus moved
 * (GoGo-CMS#124).
 *
 * So a draft keeps the **string the editor typed** and converts once, on save.
 * Validation mirrors `libs/modules/cms/domain/place-hours.ts` in GoGo-BE,
 * including its issue codes, so a rejection raised here and a rejection
 * returned by the server read identically.
 */

/** 0 = Sunday … 6 = Saturday — the convention `vnDayMinute()` derives on GoGo-BE. */
export const DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const
export type DayIndex = (typeof DAY_INDEXES)[number]

/**
 * What a day asserts.
 *
 * `unknown` is the absence of any row on the wire — GoGo-BE deliberately has no
 * `unknown` kind, because "we have no data" is not something a row asserts
 * about a place (ADR-0016). It exists here because a *form* does have to render
 * that state, and rendering it as "closed" is the specific lie this task
 * exists to stop.
 */
export type DayState = 'unknown' | 'closed' | 'open_24h' | 'open'

export const DAY_STATES: readonly DayState[] = ['unknown', 'open', 'closed', 'open_24h']

export type IntervalDraft = {
  /** Stable across re-renders so an input keeps focus while its row moves. */
  id: string
  open: string
  close: string
  isOvernight: boolean
  /**
   * Carried back unchanged for a row that came from the provider. Re-saving a
   * provider week must not claim GoGo checked it
   * (GOGO_PRODUCT_DATA_ARCHITECTURE.md), and the server only stamps
   * verification on `editor` rows.
   */
  source?: 'provider' | 'editor' | undefined
  /** Server stamps, read-only; absent on a row typed here and not yet saved. */
  verifiedAt?: string | null | undefined
}

export type DayDraft = { state: DayState; intervals: IntervalDraft[] }
export type WeekDraft = Record<DayIndex, DayDraft>

export type HoursIssue = { field: string; code: string; message: string }

/** Seven days × at most four services; the server caps the whole week at 28 rows. */
export const MAX_INTERVALS_PER_DAY = 4

let counter = 0
function nextId(): string {
  counter += 1
  return `h${counter}`
}

export function emptyInterval(overrides: Partial<IntervalDraft> = {}): IntervalDraft {
  return { id: nextId(), open: '', close: '', isOvernight: false, ...overrides }
}

export function emptyWeek(): WeekDraft {
  const blank = (): DayDraft => ({ state: 'unknown', intervals: [] })
  return { 0: blank(), 1: blank(), 2: blank(), 3: blank(), 4: blank(), 5: blank(), 6: blank() }
}

/** The wire's flat rows, grouped back into the seven days a form renders. */
export function weekFromServer(hours: readonly PlaceHour[]): WeekDraft {
  const week = emptyWeek()
  for (const hour of hours) {
    const day = week[hour.dayOfWeek as DayIndex]
    if (!day) continue
    // A `closed` / `open_24h` row is the only row for its day, so the last one
    // wins rather than being merged into a list it does not belong to.
    if (hour.kind === 'closed' || hour.kind === 'open_24h') {
      week[hour.dayOfWeek as DayIndex] = { state: hour.kind, intervals: [] }
      continue
    }
    day.state = 'open'
    day.intervals.push(
      emptyInterval({
        open: formatMinuteOfDay(hour.openMinute),
        close: formatMinuteOfDay(hour.closeMinute),
        isOvernight: hour.isOvernight,
        source: hour.source === 'provider' ? 'provider' : 'editor',
        verifiedAt: hour.verifiedAt ?? null,
      }),
    )
  }
  return week
}

/**
 * A comparable snapshot, so "has this week changed" does not depend on the
 * generated interval ids or on the order rows came back in.
 */
export function weekSignature(week: WeekDraft): string {
  return DAY_INDEXES.map((day) => {
    const draft = week[day]
    const rows = draft.intervals
      .map((i) => `${i.open}-${i.close}-${i.isOvernight ? 'o' : ''}-${i.source ?? ''}`)
      .sort()
      .join(',')
    return `${day}:${draft.state}:${rows}`
  }).join('|')
}

const MINUTES_PER_DAY = 1440
const WEEK_MINUTES = 7 * MINUTES_PER_DAY

type Span = { index: number; day: DayIndex; start: number; end: number }

function overlaps(a: Span, b: Span): boolean {
  // The week wraps: a Saturday-night span runs past the end of the line and
  // lands back at Sunday 00:00, so each pair is compared in both positions.
  for (const shift of [-WEEK_MINUTES, 0, WEEK_MINUTES]) {
    if (a.start < b.end + shift && b.start + shift < a.end) return true
  }
  return false
}

/**
 * A day is `open` but has no interval anyone could act on. Not an error while
 * the editor is still typing — an empty row they have not filled in yet — so
 * it is reported only as "nothing to save for this day".
 */
export function isBlank(interval: IntervalDraft): boolean {
  return interval.open.trim() === '' && interval.close.trim() === ''
}

export type WeekParse = { rows: PlaceHourInput[]; issues: HoursIssue[] }

/**
 * Draft → wire, with every reason it cannot go.
 *
 * Field paths follow the request body (`hours.<n>.closeMinute`), matching what
 * GoGo-BE's `ZodValidationPipe` and `validateWeek` return, so one renderer
 * handles both a local rejection and a server one.
 */
export function parseWeek(week: WeekDraft): WeekParse {
  const rows: PlaceHourInput[] = []
  const issues: HoursIssue[] = []
  const spans: Span[] = []
  // Index in the request array, which is what a server field path names.
  let rowIndex = 0

  for (const day of DAY_INDEXES) {
    const draft = week[day]

    if (draft.state === 'unknown') continue

    if (draft.state === 'closed' || draft.state === 'open_24h') {
      rows.push({
        dayOfWeek: day,
        kind: draft.state,
        openMinute: 0,
        closeMinute: 0,
        isOvernight: false,
      })
      if (draft.state === 'open_24h') {
        const start = day * MINUTES_PER_DAY
        spans.push({ index: rowIndex, day, start, end: start + MINUTES_PER_DAY })
      }
      rowIndex += 1
      continue
    }

    const filled = draft.intervals.filter((interval) => !isBlank(interval))
    if (filled.length > MAX_INTERVALS_PER_DAY) {
      issues.push({
        field: `hours.${rowIndex + MAX_INTERVALS_PER_DAY}`,
        code: 'too_many_intervals',
        message: 'placeEditor.hours.error.tooMany',
      })
    }

    for (const interval of filled) {
      const index = rowIndex
      const field = `hours.${index}`
      const open = parseMinuteOfDay(interval.open)
      const close = parseMinuteOfDay(interval.close)

      if (open === null) {
        issues.push({
          field: `${field}.openMinute`,
          code: 'out_of_range',
          message: 'placeEditor.hours.error.time',
        })
      }
      if (close === null) {
        issues.push({
          field: `${field}.closeMinute`,
          code: 'out_of_range',
          message: 'placeEditor.hours.error.time',
        })
      }
      if (open === null || close === null) {
        rowIndex += 1
        continue
      }

      if (interval.isOvernight) {
        // A span the editor called overnight but that ends later the same day
        // is not overnight; storing it would record a wrap that is not there.
        if (close > open) {
          issues.push({
            field: `${field}.isOvernight`,
            code: 'not_overnight',
            message: 'placeEditor.hours.error.notOvernight',
          })
        }
      } else if (close <= open) {
        issues.push({
          field: `${field}.closeMinute`,
          code: 'not_after_open',
          message: 'placeEditor.hours.error.notAfterOpen',
        })
      }

      const start = day * MINUTES_PER_DAY + open
      const length = interval.isOvernight ? MINUTES_PER_DAY - open + close : close - open
      spans.push({ index, day, start, end: start + length })
      rows.push({
        dayOfWeek: day,
        kind: 'interval',
        openMinute: open,
        closeMinute: close,
        isOvernight: interval.isOvernight,
        ...(interval.source ? { source: interval.source } : {}),
      })
      rowIndex += 1
    }
  }

  // Overlap only once every row is individually sound: spans derived from a
  // reversed or unparseable interval produce confusing extra errors on top of
  // the real one.
  if (issues.length === 0) {
    for (let i = 0; i < spans.length; i += 1) {
      for (let j = i + 1; j < spans.length; j += 1) {
        if (overlaps(spans[i]!, spans[j]!)) {
          const later = Math.max(spans[i]!.index, spans[j]!.index)
          issues.push({
            field: `hours.${later}`,
            code: 'overlapping',
            message: 'placeEditor.hours.error.overlapping',
          })
        }
      }
    }
  }

  return { rows, issues }
}

/** Day groups the quick-apply offers. Never inferred from a holiday calendar. */
export type DayGroupId = 'all' | 'weekdays' | 'weekend' | 'custom'

export const DAY_GROUPS: Record<Exclude<DayGroupId, 'custom'>, DayIndex[]> = {
  all: [0, 1, 2, 3, 4, 5, 6],
  /** Monday–Friday as *named days*, not "working days" — GoGo does not know a place's calendar. */
  weekdays: [1, 2, 3, 4, 5],
  weekend: [0, 6],
}

/**
 * Which of the chosen days already carry something a quick-apply would replace.
 *
 * The apply is destructive per day, so the confirmation names the days that
 * lose data rather than asking "are you sure" about the whole week.
 */
export function daysThatWouldChange(week: WeekDraft, days: readonly DayIndex[]): DayIndex[] {
  return days.filter((day) => {
    const draft = week[day]
    if (draft.state !== 'unknown' && draft.state !== 'open') return true
    return draft.intervals.some((interval) => !isBlank(interval))
  })
}

/** Replace the chosen days with one interval; every other day is untouched. */
export function applyIntervalToDays(
  week: WeekDraft,
  days: readonly DayIndex[],
  interval: { open: string; close: string; isOvernight: boolean },
): WeekDraft {
  const next = { ...week }
  for (const day of days) {
    next[day] = {
      state: 'open',
      // A newly applied row carries no `source`: it is the editor's own, and
      // the server stamps it verified. Nothing is inherited from what it
      // replaced, which would borrow a provenance it does not have.
      intervals: [emptyInterval({ ...interval })],
    }
  }
  return next
}

/** Replace the chosen days with another day's schedule, ids regenerated. */
export function copyDayTo(week: WeekDraft, from: DayIndex, days: readonly DayIndex[]): WeekDraft {
  const source = week[from]
  const next = { ...week }
  for (const day of days) {
    if (day === from) continue
    next[day] = {
      state: source.state,
      intervals: source.intervals.map((interval) =>
        emptyInterval({
          open: interval.open,
          close: interval.close,
          isOvernight: interval.isOvernight,
          ...(interval.source ? { source: interval.source } : {}),
        }),
      ),
    }
  }
  return next
}

export function setDayState(week: WeekDraft, day: DayIndex, state: DayState): WeekDraft {
  const current = week[day]
  return {
    ...week,
    [day]: {
      state,
      // Intervals survive a trip through `closed` and back, so a mis-click does
      // not destroy a schedule the editor spent time on. They are simply not
      // sent while the day asserts something else.
      intervals:
        state === 'open' && current.intervals.length === 0 ? [emptyInterval()] : current.intervals,
    },
  }
}

export function updateInterval(
  week: WeekDraft,
  day: DayIndex,
  id: string,
  patch: Partial<Omit<IntervalDraft, 'id'>>,
): WeekDraft {
  return {
    ...week,
    [day]: {
      ...week[day],
      intervals: week[day].intervals.map((interval) =>
        interval.id === id
          ? {
              ...interval,
              ...patch,
              // Editing a provider row makes it the editor's claim. Keeping
              // `provider` would credit Google with what a person just typed.
              ...(patch.source === undefined && interval.source === 'provider'
                ? { source: 'editor' as const }
                : {}),
            }
          : interval,
      ),
    },
  }
}

export function addInterval(week: WeekDraft, day: DayIndex): WeekDraft {
  return {
    ...week,
    [day]: { ...week[day], intervals: [...week[day].intervals, emptyInterval()] },
  }
}

export function removeInterval(week: WeekDraft, day: DayIndex, id: string): WeekDraft {
  const remaining = week[day].intervals.filter((interval) => interval.id !== id)
  return {
    ...week,
    // Removing the last interval leaves the day `open` with nothing to say,
    // which is not a fact — it drops back to unknown.
    [day]:
      remaining.length === 0
        ? { state: 'unknown', intervals: [] }
        : { ...week[day], intervals: remaining },
  }
}

/** The wire `kind` a day maps to, for the read-only summary line. */
export function dayKind(state: DayState): HoursEntryKind | null {
  if (state === 'closed') return 'closed'
  if (state === 'open_24h') return 'open_24h'
  if (state === 'open') return 'interval'
  return null
}
