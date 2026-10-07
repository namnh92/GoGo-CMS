import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import ChangePasswordScreen from '@/features/auth/changePassword.view'
import { AppShell } from './AppShell'
import { Sidebar } from './Sidebar'

afterEach(() => {
  vi.unstubAllEnvs()
  window.sessionStorage.clear()
})

describe('environment awareness (CMS-016)', () => {
  it('names the environment on every screen, from build config', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AppShell />)

    // The badge lives in the shell, so it is on screen whatever route renders.
    expect(await screen.findByText('DEV')).toBeInTheDocument()
  })

  it('warns loudly on production and nowhere else', async () => {
    signInAs('ops_admin')
    const { unmount } = renderWithProviders(<AppShell />)
    expect(screen.queryByText(/PRODUCTION —/)).not.toBeInTheDocument()
    unmount()

    vi.stubEnv('VITE_APP_ENV', 'production')
    renderWithProviders(<AppShell />)

    expect(await screen.findByText(/PRODUCTION —/)).toBeInTheDocument()
    expect(screen.getAllByText('PRODUCTION').length).toBeGreaterThan(0)
  })

  it('falls back to the least alarming environment when the value is junk', async () => {
    signInAs('ops_admin')
    vi.stubEnv('VITE_APP_ENV', 'prod-ish')
    renderWithProviders(<AppShell />)

    expect(await screen.findByText('DEV')).toBeInTheDocument()
    expect(screen.queryByText(/PRODUCTION —/)).not.toBeInTheDocument()
  })
})

describe('grouped navigation (CMS-017)', () => {
  it('groups destinations and opens them by default', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AppShell />)

    const group = await screen.findByRole('button', { name: 'Địa điểm & nội dung' })
    expect(group).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Nhập liệu' })).toBeInTheDocument()
  })

  it('collapses and restores a group from the keyboard alone', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<AppShell />)

    const group = await screen.findByRole('button', { name: 'Địa điểm & nội dung' })
    group.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(group).toHaveAttribute('aria-expanded', 'false'))
    // `hidden` keeps the region addressable by aria-controls while taking its
    // links out of the accessibility tree.
    expect(screen.queryByRole('link', { name: 'Nhập liệu' })).not.toBeInTheDocument()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(group).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByRole('link', { name: 'Nhập liệu' })).toBeInTheDocument()
  })

  it('offers a role only the screens it may open, grouping included', async () => {
    // `editor` is rank 1, so every ops route is unreadable and the whole
    // Vận hành group disappears (CMS-036 moved audit into Quản trị). The
    // Quản trị group still renders: audit and the RBAC description are
    // readable by every role, while the accounts screen stays super-admin.
    signInAs('editor')
    renderWithProviders(<AppShell />)

    expect(await screen.findByRole('link', { name: 'Địa điểm' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Cấu hình' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Chất lượng tìm kiếm' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vận hành' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Quản trị' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nhật ký kiểm toán' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vai trò & quyền' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tài khoản CMS' })).not.toBeInTheDocument()
  })

  it('rolls the pending count up to the group header once it is closed', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<AppShell />)

    const queueLink = await screen.findByRole('link', { name: /Kiểm duyệt/ })
    // The badge only exists once the queue answers; it is a count, not a guess.
    const pending = (await within(queueLink).findByText(/^\d+$/)).textContent
    expect(pending).toBeTruthy()

    const group = screen.getByRole('button', { name: 'Kiểm duyệt' })
    await user.click(group)

    // Closed, the group answers the question the hidden child was answering.
    await waitFor(() => expect(group).toHaveAttribute('aria-expanded', 'false'))
    expect(within(group).getByText(pending!)).toBeInTheDocument()
  })

  it('remembers a collapsed group for the rest of the tab session', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    const first = renderWithProviders(<AppShell />)

    await user.click(await screen.findByRole('button', { name: 'Vận hành' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Vận hành' })).toHaveAttribute(
        'aria-expanded',
        'false',
      ),
    )
    first.unmount()

    renderWithProviders(<AppShell />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Vận hành' })).toHaveAttribute(
        'aria-expanded',
        'false',
      ),
    )
  })
})

