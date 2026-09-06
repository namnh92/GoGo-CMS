import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
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
    // Credentials are not frozen: rotating this account's password is supported.
    expect(within(row).getByRole('button', { name: 'Reset mật khẩu' })).toBeEnabled()
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
