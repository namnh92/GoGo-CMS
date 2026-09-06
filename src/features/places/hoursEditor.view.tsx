import { useId, useMemo, useState } from 'react'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { formatDateTime } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { Toggle } from '@/shared/ui/Field'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import { CloseIcon, PlusIcon } from '@/shared/ui/icons'
import type { FieldError } from '@/shared/api/errors'
import {
  DAY_GROUPS,
  DAY_INDEXES,
  DAY_STATES,
  MAX_INTERVALS_PER_DAY,
  addInterval,
  applyIntervalToDays,
  copyDayTo,
  daysThatWouldChange,
  isBlank,
  parseWeek,
  removeInterval,
  setDayState,
  updateInterval,
  type DayIndex,
  type DayState,
  type HoursIssue,
  type WeekDraft,
} from './hoursModel'
import { styles } from './hoursEditor.style'

/**
 * 2024-01-07 is a Sunday, so it is the base date the weekday labels are
 * formatted from — `dayOfWeek` on the wire is 0 = Sunday.
 */
const WEEKDAY_BASE_DATE = Date.UTC(2024, 0, 7)

function useDayNames() {
  const { locale } = useI18n()
  return useMemo(() => {
    const long = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
      weekday: 'long',
      timeZone: 'UTC',
    })
    const short = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
      weekday: 'short',
      timeZone: 'UTC',
    })
    const at = (day: DayIndex) => new Date(WEEKDAY_BASE_DATE + day * 86_400_000)
    return {
      long: (day: DayIndex) => long.format(at(day)),
      short: (day: DayIndex) => short.format(at(day)),
    }
  }, [locale])
}

/** Issues that belong to a given row index, keyed by the sub-field they name. */
function issueFor(
  issues: readonly HoursIssue[],
  rowIndex: number,
  field?: 'openMinute' | 'closeMinute' | 'isOvernight' | 'kind',
): HoursIssue | undefined {
  const prefix = `hours.${rowIndex}`
  return issues.find((issue) =>
    field ? issue.field === `${prefix}.${field}` : issue.field === prefix,
  )
}

export type HoursEditorProps = {
  week: WeekDraft
  onChange: (next: WeekDraft) => void
  disabled: boolean
  /**
   * Rejections from the last save attempt — local or from the server. Both use
   * the request body's field paths, so one renderer covers both.
   */
  serverIssues: readonly FieldError[]
}

/**
 * GoGo-CMS#124 — a week, entered the way a person describes one.
 *
 * The old grid was seven fixed rows of two boxes: one window a day, no way to
 * say "closed" as distinct from "we don't know", no way to say "open around the
 * clock", and no way to fill a week without typing fourteen times. It also
 * parsed every keystroke and discarded anything that did not yet look like a
 * time, so typing `13:00` meant fighting the field.
 *
 * What replaced it:
 *
 *   - a quick-apply that writes one window across a chosen group of days, and
 *     names the days it would overwrite before doing it;
 *   - per-day state — unknown / open / closed / open 24h — with the first two
 *     kept distinct, because rendering "no data" as "closed" is the specific
 *     lie this screen used to tell;
 *   - several windows a day, and an overnight window with a visible label;
 *   - drafts held as the typed string until save.
 *
 * Day groups are *named days*. "Thứ 2–Thứ 6" is Monday to Friday, not "working
 * days": GoGo does not know a place's calendar and must not imply it does.
 */
