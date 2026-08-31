import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
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

  it('refuses every role below super admin, and says why', async () => {
    // Reads are hierarchical elsewhere; not here — who holds which role is the
    // authorization model itself.
    signInAs('ops_admin')
    renderWithProviders(<AdminListScreen />)

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
