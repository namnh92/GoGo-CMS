import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { en } from './en'
import { I18nProvider, useI18n } from './i18n'
import { vi } from './vi'

function Probe() {
  const { t, setLocale } = useI18n()
  return (
    <>
      <span>{t('placeEditor.lat')}</span>
      <button onClick={() => setLocale('vi')}>vi</button>
    </>
  )
}

afterEach(() => {
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
