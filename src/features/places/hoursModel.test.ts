import { describe, expect, it } from 'vitest'
import {
  DAY_GROUPS,
  applyIntervalToDays,
  copyDayTo,
  daysThatWouldChange,
  emptyInterval,
  emptyWeek,
  parseWeek,
  removeInterval,
  setDayState,
  updateInterval,
  weekFromServer,
  weekSignature,
  type DayIndex,
  type WeekDraft,
} from './hoursModel'
import type { PlaceHour } from '@/shared/api/contracts'

const serverRow = (over: Partial<PlaceHour> & { dayOfWeek: number }): PlaceHour => ({
  kind: 'interval',
  openMinute: 8 * 60,
  closeMinute: 22 * 60,
  isOvernight: false,
  source: 'editor',
  verifiedAt: null,
  ...over,
})

function openDay(week: WeekDraft, day: DayIndex, open: string, close: string, overnight = false) {
  return {
    ...week,
    [day]: {
      state: 'open' as const,
      intervals: [emptyInterval({ open, close, isOvernight: overnight })],
    },
  }
}

describe('weekFromServer', () => {
  it('groups flat rows into days and keeps several services on one day', () => {
    const week = weekFromServer([
      serverRow({ dayOfWeek: 1, openMinute: 11 * 60, closeMinute: 14 * 60 }),
      serverRow({ dayOfWeek: 1, openMinute: 17 * 60, closeMinute: 22 * 60 }),
    ])
    expect(week[1].state).toBe('open')
    expect(week[1].intervals.map((i) => [i.open, i.close])).toEqual([
      ['11:00', '14:00'],
      ['17:00', '22:00'],
    ])
  })

  it('keeps closed, open-24h and unknown apart', () => {
    const week = weekFromServer([
      serverRow({ dayOfWeek: 0, kind: 'closed', openMinute: 0, closeMinute: 0 }),
      serverRow({ dayOfWeek: 6, kind: 'open_24h', openMinute: 0, closeMinute: 0 }),
    ])
    expect(week[0].state).toBe('closed')
    expect(week[6].state).toBe('open_24h')
    // A day with no row is unknown, which is not the same fact as closed.
    expect(week[3].state).toBe('unknown')
  })

  it('carries provider provenance through so a re-save does not claim it', () => {
    const week = weekFromServer([
      serverRow({ dayOfWeek: 2, source: 'provider', verifiedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(week[2].intervals[0]).toMatchObject({
      source: 'provider',
      verifiedAt: '2026-01-01T00:00:00.000Z',
    })
  })
})

describe('parseWeek', () => {
  it('turns one applied window into seven rows', () => {
    const week = applyIntervalToDays(emptyWeek(), DAY_GROUPS.all, {
      open: '08:00',
      close: '22:00',
      isOvernight: false,
    })
    const { rows, issues } = parseWeek(week)
    expect(issues).toEqual([])
    expect(rows).toHaveLength(7)
    expect(rows[0]).toMatchObject({
      dayOfWeek: 0,
      kind: 'interval',
      openMinute: 480,
      closeMinute: 1320,
    })
  })

  it('omits unknown days entirely — absence is the wire encoding', () => {
    const week = openDay(emptyWeek(), 1, '08:00', '22:00')
    const { rows } = parseWeek(week)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.dayOfWeek).toBe(1)
  })

  it('sends closed and open-24h with zeroed minutes', () => {
    let week = setDayState(emptyWeek(), 0, 'closed')
    week = setDayState(week, 6, 'open_24h')
    const { rows, issues } = parseWeek(week)
    expect(issues).toEqual([])
    expect(rows).toEqual([
      { dayOfWeek: 0, kind: 'closed', openMinute: 0, closeMinute: 0, isOvernight: false },
      { dayOfWeek: 6, kind: 'open_24h', openMinute: 0, closeMinute: 0, isOvernight: false },
    ])
  })

  it('keeps an overnight window and the next morning apart', () => {
    let week = openDay(emptyWeek(), 5, '18:00', '02:00', true)
    week = openDay(week, 6, '09:00', '12:00')
    const { rows, issues } = parseWeek(week)
    expect(issues).toEqual([])
    expect(rows.find((r) => r.dayOfWeek === 5)).toMatchObject({
      isOvernight: true,
      closeMinute: 120,
    })
  })

  it('rejects two services that overlap on one day', () => {
    const week: WeekDraft = {
      ...emptyWeek(),
      1: {
        state: 'open',
        intervals: [
          emptyInterval({ open: '08:00', close: '14:00' }),
          emptyInterval({ open: '13:00', close: '20:00' }),
        ],
      },
    }
    const { issues } = parseWeek(week)
    expect(issues).toEqual([expect.objectContaining({ field: 'hours.1', code: 'overlapping' })])
  })

  it('rejects an overnight window colliding with the next morning across the week wrap', () => {
    let week = openDay(emptyWeek(), 6, '22:00', '03:00', true)
    week = openDay(week, 0, '01:00', '05:00')
    const { issues } = parseWeek(week)
    expect(issues).toEqual([expect.objectContaining({ code: 'overlapping' })])
  })

  it('rejects a close that is not after the open', () => {
    const { issues } = parseWeek(openDay(emptyWeek(), 2, '20:00', '09:00'))
    expect(issues).toEqual([
      expect.objectContaining({ field: 'hours.0.closeMinute', code: 'not_after_open' }),
    ])
  })

  it('rejects a same-day window marked overnight', () => {
    const { issues } = parseWeek(openDay(emptyWeek(), 2, '09:00', '17:00', true))
    expect(issues).toEqual([
      expect.objectContaining({ field: 'hours.0.isOvernight', code: 'not_overnight' }),
    ])
  })

  it('rejects an unparseable time against the field that holds it', () => {
    const { issues } = parseWeek(openDay(emptyWeek(), 2, '25:00', '17:00'))
    expect(issues).toEqual([
      expect.objectContaining({ field: 'hours.0.openMinute', code: 'out_of_range' }),
    ])
  })

  it('ignores a row the editor has not filled in yet', () => {
    const week: WeekDraft = {
      ...emptyWeek(),
      1: {
        state: 'open',
        intervals: [emptyInterval({ open: '08:00', close: '12:00' }), emptyInterval()],
      },
    }
    const { rows, issues } = parseWeek(week)
    expect(issues).toEqual([])
    expect(rows).toHaveLength(1)
  })

  it('rejects a fifth service on one day', () => {
    const week: WeekDraft = {
      ...emptyWeek(),
      1: {
        state: 'open',
        intervals: [
          emptyInterval({ open: '01:00', close: '02:00' }),
          emptyInterval({ open: '03:00', close: '04:00' }),
          emptyInterval({ open: '05:00', close: '06:00' }),
          emptyInterval({ open: '07:00', close: '08:00' }),
          emptyInterval({ open: '09:00', close: '10:00' }),
        ],
      },
    }
    const { issues } = parseWeek(week)
    expect(issues).toEqual([expect.objectContaining({ code: 'too_many_intervals' })])
  })

  it('carries `source: provider` back so re-saving is not a verification', () => {
    const week = weekFromServer([serverRow({ dayOfWeek: 2, source: 'provider' })])
    const { rows } = parseWeek(week)
    expect(rows[0]).toMatchObject({ source: 'provider' })
  })
})

describe('day groups', () => {
  it('names days rather than inferring a working week', () => {
    expect(DAY_GROUPS.weekdays).toEqual([1, 2, 3, 4, 5])
    expect(DAY_GROUPS.weekend).toEqual([0, 6])
    expect(DAY_GROUPS.all).toHaveLength(7)
  })

  it('applies one window to a group and leaves every other day alone', () => {
    const before = openDay(emptyWeek(), 3, '10:00', '20:00')
    const after = applyIntervalToDays(before, DAY_GROUPS.weekend, {
      open: '09:00',
      close: '23:00',
      isOvernight: false,
    })
    expect(after[0].intervals[0]).toMatchObject({ open: '09:00', close: '23:00' })
    expect(after[6].intervals[0]).toMatchObject({ open: '09:00', close: '23:00' })
    // Wednesday was not in the group.
    expect(after[3].intervals[0]).toMatchObject({ open: '10:00', close: '20:00' })
  })

  it('names only the days a quick-apply would overwrite', () => {
    let week = openDay(emptyWeek(), 6, '10:00', '20:00')
    week = setDayState(week, 0, 'closed')
    expect(daysThatWouldChange(week, [0, 1, 6]).sort()).toEqual([0, 6])
  })

  it('an applied window is the editor’s own claim, with no inherited source', () => {
    const week = weekFromServer([serverRow({ dayOfWeek: 1, source: 'provider' })])
    const after = applyIntervalToDays(week, [1], {
      open: '09:00',
      close: '17:00',
      isOvernight: false,
    })
    expect(after[1].intervals[0]!.source).toBeUndefined()
  })

  it('copies one day onto others without touching the source day', () => {
    let week = openDay(emptyWeek(), 1, '11:00', '14:00')
    week = copyDayTo(week, 1, [2, 3])
    expect(week[2].intervals[0]).toMatchObject({ open: '11:00', close: '14:00' })
    expect(week[3].intervals[0]).toMatchObject({ open: '11:00', close: '14:00' })
    expect(week[1].intervals).toHaveLength(1)
  })
})

describe('editing a day', () => {
  it('keeps intervals through a trip to closed and back', () => {
    let week = openDay(emptyWeek(), 4, '08:00', '17:00')
    week = setDayState(week, 4, 'closed')
    expect(parseWeek(week).rows[0]).toMatchObject({ kind: 'closed' })
    week = setDayState(week, 4, 'open')
    expect(week[4].intervals[0]).toMatchObject({ open: '08:00', close: '17:00' })
  })

  it('drops a day back to unknown when its last window is removed', () => {
    const week = openDay(emptyWeek(), 4, '08:00', '17:00')
    const id = week[4].intervals[0]!.id
    expect(removeInterval(week, 4, id)[4].state).toBe('unknown')
  })

  it('editing a provider row makes it the editor’s claim', () => {
    const week = weekFromServer([serverRow({ dayOfWeek: 2, source: 'provider' })])
    const id = week[2].intervals[0]!.id
    const after = updateInterval(week, 2, id, { close: '23:00' })
    expect(after[2].intervals[0]!.source).toBe('editor')
  })

  it('a signature ignores generated ids and row order', () => {
    const a = weekFromServer([
      serverRow({ dayOfWeek: 1, openMinute: 600, closeMinute: 1200 }),
      serverRow({ dayOfWeek: 1, openMinute: 60, closeMinute: 120 }),
    ])
    const b = weekFromServer([
      serverRow({ dayOfWeek: 1, openMinute: 60, closeMinute: 120 }),
      serverRow({ dayOfWeek: 1, openMinute: 600, closeMinute: 1200 }),
    ])
    expect(weekSignature(a)).toBe(weekSignature(b))
  })
})