export function HoursEditor({ week, onChange, disabled, serverIssues }: HoursEditorProps) {
  const t = useT()
  const { locale } = useI18n()
  const dayNames = useDayNames()
  const groupLabelId = useId()

  const [selectedDays, setSelectedDays] = useState<DayIndex[]>([...DAY_GROUPS.all])
  const [quickOpen, setQuickOpen] = useState('')
  const [quickClose, setQuickClose] = useState('')
  const [quickOvernight, setQuickOvernight] = useState(false)
  const [pendingApply, setPendingApply] = useState<DayIndex[] | null>(null)
  const [copyFrom, setCopyFrom] = useState<DayIndex | null>(null)

  /**
   * Live parse, for the row indexes the errors are keyed by. Nothing is
   * rejected while typing — the issues are rendered, the draft is untouched.
   */
  const parsed = useMemo(() => parseWeek(week), [week])

  /**
   * A row's position in the request array, so a server field path
   * (`hours.3.closeMinute`) lands on the input that produced it.
   */
  const rowIndexOf = useMemo(() => {
    const map = new Map<string, number>()
    let index = 0
    for (const day of DAY_INDEXES) {
      const draft = week[day]
      if (draft.state === 'unknown') continue
      if (draft.state !== 'open') {
        map.set(`${day}:state`, index)
        index += 1
        continue
      }
      for (const interval of draft.intervals) {
        if (isBlank(interval)) continue
        map.set(interval.id, index)
        index += 1
      }
    }
    return map
  }, [week])

  const allIssues: HoursIssue[] = useMemo(
    () => [
      ...parsed.issues,
      // Server rejections carry their own message; local ones carry an i18n key.
      ...serverIssues.map((error) => ({ ...error, message: error.message })),
    ],
    [parsed.issues, serverIssues],
  )

  const describeIssue = (issue: HoursIssue) => {
    // A local issue's `message` is an i18n key; a server issue's is prose.
    const translated = t(issue.message as Parameters<typeof t>[0])
    return translated === issue.message ? issue.message : translated
  }

  const toggleDay = (day: DayIndex) =>
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    )

  const selectGroup = (days: readonly DayIndex[]) => setSelectedDays([...days])

  const groupMatches = (days: readonly DayIndex[]) =>
    days.length === selectedDays.length && days.every((day) => selectedDays.includes(day))

  const quickReady =
    !disabled && selectedDays.length > 0 && quickOpen.trim() !== '' && quickClose.trim() !== ''

  const runApply = (days: readonly DayIndex[]) => {
    onChange(
      applyIntervalToDays(week, days, {
        open: quickOpen.trim(),
        close: quickClose.trim(),
        isOvernight: quickOvernight,
      }),
    )
    setPendingApply(null)
  }

  const requestApply = () => {
    const wouldChange = daysThatWouldChange(week, selectedDays)
    // Only days that would lose something need a confirmation; filling blank
    // days is not destructive and should not cost a dialog.
    if (wouldChange.length === 0) {
      runApply(selectedDays)
      return
    }
    setPendingApply(wouldChange)
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.quickApply} aria-labelledby={groupLabelId}>
        <p id={groupLabelId} className={styles.quickTitle}>
          {t('placeEditor.hours.quickTitle')}
        </p>

        <div className={styles.presetRow} role="group" aria-label={t('placeEditor.hours.presets')}>
          {(['all', 'weekdays', 'weekend'] as const).map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={groupMatches(DAY_GROUPS[preset]) ? 'primary' : 'secondary'}
              disabled={disabled}
              aria-pressed={groupMatches(DAY_GROUPS[preset])}
              onClick={() => selectGroup(DAY_GROUPS[preset])}
            >
              {t(`placeEditor.hours.group.${preset}` as const)}
            </Button>
          ))}
        </div>

        <div
          className={styles.dayToggleRow}
          role="group"
          aria-label={t('placeEditor.hours.pickDays')}
        >
          {DAY_INDEXES.map((day) => {
            const on = selectedDays.includes(day)
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                className={`${styles.dayToggle} ${on ? styles.dayToggleOn : styles.dayToggleOff}`}
                onClick={() => toggleDay(day)}
              >
                {/* Selection is never colour alone. */}
                <span aria-hidden="true">{on ? '✓' : '＋'}</span>
                {dayNames.short(day)}
              </button>
            )
          })}
        </div>

        <div className={styles.applyRow}>
          <label className="flex flex-col gap-1">
            <span className={styles.quickTitle}>{t('placeEditor.hours.open')}</span>
            <input
              className={styles.timeInput}
              inputMode="numeric"
              placeholder="08:00"
              disabled={disabled}
              value={quickOpen}
              onChange={(event) => setQuickOpen(event.target.value)}
            />
          </label>
          <span className={styles.dash} aria-hidden="true">
            –
          </span>
          <label className="flex flex-col gap-1">
            <span className={styles.quickTitle}>{t('placeEditor.hours.close')}</span>
            <input
              className={styles.timeInput}
              inputMode="numeric"
              placeholder="22:00"
              disabled={disabled}
              value={quickClose}
              onChange={(event) => setQuickClose(event.target.value)}
            />
          </label>
          <Toggle
            label={t('placeEditor.hours.overnight')}
            checked={quickOvernight}
            disabled={disabled}
            onChange={setQuickOvernight}
          />
          <Button size="sm" variant="secondary" disabled={!quickReady} onClick={requestApply}>
            {t('placeEditor.hours.apply', { count: selectedDays.length })}
          </Button>
        </div>
        <p className={styles.applyHint}>{t('placeEditor.hours.applyHint')}</p>
      </section>

      <div className={styles.dayList}>
        {DAY_INDEXES.map((day) => {
          const draft = week[day]
          const stateRowIndex = rowIndexOf.get(`${day}:state`)
          const stateIssue =
            stateRowIndex === undefined ? undefined : issueFor(allIssues, stateRowIndex, 'kind')
          return (
            <section key={day} className={styles.day} aria-label={dayNames.long(day)}>
              <header className={styles.dayHeader}>
                <h4 className={styles.dayName}>{dayNames.long(day)}</h4>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || draft.state === 'unknown'}
                  onClick={() => setCopyFrom(day)}
                >
                  {t('placeEditor.hours.copyFrom')}
                </Button>
              </header>

              <div
                className={styles.stateRow}
                role="radiogroup"
                aria-label={t('placeEditor.hours.stateFor', { day: dayNames.long(day) })}
              >
                {DAY_STATES.map((state) => {
                  const on = draft.state === state
                  return (
                    <button
                      key={state}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={disabled}
                      className={`${styles.stateChip} ${on ? styles.stateChipOn : styles.stateChipOff}`}
                      onClick={() => onChange(setDayState(week, day, state as DayState))}
                    >
                      <span aria-hidden="true">{on ? '●' : '○'}</span>
                      {t(`placeEditor.hours.state.${state}` as const)}
                    </button>
                  )
                })}
              </div>

              {stateIssue ? (
                <p role="alert" className={styles.rowError}>
                  <span aria-hidden="true">⚠</span>
                  {describeIssue(stateIssue)}
                </p>
              ) : null}

              {draft.state === 'unknown' ? (
                <p className={styles.emptyDay}>{t('placeEditor.hours.unknownHint')}</p>
              ) : null}

              {draft.state === 'open' ? (
                <div className={styles.intervals}>
                  {draft.intervals.map((interval) => {
                    const index = rowIndexOf.get(interval.id)
                    const openIssue =
                      index === undefined ? undefined : issueFor(allIssues, index, 'openMinute')
                    const closeIssue =
                      index === undefined ? undefined : issueFor(allIssues, index, 'closeMinute')
                    const overnightIssue =
                      index === undefined ? undefined : issueFor(allIssues, index, 'isOvernight')
                    const rowIssue = index === undefined ? undefined : issueFor(allIssues, index)
                    const issue = openIssue ?? closeIssue ?? overnightIssue ?? rowIssue
                    return (
                      <div key={interval.id}>
                        <div className={styles.intervalRow}>
                          <input
                            className={styles.timeInput}
                            inputMode="numeric"
                            placeholder="08:00"
                            aria-label={t('placeEditor.hours.openFor', {
                              day: dayNames.long(day),
                            })}
                            aria-invalid={openIssue ? true : undefined}
                            disabled={disabled}
                            value={interval.open}
                            onChange={(event) =>
                              onChange(
                                updateInterval(week, day, interval.id, {
                                  open: event.target.value,
                                }),
                              )
                            }
                          />
                          <span className={styles.dash} aria-hidden="true">
                            –
                          </span>
                          <input
                            className={styles.timeInput}
                            inputMode="numeric"
                            placeholder="22:00"
                            aria-label={t('placeEditor.hours.closeFor', {
                              day: dayNames.long(day),
                            })}
                            aria-invalid={closeIssue ? true : undefined}
                            disabled={disabled}
                            value={interval.close}
                            onChange={(event) =>
                              onChange(
                                updateInterval(week, day, interval.id, {
                                  close: event.target.value,
                                }),
                              )
                            }
                          />
                          <Toggle
                            label={t('placeEditor.hours.overnight')}
                            checked={interval.isOvernight}
                            disabled={disabled}
                            onChange={(checked) =>
                              onChange(
                                updateInterval(week, day, interval.id, { isOvernight: checked }),
                              )
                            }
                          />
                          {interval.source === 'provider' ? (
                            <Badge tone="neutral">{t('placeEditor.hours.fromProvider')}</Badge>
                          ) : null}
                          <button
                            type="button"
                            className={styles.dayToggle + ' ' + styles.dayToggleOff}
                            aria-label={t('placeEditor.hours.removeInterval', {
                              day: dayNames.long(day),
                            })}
                            disabled={disabled}
                            onClick={() => onChange(removeInterval(week, day, interval.id))}
                          >
                            <CloseIcon size={12} />
                          </button>
                        </div>
                        {issue ? (
                          <p role="alert" className={styles.rowError}>
                            <span aria-hidden="true">⚠</span>
                            {describeIssue(issue)}
                          </p>
                        ) : null}
                        {interval.source ? (
                          <p className={styles.meta}>
                            {t('placeEditor.hoursSource', {
                              source: t(`placeEditor.hours.source.${interval.source}` as const),
                              time: interval.verifiedAt
                                ? formatDateTime(interval.verifiedAt, locale)
                                : t('placeEditor.unverified'),
                            })}
                          </p>
                        ) : (
                          <p className={styles.meta}>{t('placeEditor.hoursUnsaved')}</p>
                        )}
                      </div>
                    )
                  })}
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<PlusIcon size={12} />}
                      disabled={disabled || draft.intervals.length >= MAX_INTERVALS_PER_DAY}
                      onClick={() => onChange(addInterval(week, day))}
                    >
                      {t('placeEditor.hours.addInterval')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          )
        })}
      </div>

      <ConfirmDialog
        open={pendingApply !== null}
        onClose={() => setPendingApply(null)}
        onConfirm={() => runApply(selectedDays)}
        title={t('placeEditor.hours.applyConfirmTitle')}
        description={t('placeEditor.hours.applyConfirmBody', {
          count: pendingApply?.length ?? 0,
        })}
        confirmLabel={t('placeEditor.hours.applyConfirm')}
        tone="primary"
        changes={(pendingApply ?? []).map((day) => ({
          label: dayNames.long(day),
          from: summarize(week, day, t, dayNames.long),
          to: `${quickOpen.trim()} – ${quickClose.trim()}${
            quickOvernight ? ` (${t('placeEditor.hours.overnight')})` : ''
          }`,
        }))}
      />

      <ConfirmDialog
        open={copyFrom !== null}
        onClose={() => setCopyFrom(null)}
        onConfirm={() => {
          if (copyFrom !== null) onChange(copyDayTo(week, copyFrom, selectedDays))
          setCopyFrom(null)
        }}
        title={t('placeEditor.hours.copyTitle')}
        description={t('placeEditor.hours.copyBody', {
          day: copyFrom === null ? '' : dayNames.long(copyFrom),
          count: selectedDays.filter((day) => day !== copyFrom).length,
        })}
        confirmLabel={t('placeEditor.hours.copyConfirm')}
        tone="primary"
        changes={selectedDays
          .filter((day) => day !== copyFrom)
          .map((day) => ({
            label: dayNames.long(day),
            from: summarize(week, day, t, dayNames.long),
            to: copyFrom === null ? '' : summarize(week, copyFrom as DayIndex, t, dayNames.long),
          }))}
      />
    </div>
  )
}

/** One line describing a day, for a confirmation that shows what it replaces. */
function summarize(
  week: WeekDraft,
  day: DayIndex,
  t: ReturnType<typeof useT>,
  _name: (day: DayIndex) => string,
): string {
  const draft = week[day]
  if (draft.state === 'unknown') return t('placeEditor.hours.state.unknown')
  if (draft.state === 'closed') return t('placeEditor.hours.state.closed')
  if (draft.state === 'open_24h') return t('placeEditor.hours.state.open_24h')
  const filled = draft.intervals.filter((interval) => !isBlank(interval))
  if (filled.length === 0) return t('placeEditor.hours.state.unknown')
  return filled
    .map(
      (interval) =>
        `${interval.open} – ${interval.close}${
          interval.isOvernight ? ` (${t('placeEditor.hours.overnight')})` : ''
        }`,
    )
    .join(', ')
}
