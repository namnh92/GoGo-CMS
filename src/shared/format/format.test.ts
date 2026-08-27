import { describe, expect, it } from 'vitest'
import { formatMinuteOfDay, formatMoney, formatMoneyRange, parseMinuteOfDay } from './index'

describe('money', () => {
  it('treats VND as a zero-decimal currency', () => {
    // 90.000 minor units of VND is 90.000 ₫, not 900 ₫.
    expect(formatMoney({ amount: 90_000, currency: 'VND' }, 'vi')).toContain('90.000')
  })

  it('scales two-decimal currencies by their minor unit', () => {
    expect(formatMoney({ amount: 1250, currency: 'USD' }, 'en')).toBe('$12.50')
  })

  it('renders a range and collapses a degenerate one', () => {
    expect(formatMoneyRange(45_000, 90_000, 'VND', 'vi')).toContain('–')
    expect(formatMoneyRange(45_000, 45_000, 'VND', 'vi')).not.toContain('–')
    expect(formatMoneyRange(null, null, 'VND', 'vi')).toBe('—')
  })
})

describe('minute of day', () => {
  it('round-trips the wire format', () => {
    expect(formatMinuteOfDay(450)).toBe('07:30')
    expect(parseMinuteOfDay('07:30')).toBe(450)
  })

  it('rejects impossible clock values', () => {
    expect(parseMinuteOfDay('24:00')).toBeNull()
    expect(parseMinuteOfDay('7:60')).toBeNull()
    expect(parseMinuteOfDay('nonsense')).toBeNull()
  })
})