describe('sidebar password control (GoGo-BE#687, review F-01)', () => {
  it('is unavailable to the super admin once Access-only, with the reason', async () => {
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        HttpResponse.json({ password: true, accessSso: true, superAdminSsoOnly: true }),
      ),
    )
    signInAs('super_admin')
    renderWithProviders(<AppShell />)
    const control = await screen.findByRole('button', { name: /không có mật khẩu/ })
    expect(control).toBeDisabled()
  })

  it('stays available to other roles', async () => {
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        HttpResponse.json({ password: true, accessSso: true, superAdminSsoOnly: true }),
      ),
    )
    signInAs('editor')
    renderWithProviders(<AppShell />)
    expect(await screen.findByRole('button', { name: 'Đổi mật khẩu' })).toBeEnabled()
  })

  /*
   * Round 2. The first fix read `superAdminSsoOnly === true`, so the control
   * was operable for the super admin while `methods` was pending or failed —
   * leading to a screen whose form can only 403. Unknown reads as unavailable
   * now, and the control's name says which unknown it is.
   */
  it('is unavailable to the super admin while methods is pending, and says so', async () => {
    server.use(http.get('/v1/cms/auth/methods', async () => await delay('infinite')))
    signInAs('super_admin')
    renderWithProviders(<AppShell />)
    const control = await screen.findByRole('button', { name: /Đang kiểm tra quản trị tối cao/ })
    expect(control).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Đổi mật khẩu' })).not.toBeInTheDocument()
  })

  it('is unavailable to the super admin when methods failed, with the reason', async () => {
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        HttpResponse.json(
          { code: 'INTERNAL', message: 'x', request_id: 'r', retryable: true },
          { status: 500 },
        ),
      ),
    )
    signInAs('super_admin')
    renderWithProviders(<AppShell />)
    const control = await screen.findByRole('button', { name: /Không đọc được cách đăng nhập/ })
    expect(control).toBeDisabled()
  })

  it('stays available to other roles when methods failed', async () => {
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        HttpResponse.json(
          { code: 'INTERNAL', message: 'x', request_id: 'r', retryable: true },
          { status: 500 },
        ),
      ),
    )
    signInAs('editor')
    renderWithProviders(<AppShell />)
    expect(await screen.findByRole('button', { name: 'Đổi mật khẩu' })).toBeEnabled()
  })

  it('goes unavailable at once when a password change is refused SUPER_ADMIN_SSO_ONLY', async () => {
    // The race: `methods` said "off" when the shell mounted; the switch flips
    // before the submit, which the server refuses.
    let switchOn = false
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        HttpResponse.json({ password: true, accessSso: true, superAdminSsoOnly: switchOn }),
      ),
      http.post('/v1/cms/auth/change-password', () => {
        switchOn = true
        return HttpResponse.json(
          {
            code: 'SUPER_ADMIN_SSO_ONLY',
            message: 'x',
            field_errors: [],
            request_id: 'r',
            retryable: false,
          },
          { status: 403 },
        )
      }),
    )
    signInAs('super_admin')
    const user = userEvent.setup()
    // The shell's control and the screen it opens, side by side: one cached
    // answer feeds both, so the refusal the screen meets closes the control.
    renderWithProviders(
      <>
        <Sidebar />
        <ChangePasswordScreen />
      </>,
    )
    const aside = await screen.findByRole('complementary')
    expect(await within(aside).findByRole('button', { name: 'Đổi mật khẩu' })).toBeEnabled()

    await user.type(await screen.findByLabelText(/Mật khẩu hiện tại/), 'current-password-1')
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'a-much-longer-password-2')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'a-much-longer-password-2')
    await user.click(screen.getAllByRole('button', { name: 'Đổi mật khẩu' }).at(-1)!)

    const closed = await within(aside).findByRole('button', { name: /không có mật khẩu/ })
    expect(closed).toBeDisabled()
    expect(within(aside).queryByRole('button', { name: 'Đổi mật khẩu' })).not.toBeInTheDocument()
  })
})
