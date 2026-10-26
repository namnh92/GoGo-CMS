import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { en } from './en'
import { I18nProvider, useI18n } from './i18n'
import { vi } from './vi'

// What <html lang> said while each render ran — before React commits, so
// before any effect could have corrected it.
const langDuringRender: string[] = []

function Probe() {
  const { t, setLocale } = useI18n()
  langDuringRender.push(document.documentElement.lang)
  return (
    <>
      <span>{t('placeEditor.lat')}</span>
      <button onClick={() => setLocale('vi')}>vi</button>
    </>
  )
}

afterEach(() => {
  langDuringRender.length = 0
  window.localStorage.clear()
  document.documentElement.lang = 'vi'
})

describe('I18nProvider (#240)', () => {
  it('sets <html lang> from the stored locale on the first render', () => {
    window.localStorage.setItem('gogo.cms.locale', 'en')
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(langDuringRender[0]).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByText('Latitude')).toBeInTheDocument()
  })

  it('follows a locale change', () => {
    window.localStorage.setItem('gogo.cms.locale', 'en')
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    act(() => screen.getByRole('button', { name: 'vi' }).click())
    expect(langDuringRender.at(-1)).toBe('vi')
    expect(document.documentElement.lang).toBe('vi')
    expect(screen.getByText('Vĩ độ')).toBeInTheDocument()
  })
})

describe('English catalogue (#240)', () => {
  // The place form is read field by field with a screen reader; a label that
  // falls back to Vietnamese is announced with English rules and its hint in
  // English. Every place editor key has an English text.
  it('translates every place editor key', () => {
    const missing = (Object.keys(vi) as (keyof typeof vi)[])
      .filter((key) => key.startsWith('placeEditor.'))
      .filter((key) => !(key in en))
    expect(missing).toEqual([])
  })
})

/**
 * #247 — parity. `en` used to lack 472 of the `vi` keys and fell back to
 * Vietnamese key by key, so an English screen read in two languages at once
 * (settings, places, audit). Every key, not just one feature's prefix.
 */
describe('vi/en parity (#247)', () => {
  const placeholders = (message: string) =>
    [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

  it('has an English text for every Vietnamese key', () => {
    const missing = Object.keys(vi).filter((key) => !(key in en))
    expect(missing).toEqual([])
  })

  it('has no English key the Vietnamese catalogue does not define', () => {
    const extra = Object.keys(en).filter((key) => !(key in vi))
    expect(extra).toEqual([])
  })

  it('uses the same interpolation placeholders in both locales', () => {
    const mismatched = (Object.keys(vi) as (keyof typeof vi)[])
      .filter((key) => key in en)
      .filter((key) => placeholders(vi[key]).join(',') !== placeholders(en[key]!).join(','))
    expect(mismatched).toEqual([])
  })

  it('has no Vietnamese text left in the English catalogue', () => {
    // A key present but holding the Vietnamese string is the same bug as a
    // missing one; a copy-paste fill would pass the parity check above.
    const vietnamese = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
    const leftovers = Object.entries(en)
      .filter(([, message]) => vietnamese.test(message ?? ''))
      .map(([key]) => key)
    expect(leftovers).toEqual([])
  })

  it('leaves no English text blank', () => {
    const blank = Object.entries(en)
      .filter(([, message]) => !message?.trim())
      .map(([key]) => key)
    expect(blank).toEqual([])
  })
})
