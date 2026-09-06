import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import ChangePasswordScreen from './changePassword.view'

const CURRENT = 'current-password-1'
const NEXT = 'a-much-longer-password-2'

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  values: { current?: string; next?: string; confirm?: string } = {},
) {
  await user.type(screen.getByLabelText(/Mật khẩu hiện tại/), values.current ?? CURRENT)
  await user.type(screen.getByLabelText(/^Mật khẩu mới/), values.next ?? NEXT)
  await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), values.confirm ?? NEXT)
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getAllByRole('button', { name: 'Đổi mật khẩu' }).at(-1)!)

describe('ChangePasswordScreen (CMS-032)', () => {
  /*
   * The console called `POST /cms/auth/change-password` in exactly one place —
   * the forced step after a temporary password. Rotating on purpose had no
   * entry point, which matters most for the one account nobody else can reset.
   */
  it('is reachable by every role, not only after a reset', async () => {
    for (const role of ['editor', 'moderator', 'ops_admin', 'super_admin'] as const) {
      signInAs(role)
      const { unmount } = renderWithProviders(<ChangePasswordScreen />)
      expect(await screen.findByLabelText(/Mật khẩu hiện tại/)).toBeInTheDocument()
      unmount()
    }
  })

  it('says what happens to other sessions before the submit, not after', async () => {
    signInAs('super_admin')
    renderWithProviders(<ChangePasswordScreen />)

    // The consequence is on the page from the start: a rotation is also how
    // someone answers a suspected compromise, and they need to know their other
    // devices are about to be signed out — and that this tab is not.
    const note = await screen.findByText(/Phiên hiện tại \(tab này\) được giữ nguyên/)
    expect(note).toBeInTheDocument()
    expect(note).toHaveTextContent(/Mọi phiên khác/)
    expect(note).toHaveTextContent(/audit log/)
  })

  it('changes the password and confirms what is now true', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordScreen />)

    await screen.findByLabelText(/Mật khẩu hiện tại/)
    await fill(user)
    await submit(user)

    expect(await screen.findByText(/Mật khẩu mới có hiệu lực ngay/)).toBeInTheDocument()
    // Fields cleared: the values are credentials, and one of them is now stale.
    await waitFor(() => expect(screen.getByLabelText(/Mật khẩu hiện tại/)).toHaveValue(''))
    expect(screen.getByLabelText(/^Mật khẩu mới/)).toHaveValue('')
  })

  it('refuses a mismatch without asking the server', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.post('/v1/cms/auth/change-password', () => {
        calls += 1
        return HttpResponse.json({ changed: true }, { status: 201 })
      }),
    )
    renderWithProviders(<ChangePasswordScreen />)

    await screen.findByLabelText(/Mật khẩu hiện tại/)
    await fill(user, { confirm: 'something-else-entirely' })
    await submit(user)

    expect(await screen.findByText('Hai lần nhập không khớp.')).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  it('refuses a new password under the server floor, without asking', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordScreen />)

    await screen.findByLabelText(/Mật khẩu hiện tại/)
    await fill(user, { next: 'short', confirm: 'short' })
    await submit(user)

    // Asserted on the alert, not on the page: the same sentence is also the
    // field's hint, and matching either would not prove the refusal happened.
    expect(await screen.findByRole('alert')).toHaveTextContent(/cần tối thiểu 12 ký tự/)
  })

  it('says the current password is wrong when the server answers 401', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    server.use(
      http.post('/v1/cms/auth/change-password', () =>
        HttpResponse.json(
          {
            code: 'INVALID_CREDENTIALS',
            message: 'Current password is incorrect',
            request_id: 'test',
            retryable: false,
          },
          { status: 401 },
        ),
      ),
    )
    renderWithProviders(<ChangePasswordScreen />)

    await screen.findByLabelText(/Mật khẩu hiện tại/)
    await fill(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Email hoặc mật khẩu|không đúng/i)
  })

  it('distinguishes a rate limit from a wrong password — waiting fixes one', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    server.use(
      http.post('/v1/cms/auth/change-password', () =>
        HttpResponse.json(
          { code: 'RATE_LIMITED', message: 'slow down', request_id: 'test', retryable: true },
          { status: 429 },
        ),
      ),
    )
    renderWithProviders(<ChangePasswordScreen />)

    await screen.findByLabelText(/Mật khẩu hiện tại/)
    await fill(user)
    await submit(user)

    expect(await screen.findByText(/Chờ ít phút rồi thử lại/)).toBeInTheDocument()
  })

  it('reports the server rule when the new password matches the old', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    server.use(
      http.post('/v1/cms/auth/change-password', () =>
        HttpResponse.json(
          {
            code: 'PASSWORD_UNCHANGED',
            message: 'must differ',
            request_id: 'test',
            retryable: false,
          },
          { status: 400 },
        ),
      ),
    )
    renderWithProviders(<ChangePasswordScreen />)

    await screen.findByLabelText(/Mật khẩu hiện tại/)
    await fill(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/phải khác/)
  })
})
