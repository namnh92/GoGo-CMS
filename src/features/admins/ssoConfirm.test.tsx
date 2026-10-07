import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import AdminListScreen from './adminList.view'

const CONFIRM = '/v1/cms/auth/super-admin/confirm-sso'
const errorBody = (code: string, message = code) => ({
  code,
  message,
  field_errors: [],
  request_id: 'req-1',
  retryable: false,
})

/** GoGo-BE#687 R4 — the super admin confirms that Access works for its address. */
describe('SSO confirmation card (GoGo-BE#687)', () => {
  it('is shown to the super admin and records the confirmation', async () => {
    server.use(
      http.post(CONFIRM, () =>
        HttpResponse.json(
          { confirmed: true, email: 'boss@gogo.vn', alreadyConfirmed: false },
          { status: 201 },
        ),
      ),
    )
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)
    await user.click(await screen.findByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã xác nhận Cloudflare Access cho boss@gogo.vn.',
    )
  })

  it('says it was already confirmed on a repeat', async () => {
    server.use(
      http.post(CONFIRM, () =>
        HttpResponse.json(
          { confirmed: true, email: 'boss@gogo.vn', alreadyConfirmed: true },
          { status: 201 },
        ),
      ),
    )
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)
    await user.click(await screen.findByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Đã xác nhận trước đó')
  })

  it('explains a password session instead of failing silently', async () => {
    server.use(
      http.post(CONFIRM, () =>
        HttpResponse.json(errorBody('ACCESS_SESSION_REQUIRED'), { status: 403 }),
      ),
    )
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)
    await user.click(await screen.findByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Phiên này mở bằng mật khẩu. Đăng nhập lại qua Cloudflare Access',
    )
  })

  it('says the API does not support it yet on a 404', async () => {
    server.use(http.post(CONFIRM, () => HttpResponse.json(errorBody('NOT_FOUND'), { status: 404 })))
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)
    await user.click(await screen.findByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa hỗ trợ bước xác nhận')
  })

  it('is not shown to any other role', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AdminListScreen />)
    // The page has rendered (header present) before asserting absence.
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText('Xác nhận đăng nhập qua Cloudflare Access')).not.toBeInTheDocument()
  })
})
