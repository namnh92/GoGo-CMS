import { describe, expect, it } from 'vitest'
import { displayDuration, durationSeconds, MAX_TTL_SECONDS } from './duration'

describe('invite duration conversion', () => {
  it.each([1, 300, 86400, 172800, 172801, 2147483647])('preserves %i seconds exactly', (value) => {
    expect(durationSeconds(String(value), 'seconds')).toBe(value)
  })
  it.each(['', '0', '-1', '1.5', '1e3', 'Infinity', 'abc', ' 1 ', '9007199254740992'])(
    'rejects %s without rounding or coercion',
    (value) => {
      expect(durationSeconds(value, 'hours')).toBeNull()
    },
  )
  it('converts every unit and exposes overflow after conversion', () => {
    expect(durationSeconds('5', 'minutes')).toBe(300)
    expect(durationSeconds('24', 'hours')).toBe(86400)
    expect(durationSeconds('2', 'days')).toBe(172800)
    expect(durationSeconds('24856', 'days')).toBeGreaterThan(MAX_TTL_SECONDS)
    expect(displayDuration(86400)).toEqual({ value: '24', unit: 'hours' })
    expect(displayDuration(301)).toEqual({ value: '301', unit: 'seconds' })
  })
})
