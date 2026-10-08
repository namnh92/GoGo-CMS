import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsAdmins } from '@/shared/test/fixtures'
import { AdminActionDialog } from './adminActions.view'
import AdminListScreen from './adminList.view'

describe('AdminListScreen (CMS-021)', () => {
  it('lists staff accounts with the filtered total', async () => {
    signInAs('super_admin', 'Minh Anh Ng.')
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('boss@gogo.vn')).toBeInTheDocument()
    // Six fixtures, one page: the total describes the filter, not the page.
    expect(screen.getByText(/Trang này 6 · tổng 6 khớp bộ lọc/)).toBeInTheDocument()
  })

  it('shows a never-signed-in account as a fact, not a blank cell', async () => {
    signInAs('super_admin')
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Chưa đăng nhập lần nào')).toBeInTheDocument()
  })

  it('pushes the role filter to the server', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Vai'), 'editor')

    // Two editors in the fixtures, one of them suspended.
    await waitFor(() =>
      expect(screen.getByText(/Trang này 2 · tổng 2 khớp bộ lọc/)).toBeInTheDocument(),
    )
    expect(screen.queryByText('boss@gogo.vn')).not.toBeInTheDocument()
  })

  it('narrows to suspended accounts, which the guard actually enforces', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'suspended')

    await waitFor(() =>
      expect(screen.getByText(/Trang này 1 · tổng 1 khớp bộ lọc/)).toBeInTheDocument(),
    )
    // Scoped to the table: the filter dropdown carries the same word.
    expect(within(screen.getByRole('table')).getByText('Đã khoá')).toBeInTheDocument()
  })

  it('searches on email and display name together', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    await screen.findByRole('table')
    await user.type(screen.getByLabelText('Tìm theo email hoặc tên'), 'lan')

    await waitFor(() =>
      expect(screen.getByText(/Trang này 1 · tổng 1 khớp bộ lọc/)).toBeInTheDocument(),
    )
    expect(screen.getByText('moderator@gogo.vn')).toBeInTheDocument()
  })

  it('marks which row is the signed-in account', async () => {
    signInAs('super_admin', 'Minh Anh Ng.')
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Bạn')).toBeInTheDocument()
  })

  it('offers lifecycle actions (#248) but never a delete — the contract has none', async () => {
    signInAs('super_admin')
    renderWithProviders(<AdminListScreen />)

    await screen.findByRole('table')
    expect(screen.getAllByRole('button', { name: 'Đổi vai' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Reset mật khẩu' }).length).toBeGreaterThan(0)
    // Deletion is still not in the contract, so no button pretends it is.
    expect(screen.queryByRole('button', { name: /Xoá/ })).not.toBeInTheDocument()
  })

  it('disables role change and suspend on your own row — the server refuses SELF_*', async () => {
    signInAs('super_admin', 'Minh Anh Ng.')
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    const selfRow = within(table).getByText('Bạn').closest('tr')!
    expect(within(selfRow).getByRole('button', { name: 'Đổi vai' })).toBeDisabled()
    expect(within(selfRow).getByRole('button', { name: 'Đình chỉ' })).toBeDisabled()
  })

  it('demands a reason before any mutation is sent', async () => {
    signInAs('super_admin', 'Minh Anh Ng.')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    const otherRow = within(table).getByText('ops@gogo.vn').closest('tr')!
    await user.click(within(otherRow).getByRole('button', { name: 'Đổi vai' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('button', { name: 'Đổi vai' }).at(-1)!)

    expect(await within(dialog).findByText('Lý do cần tối thiểu 3 ký tự.')).toBeInTheDocument()
  })

  it('shows the temporary password exactly once, with the one-time warning', async () => {
    signInAs('super_admin', 'Minh Anh Ng.')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    const otherRow = within(table).getByText('ops@gogo.vn').closest('tr')!
    await user.click(within(otherRow).getByRole('button', { name: 'Reset mật khẩu' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Lý do/), 'nghi ngờ lộ mật khẩu')
    await user.click(within(dialog).getAllByRole('button', { name: 'Reset mật khẩu' }).at(-1)!)

    // The form is replaced wholesale by the one-time showing.
    expect(await screen.findByText(/hiện đúng một lần/)).toBeInTheDocument()
    expect(screen.getByText(/^tmp-/)).toBeInTheDocument()
    expect(screen.getByText(/không xem lại được/)).toBeInTheDocument()
  })

  /*
   * CMS-031 (#142) — an environment has exactly one super admin, bootstrapped
   * rather than created (GoGo-BE ADR-0018). The console stops offering what the
   * API refuses, without hiding the account itself.
   */
  it('still shows the super admin — the list must not lie about who holds the role', async () => {
    signInAs('super_admin', 'Someone Else')
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    const row = within(table).getByText('boss@gogo.vn').closest('tr')!
    expect(within(row).getByText('Quản trị tối cao')).toBeInTheDocument()
  })

  it('keeps super_admin in the role filter — reading is not writing', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    await screen.findByRole('table')
    const filter = screen.getByLabelText('Vai')
    expect(
      Array.from(filter.querySelectorAll('option')).map((o) => o.getAttribute('value')),
    ).toContain('super_admin')

    await user.selectOptions(filter, 'super_admin')
    await waitFor(() =>
      expect(screen.getByText(/Trang này 1 · tổng 1 khớp bộ lọc/)).toBeInTheDocument(),
    )
  })

  it('locks role change and suspend on the super admin row, whoever is signed in', async () => {
    // Signed in as a *different* name, so this is the role check and not the
    // SELF_* check that happens to cover the same row for its holder.
    signInAs('super_admin', 'Someone Else')
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    const row = within(table).getByText('boss@gogo.vn').closest('tr')!
    const edit = within(row).getByRole('button', { name: 'Đổi vai' })
    const suspend = within(row).getByRole('button', { name: 'Đình chỉ' })
    expect(edit).toBeDisabled()
    expect(suspend).toBeDisabled()
    expect(edit).toHaveAttribute('title', expect.stringContaining('vai cố định'))
    // Credentials are not frozen: rotating this account's password is supported
    // — once `methods` has said the switch is off (GoGo-BE#687).
    await waitFor(() =>
      expect(within(row).getByRole('button', { name: 'Reset mật khẩu' })).toBeEnabled(),
    )
  })

  it("offers only assignable roles when changing someone else's role", async () => {
    signInAs('super_admin', 'Minh Anh Ng.')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    const row = within(table).getByText('ops@gogo.vn').closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Đổi vai' }))

    const dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByLabelText('Vai')
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.getAttribute('value')),
    ).toEqual(['editor', 'moderator', 'ops_admin'])
  })

  it('the reset dialog on the super admin is unavailable while methods is pending (PR #235 r3 F-01)', async () => {
    server.use(http.get('/v1/cms/auth/methods', () => new Promise<Response>(() => {})))
    signInAs('super_admin', 'Someone Else')
    const boss = { ...cmsAdmins.find((a) => a.role === 'super_admin')!, lastLoginAt: undefined }
    renderWithProviders(<AdminActionDialog action="reset" admin={boss} onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent(/Đang kiểm tra/)
    expect(within(dialog).getAllByRole('button', { name: 'Reset mật khẩu' }).at(-1)!).toBeDisabled()
  })

  it('the reset dialog on the super admin is unavailable when methods fails, with a retry (PR #235 r3 F-01)', async () => {
    let calls = 0
    server.use(
      http.get('/v1/cms/auth/methods', () => {
        calls += 1
        return HttpResponse.json(
          { code: 'INTERNAL', message: 'x', field_errors: [], request_id: 'r', retryable: true },
          { status: 500 },
        )
      }),
    )
    signInAs('super_admin', 'Someone Else')
    const user = userEvent.setup()
    const boss = { ...cmsAdmins.find((a) => a.role === 'super_admin')!, lastLoginAt: undefined }
    renderWithProviders(<AdminActionDialog action="reset" admin={boss} onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent(/Không đọc được/)
    expect(within(dialog).getAllByRole('button', { name: 'Reset mật khẩu' }).at(-1)!).toBeDisabled()
    const before = calls
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(calls).toBeGreaterThan(before))
  })

  it('the edit dialog on the super admin explains itself and cannot be submitted', async () => {
    // Rendered directly: the list already refuses to open this, and the dialog
    // must refuse it too — a submit whose only outcome is a 409 is a dead
    // control wherever it is reached from.
    signInAs('super_admin', 'Someone Else')
    const boss = { ...cmsAdmins.find((a) => a.role === 'super_admin')!, lastLoginAt: undefined }
    renderWithProviders(<AdminActionDialog action="edit" admin={boss} onClose={() => {}} />)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/vai cố định/)).toBeInTheDocument()
    // No picker: there is no value it could hold.
    expect(within(dialog).queryByLabelText('Vai')).not.toBeInTheDocument()
    expect(within(dialog).getAllByRole('button', { name: 'Đổi vai' }).at(-1)!).toBeDisabled()
  })

  it('renders SUPER_ADMIN_SINGLETON as the rule it is, not a raw server message', async () => {
    // The console no longer sends the role, so this refusal should be
    // unreachable from here. It is mapped anyway: the API is the control, and a
    // refusal a user can meet must read as a sentence rather than a code.
    server.use(
      http.patch('/v1/cms/auth/admins/:id', () =>
        HttpResponse.json(
          {
            code: 'SUPER_ADMIN_SINGLETON',
            message: 'a second super_admin cannot be created',
            request_id: 'test',
            retryable: false,
          },
          { status: 409 },
        ),
      ),
    )
    signInAs('super_admin', 'Minh Anh Ng.')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    const row = within(table).getByText('ops@gogo.vn').closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Đổi vai' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Lý do/), 'thử đổi vai')
    await user.click(within(dialog).getAllByRole('button', { name: 'Đổi vai' }).at(-1)!)

    expect(await within(dialog).findByText(/chỉ có đúng một super admin/i)).toBeInTheDocument()
  })

  it('refuses every role below super admin, and says why', async () => {
    // Reads are hierarchical elsewhere; not here — who holds which role is the
    // authorization model itself.
    signInAs('ops_admin')
    renderWithProviders(<AdminListScreen />)

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

/*
 * GoGo-BE#687, review F-01 round 2. With the switch on the API refuses a reset
 * of the super admin's password (SUPER_ADMIN_SSO_ONLY). The first fix disabled
 * the row's reset only on `superAdminSsoOnly === true`, so while `methods` was
 * pending or failed — and after the server had already refused — the button
 * stayed operable. Unknown now reads as unavailable for that one row; every
 * other row keeps its reset.
 */
describe('super admin reset gate (GoGo-BE#687, review F-01 round 2)', () => {
  const methodsFailure = () =>
    HttpResponse.json(
      { code: 'INTERNAL', message: 'x', request_id: 'r', retryable: true },
      { status: 500 },
    )
  const ssoOnlyRefusal = () =>
    HttpResponse.json(
      {
        code: 'SUPER_ADMIN_SSO_ONLY',
        message: 'x',
        field_errors: [],
        request_id: 'r',
        retryable: false,
      },
      { status: 403 },
    )

  it('does not offer the super admin reset while methods is pending; other rows keep theirs', async () => {
    server.use(http.get('/v1/cms/auth/methods', async () => await delay('infinite')))
    signInAs('super_admin', 'Someone Else')
    renderWithProviders(<AdminListScreen />)

    const table = await screen.findByRole('table')
    const boss = within(table).getByText('boss@gogo.vn').closest('tr')!
    const reset = within(boss).getByRole('button', { name: 'Reset mật khẩu' })
    expect(reset).toBeDisabled()
    expect(reset).toHaveAttribute('title', expect.stringContaining('Đang kiểm tra'))

    const ops = within(table).getByText('ops@gogo.vn').closest('tr')!
    expect(within(ops).getByRole('button', { name: 'Reset mật khẩu' })).toBeEnabled()
  })

  it('does not offer the super admin reset when methods failed, says why, and can retry', async () => {
    let answer: 'fail' | 'off' = 'fail'
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        answer === 'fail'
          ? methodsFailure()
          : HttpResponse.json({ password: true, accessSso: true, superAdminSsoOnly: false }),
      ),
    )
    signInAs('super_admin', 'Someone Else')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    // Re-queried each time: the row re-renders when the gate changes.
    const bossReset = () =>
      within(within(screen.getByRole('table')).getByText('boss@gogo.vn').closest('tr')!).getByRole(
        'button',
        { name: 'Reset mật khẩu' },
      )
    await screen.findByRole('table')
    await waitFor(() =>
      expect(bossReset()).toHaveAttribute('title', expect.stringContaining('Không đọc được')),
    )
    expect(bossReset()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/Không đọc được cách đăng nhập/)

    answer = 'off'
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(bossReset()).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes the reset at once on a SUPER_ADMIN_SSO_ONLY refusal and re-reads methods', async () => {
    // The race: `methods` said "off" when the list opened; the switch flips
    // before the reset is sent, which the server refuses.
    let switchOn = false
    let methodsReads = 0
    server.use(
      http.get('/v1/cms/auth/methods', () => {
        methodsReads += 1
        return HttpResponse.json({ password: true, accessSso: true, superAdminSsoOnly: switchOn })
      }),
      http.post('/v1/cms/auth/admins/:id/reset-password', () => {
        switchOn = true
        return ssoOnlyRefusal()
      }),
    )
    signInAs('super_admin', 'Someone Else')
    const user = userEvent.setup()
    renderWithProviders(<AdminListScreen />)

    const bossReset = () =>
      within(within(screen.getByRole('table')).getByText('boss@gogo.vn').closest('tr')!).getByRole(
        'button',
        { name: 'Reset mật khẩu' },
      )
    await screen.findByRole('table')
    await waitFor(() => expect(bossReset()).toBeEnabled())
    await waitFor(() => expect(methodsReads).toBe(1))

    await user.click(bossReset())
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Lý do/), 'nghi ngờ lộ mật khẩu')
    const submit = within(dialog).getAllByRole('button', { name: 'Reset mật khẩu' }).at(-1)!
    await user.click(submit)

    // The dialog says why and its submit cannot be sent again.
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/không có mật khẩu/)
    expect(submit).toBeDisabled()
    // The row's button followed from the shared answer, before the re-read.
    await waitFor(() => expect(bossReset()).toBeDisabled())
    expect(bossReset()).toHaveAttribute('title', expect.stringContaining('không có mật khẩu'))
    // And the fact was re-read from the server rather than assumed for good.
    await waitFor(() => expect(methodsReads).toBeGreaterThanOrEqual(2))
  })
})
