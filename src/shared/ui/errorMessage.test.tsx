import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/shared/i18n/i18n'
import { ApiError } from '@/shared/api/errors'
import { useErrorMessage } from './State'

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}

function describeError(error: unknown): string {
  const { result } = renderHook(() => useErrorMessage(), { wrapper })
  return result.current(error)
}

describe('PI-CMS-008 — Google Sheet import error copy', () => {
  it('tells the editor the fault is GoGo’s, not their spreadsheet’s', () => {
    const message = describeError(
      new ApiError({
        code: 'SHEET_PROVIDER_NOT_CONFIGURED',
        // The envelope text from GoGo-BE. The i18n key must win over it, or the
        // string an editor reads is one this repo does not control.
        message: 'GoGo chưa cấu hình kết nối Google Sheets',
        status: 503,
        retryable: false,
      }),
    )

    expect(message).toContain('Liên hệ quản trị hệ thống')
    // The whole defect was sending someone to fix sharing on a document that
    // was already fine. This copy must never point back at their file.
    expect(message).not.toMatch(/quyền|chia sẻ|không tìm thấy/i)
  })

  it('still blames the document when the document really is the problem', () => {
    expect(
      describeError(
        new ApiError({
          code: 'SHEET_PERMISSION_DENIED',
          message: 'ignored',
          status: 403,
        }),
      ),
    ).toBe('GoGo không có quyền đọc bảng tính này.')
  })

  it('falls back to the envelope text for a code it has no key for', () => {
    expect(
      describeError(
        new ApiError({ code: 'SOME_FUTURE_CODE', message: 'Câu từ server', status: 400 }),
      ),
    ).toBe('Câu từ server')
  })
})
