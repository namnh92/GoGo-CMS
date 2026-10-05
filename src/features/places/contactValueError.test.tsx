import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { I18nProvider } from '@/shared/i18n/i18n'
import { usePlaceFieldError } from './placeForm'

/**
 * Sol F-04 — the create and edit forms render a server refusal of a contact
 * value through `usePlaceFieldError`. GoGo-BE#280's codes carry a Vietnamese
 * `message`; the console says them in its own vi / en vocabulary, and a contact
 * code it has no sentence for is the generic refusal in the UI language.
 */
function fieldErrorIn(locale: 'vi' | 'en') {
  window.localStorage.setItem('gogo.cms.locale', locale)
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
  return renderHook(() => usePlaceFieldError(), { wrapper }).result.current
}

const CASES = [
  ['phone', 'no_country', 'Thiếu mã quốc gia hoặc số 0 đầu', /^Add a country code/],
  ['phone', 'invalid', 'Số điện thoại không hợp lệ', /^Invalid phone number$/],
  ['phone', 'too_long', 'Số điện thoại quá dài', /at most 40 characters/],
  ['website', 'credentials', 'Website không được chứa tài khoản', /username or password/],
  ['website', 'invalid', 'Website phải là địa chỉ http hoặc https hợp lệ', /public http or https/],
  ['addressText', 'blank', 'Địa chỉ trống', /^The address is empty$/],
  ['addressText', 'too_long', 'Địa chỉ quá dài', /at most 400 characters/],
] as const

describe('contact value refusals on the create / edit forms', () => {
  it.each(CASES)('%s %s reads in English, not as the server text', (field, code, message, en) => {
    const text = fieldErrorIn('en')(field, { code, message })
    expect(text).toMatch(en)
    expect(text).not.toBe(message)
  })

  it.each(CASES)('%s %s has a Vietnamese sentence of its own', (field, code, message) => {
    const text = fieldErrorIn('vi')(field, { code, message })
    expect(text).not.toBe('')
    expect(text).not.toMatch(/^Add|^Invalid|^The /)
  })

  it('an unknown contact code is the generic refusal, never the server text', () => {
    const text = fieldErrorIn('en')('phone', { code: 'something_new', message: 'Tiếng Việt' })
    expect(text).not.toBe('Tiếng Việt')
  })
})
