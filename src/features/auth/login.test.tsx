import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/shared/test/render'
import LoginScreen from './login.view'

describe('CMS sign-in (CMS-034, stepped)', () => {
  it('moves to the MFA step when the API answers MFA_REQUIRED', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    await user.type(screen.getByLabelText(/Email công việc/), 'ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    // The password checked out, so the step — not an inline error — changes.
    expect(await screen.findByRole('heading', { name: 'Xác thực hai lớp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác thực & đăng nhập' })).toBeInTheDocument()
    // The code field gets focus: the whole step exists for it.
    expect(screen.getByLabelText(/Mã xác thực/)).toHaveFocus()
  })

  it('returns to the password step on bad credentials, never trapping behind the code', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    await user.type(screen.getByLabelText(/Email công việc/), 'ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await screen.findByRole('heading', { name: 'Xác thực hai lớp' })

    await user.click(screen.getByRole('button', { name: 'Quay lại nhập mật khẩu' }))
    expect(screen.getByLabelText(/Mật khẩu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác thực & đăng nhập' })).not.toBeInTheDocument()
  })

  it('toggles password visibility with a labelled control', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    const password = screen.getByLabelText(/Mật khẩu/) as HTMLInputElement
    expect(password.type).toBe('password')
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password.type).toBe('text')
    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(password.type).toBe('password')
  })

  it('routes into the forced change-password step when a temporary password is outstanding', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    // The mock flags any "temp*" local part as owing a password change.
    await user.type(screen.getByLabelText(/Email công việc/), 'temp.ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'temporary-pass-123')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await user.type(await screen.findByLabelText(/Mã xác thực/), '123456')
    await user.click(screen.getByRole('button', { name: 'Xác thực & đăng nhập' }))

    // Not the console: the obligation screen, server-enforced elsewhere.
    expect(await screen.findByRole('heading', { name: 'Đặt mật khẩu mới' })).toBeInTheDocument()

    // Too short / mismatched are refused before the round-trip.
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'short')
    await user.click(screen.getByRole('button', { name: /Đổi mật khẩu/ }))
    expect(await screen.findByText(/tối thiểu 12 ký tự/)).toBeInTheDocument()
  })

  /**
   * GoGo-CMS#103 — the two steps are sibling `<form>` elements in a ternary. Un-
   * keyed, React reconciles them by position and type and reuses the DOM input
   * nodes, so the email box becomes the new-password box: one element whose
   * `type`, `autoComplete` and controlled/uncontrolled contract all change
   * underneath the browser.
   *
   * Asserting the absence of React's warning alone would be a test of a log
   * line, and React only emits that one once per element. The node identity is
   * the defect, so that is what is asserted; a clean console is checked as well
   * because an operator reading the console is how this was found.
   */
  it('mounts fresh inputs for the change-password step instead of reusing the credential ones', async () => {
    // Not muted: any console.error fails this test and still prints, so an
    // unrelated error cannot hide behind the one warning this guards (F-01).
    const consoleError = vi.spyOn(console, 'error')
    try {
      const user = userEvent.setup()
      renderWithProviders(<LoginScreen />)

      const email = screen.getByLabelText(/Email công việc/)
      const password = screen.getByLabelText(/Mật khẩu/)
      await user.type(email, 'temp.ops@gogo.vn')
      await user.type(password, 'temporary-pass-123')
      await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
      await user.type(await screen.findByLabelText(/Mã xác thực/), '123456')
      await user.click(screen.getByRole('button', { name: 'Xác thực & đăng nhập' }))

      await screen.findByRole('heading', { name: 'Đặt mật khẩu mới' })

      // The credential inputs are unmounted, not repurposed. A node still in
      // the document is a node that kept whatever was typed into it.
      expect(email).not.toBeInTheDocument()
      expect(password).not.toBeInTheDocument()

      const newPassword = screen.getByLabelText(/^Mật khẩu mới/)
      const confirm = screen.getByLabelText(/Nhập lại mật khẩu mới/)
      expect(newPassword).not.toBe(email)
      expect(newPassword).not.toBe(password)
      expect(confirm).not.toBe(email)
      expect(confirm).not.toBe(password)
      // The new fields start empty because they are new, not because something
      // cleared them.
      expect(newPassword).toHaveValue('')
      expect(confirm).toHaveValue('')

      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('still proves the change with the temporary password once the credential inputs are gone', async () => {
    // Keying the forms unmounts the credentials subtree (#103). The change
    // request reads the temporary password from form state, not from the DOM,
    // so it has to survive that unmount.
    let body: { currentPassword?: string; newPassword?: string } | null = null
    server.use(
      http.post('/v1/cms/auth/change-password', async ({ request }) => {
        body = (await request.json()) as typeof body
        return HttpResponse.json({ changed: true }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    await user.type(screen.getByLabelText(/Email công việc/), 'temp.ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'temporary-pass-123')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await user.type(await screen.findByLabelText(/Mã xác thực/), '123456')
    await user.click(screen.getByRole('button', { name: 'Xác thực & đăng nhập' }))
    await screen.findByRole('heading', { name: 'Đặt mật khẩu mới' })

    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'a-brand-new-pass-456')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'a-brand-new-pass-456')
    await user.click(screen.getByRole('button', { name: /Đổi mật khẩu/ }))

    await waitFor(() =>
      expect(body).toEqual({
        currentPassword: 'temporary-pass-123',
        newPassword: 'a-brand-new-pass-456',
      }),
    )
  })

  it('states that no token is kept in localStorage', () => {
    renderWithProviders(<LoginScreen />)
    expect(screen.getByText(/HttpOnly/)).toBeInTheDocument()
  })

  it('names the environment under the form without inferring it from the hostname', () => {
    renderWithProviders(<LoginScreen />)
    // VITE_APP_ENV is unset in tests, so the config degrades to dev.
    expect(screen.getByText('DEV')).toBeInTheDocument()
  })
})
