import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/shared/i18n/i18n'
import { Select, TextArea, TextInput } from './Field'

/**
 * GoGo-CMS#102 — every form in this console goes through these three
 * primitives, so the association between a control and its message is written
 * once here. It was wired in #131 (`src/shared/ui/Field.tsx`); these cases exist
 * so it cannot be removed without a red test, and so the two shapes that are
 * easy to get wrong stay pinned: a caller's own `aria-describedby` must be kept
 * rather than overwritten, and a control with nothing to say must carry no
 * reference at all.
 */
function wrap(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>)
}

function described(control: HTMLElement): string {
  const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  expect(ids).not.toHaveLength(0)
  return ids
    .map((id) => {
      const node = control.ownerDocument.getElementById(id)
      // A reference to an id that is not in the document announces nothing, so
      // reading the node is the assertion — not the attribute's presence.
      expect(node, `aria-describedby points at missing id "${id}"`).not.toBeNull()
      return node?.textContent ?? ''
    })
    .join(' ')
}

describe('a rejected control points at the reason (GoGo-CMS#102)', () => {
  it('describes a text input by its error', () => {
    wrap(<TextInput label="Email" error="Email không hợp lệ." />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(described(input)).toContain('Email không hợp lệ.')
  })

  it('describes a textarea by its hint when there is no error', () => {
    wrap(<TextArea label="Lý do" hint="Bắt buộc, 3–500 ký tự." />)
    const area = screen.getByLabelText('Lý do')
    // The hint is the case `role="alert"` cannot cover: it is never announced on
    // its own, so without the reference it is purely visual.
    expect(area).not.toHaveAttribute('aria-invalid')
    expect(described(area)).toContain('Bắt buộc, 3–500 ký tự.')
  })

  it('describes a select by its error, not by the hint it replaces', () => {
    wrap(
      <Select label="Vai trò" hint="Chọn một vai trò." error="Chọn vai trò.">
        <option value="editor">editor</option>
      </Select>,
    )
    const select = screen.getByLabelText('Vai trò')
    const text = described(select)
    expect(text).toContain('Chọn vai trò.')
    // Only the error renders, so pointing at a hint id would dangle.
    expect(text).not.toContain('Chọn một vai trò.')
  })

  it('keeps a caller’s own aria-describedby alongside the message', () => {
    wrap(
      <>
        <p id="pwd-policy">Tối thiểu 12 ký tự.</p>
        <TextInput label="Mật khẩu" aria-describedby="pwd-policy" error="Mật khẩu quá ngắn." />
      </>,
    )
    const input = screen.getByLabelText('Mật khẩu')
    const text = described(input)
    expect(text).toContain('Tối thiểu 12 ký tự.')
    expect(text).toContain('Mật khẩu quá ngắn.')
  })

  it('leaves a control with no message undescribed', () => {
    wrap(<TextInput label="Tên hiển thị" />)
    // An attribute pointing at nothing is worse than none: assistive technology
    // reports a description the user never receives.
    expect(screen.getByLabelText('Tên hiển thị')).not.toHaveAttribute('aria-describedby')
  })
})
