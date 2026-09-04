import { describe, expect, it } from 'vitest'
import { microsToAmountText, microsToMinor, parseAmountToMicros } from './costMoney'

describe('manual cost money (COST-CMS-010)', () => {
  it('parses major units into micros with integer arithmetic', () => {
    expect(parseAmountToMicros('99', 'USD')).toBe(99_000_000)
    expect(parseAmountToMicros('99.99', 'USD')).toBe(99_990_000)
    expect(parseAmountToMicros('0.5', 'USD')).toBe(500_000)
    expect(parseAmountToMicros(' 2500000 ', 'VND')).toBe(2_500_000_000_000)
    expect(parseAmountToMicros('0', 'USD')).toBe(0)
  })

  it('refuses what it cannot represent instead of guessing', () => {
    expect(parseAmountToMicros('99.999', 'USD')).toBeNull() // three decimals for a 2-digit currency
    expect(parseAmountToMicros('1.5', 'VND')).toBeNull() // no minor unit
    expect(parseAmountToMicros('1,000', 'USD')).toBeNull() // separators are ambiguous by locale
    expect(parseAmountToMicros('-5', 'USD')).toBeNull()
    expect(parseAmountToMicros('', 'USD')).toBeNull()
    expect(parseAmountToMicros('abc', 'USD')).toBeNull()
    expect(parseAmountToMicros('9999999999999', 'USD')).toBeNull()
  })

  it('round-trips micros to the text a person typed', () => {
    expect(microsToAmountText(99_990_000, 'USD')).toBe('99.99')
    expect(microsToAmountText(99_000_000, 'USD')).toBe('99.00')
    expect(microsToAmountText(2_500_000_000_000, 'VND')).toBe('2500000')
    for (const text of ['99.99', '0.05', '123']) {
      expect(microsToAmountText(parseAmountToMicros(text, 'USD')!, 'USD')).toBe(
        text.includes('.') ? text : `${text}.00`,
      )
    }
  })

  it('scales micros to the minor units formatMoney takes', () => {
    expect(microsToMinor(99_990_000, 'USD')).toBe(9_999)
    expect(microsToMinor(2_500_000_000_000, 'VND')).toBe(2_500_000)
    expect(microsToMinor(333_333, 'USD')).toBe(33) // a daily share rounds, never truncates to 0.33→33.33
  })
})
