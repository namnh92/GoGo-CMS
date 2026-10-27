import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/shared/test/render'
import LoginScreen from './login.view'

describe('CMS sign-in (CMS-034, stepped)', () => {
  it('signs in with one credentials step — there is no code step any more (GoGo-BE#687 D-4)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)
    // The form renders once the API has said the password door is open.
    await screen.findByLabelText(/Email công việc/)
    expect(screen.queryByLabelText(/Mã xác thực/)).not.toBeInTheDocument()

    let sent: Record<string, unknown> | undefined
    server.use(
      http.post('/v1/cms/auth/login', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          { accessToken: 't', role: 'ops_admin', displayName: 'ops', expiresIn: 900 },
          { status: 201 },
        )
      }),
    )
    await user.type(screen.getByLabelText(/Email công việc/), 'ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    await waitFor(() =>
      expect(sent).toEqual({ email: 'ops@gogo.vn', password: 'correct-horse-battery' }),
    )
    expect(screen.queryByRole('heading', { name: 'Xác thực hai lớp' })).not.toBeInTheDocument()
  })

  it('says Access did not admit the mailbox, not that the password is wrong', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)
    await screen.findByLabelText(/Email công việc/)

    await user.type(screen.getByLabelText(/Email công việc/), 'noaccess@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Cloudflare Access chưa xác nhận email này')
    expect(alert).not.toHaveTextContent('Email hoặc mật khẩu không đúng')
    // The form stays, with what was typed.
    expect(screen.getByLabelText(/Email công việc/)).toHaveValue('noaccess@gogo.vn')
  })

  it('toggles password visibility with a labelled control', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)
    // The form renders once the API has said the password door is open.
    await screen.findByLabelText(/Email công việc/)

    const password = screen.getByLabelText(/Mật khẩu/) as HTMLInputElement
    expect(password.type).toBe('password')
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password.type).toBe('text')
    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(password.type).toBe('password')
  })

  it('replaces the forced change with the SSO confirmation for the super admin, which has no password (PR #235 r3 F-02)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)
    await screen.findByLabelText(/Email công việc/)
    // "temp" owes a change; no role word in the local part → super_admin in the mock.
    await user.type(screen.getByLabelText(/Email công việc/), 'temp.boss@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'temporary-pass-123')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    expect(await screen.findByText(/còn nợ một lần đổi mật khẩu/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Mật khẩu mới/)).not.toBeInTheDocument()
  })

  it('routes into the forced change-password step when a temporary password is outstanding', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)
    // The form renders once the API has said the password door is open.
    await screen.findByLabelText(/Email công việc/)

    // The mock flags any "temp*" local part as owing a password change.
    await user.type(screen.getByLabelText(/Email công việc/), 'temp.ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'temporary-pass-123')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

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
      // The form renders once the API has said the password door is open.
      await screen.findByLabelText(/Email công việc/)

      const email = screen.getByLabelText(/Email công việc/)
      const password = screen.getByLabelText(/Mật khẩu/)
      await user.type(email, 'temp.ops@gogo.vn')
      await user.type(password, 'temporary-pass-123')
      await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

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
    // The form renders once the API has said the password door is open.
    await screen.findByLabelText(/Email công việc/)

    await user.type(screen.getByLabelText(/Email công việc/), 'temp.ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'temporary-pass-123')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
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

  it('states that no token is kept in localStorage', async () => {
    renderWithProviders(<LoginScreen />)
    // The form renders once the API has said the password door is open.
    await screen.findByLabelText(/Email công việc/)
    expect(screen.getByText(/HttpOnly/)).toBeInTheDocument()
  })

  it('names the environment under the form without inferring it from the hostname', async () => {
    renderWithProviders(<LoginScreen />)
    // The form renders once the API has said the password door is open.
    await screen.findByLabelText(/Email công việc/)
    // VITE_APP_ENV is unset in tests, so the config degrades to dev.
    expect(screen.getByText('DEV')).toBeInTheDocument()
  })
})
