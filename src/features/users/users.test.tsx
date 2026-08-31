import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsAppUsers, cmsRooms } from '@/shared/test/fixtures'
import UserListScreen from './userList.view'
import RoomListScreen from './roomList.view'

const deleted = cmsAppUsers.find((user) => user.status === 'deleted')!
const suspended = cmsAppUsers.find((user) => user.status === 'suspended')!

describe('app users (CMS-040)', () => {
  it('shows the filtered total and every status distinctly', async () => {
    signInAs('ops_admin')
    renderWithProviders(<UserListScreen />)

    await screen.findByRole('table')
    expect(
      screen.getByText(`Trang này ${cmsAppUsers.length} · tổng ${cmsAppUsers.length} khớp bộ lọc`),
    ).toBeInTheDocument()
    // Suspended and banned never merge into one badge. ("Đình chỉ" also
    // appears in the status filter options, so scope to badge rows.)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Đình chỉ')).toBeInTheDocument()
    expect(within(table).getByText('Cấm vĩnh viễn')).toBeInTheDocument()
  })

  it('says a deleted account freed its address, in words — not an em-dash', async () => {
    signInAs('ops_admin')
    renderWithProviders(<UserListScreen />)

    const table = await screen.findByRole('table')
    const row = within(table).getByText(deleted.displayName).closest('tr')!
    expect(within(row).getByText(/địa chỉ email đã được giải phóng/)).toBeInTheDocument()
  })

  it('denies everything below ops_admin — reads do not climb here', async () => {
    signInAs('editor')
    renderWithProviders(<UserListScreen />)

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the audit-sourced status reason in the detail drawer', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<UserListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(suspended.displayName))
    const drawer = await screen.findByRole('dialog')

    expect(await within(drawer).findByText(new RegExp(suspended.statusReason!))).toBeInTheDocument()
    // Ban and suspend are offered as different verbs with different meanings.
    expect(
      within(drawer).queryByRole('button', { name: /Đình chỉ \(chờ quay lại\)/ }),
    ).not.toBeInTheDocument() // already suspended
    expect(within(drawer).getByRole('button', { name: 'Gỡ đình chỉ / cấm' })).toBeInTheDocument()
  })

  it('marks deleted as terminal: no status action is offered at all', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<UserListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(deleted.displayName))
    const drawer = await screen.findByRole('dialog')

    expect(await within(drawer).findByText(/trạng thái cuối/)).toBeInTheDocument()
    expect(
      within(drawer).queryByRole('button', { name: /Đình chỉ|Cấm|Gỡ|Xoá|Xuất/ }),
    ).not.toBeInTheDocument()
  })

  it('demands a reason before a ban is sent', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<UserListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText('Nguyễn Lan Anh'))
    const drawer = await screen.findByRole('dialog')
    await user.click(
      await within(drawer).findByRole('button', { name: 'Cấm (không chờ quay lại)' }),
    )

    const dialogs = await screen.findAllByRole('dialog')
    const modal = dialogs[dialogs.length - 1]!
    await user.click(
      within(modal).getAllByRole('button', { name: 'Cấm (không chờ quay lại)' }).at(-1)!,
    )
    expect(await within(modal).findByText('Lý do cần tối thiểu 3 ký tự.')).toBeInTheDocument()
  })

  it('hides the delete action from ops_admin — erasure is super_admin only', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<UserListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText('Nguyễn Lan Anh'))
    const drawer = await screen.findByRole('dialog')

    await within(drawer).findByRole('button', { name: 'Xuất dữ liệu (GDPR)' })
    expect(within(drawer).queryByRole('button', { name: /Xoá tài khoản/ })).not.toBeInTheDocument()
  })
})

describe('rooms read-only (CMS-040)', () => {
  it('lists rooms without ever rendering an invite code', async () => {
    signInAs('ops_admin')
    renderWithProviders(<RoomListScreen />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Cuối tuần Q1')).toBeInTheDocument()
    // The fixture has no code field, and the screen must not invent one.
    expect(screen.queryByText(/GOGO-\d{4}/)).not.toBeInTheDocument()
    // The host renders as an id, not a name.
    expect(within(table).getAllByText(cmsRooms[0]!.hostUserId).length).toBeGreaterThan(0)
  })

  it('pushes the status filter to the server', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<RoomListScreen />)

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'planning')
    const planning = cmsRooms.filter((room) => room.status === 'planning').length
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`tổng ${planning} khớp bộ lọc`))).toBeInTheDocument(),
    )
  })
})
