import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { privacyRequests } from '@/shared/test/fixtures'
import PrivacyListScreen from './privacyList.view'

const overdue = privacyRequests.find((r) => r.sla === 'OVERDUE')!
// The open one: 'worked by hand' only matters while the request is still open.
const correction = privacyRequests.find((r) => r.type === 'correction' && r.status !== 'closed')!
const held = privacyRequests.find((r) => r.retentionHold?.reviewOverdue)!

describe('privacy ledger (CMS-043)', () => {
  it('renders the SLA state the server computed, and filters on the same value', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Quá hạn')).toBeInTheDocument()
    expect(within(table).getByText('Sắp đến hạn')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('SLA'), 'overdue')
    const count = privacyRequests.filter((r) => r.sla === 'OVERDUE').length
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`tổng ${count} khớp bộ lọc`))).toBeInTheDocument(),
    )
  })

  it('offers no execute on a correction — the contract refuses it', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(correction.subject.externalReference!))
    const drawer = await screen.findByRole('dialog')

    expect(await within(drawer).findByText(/xử lý thủ công/)).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: /Chạy/ })).not.toBeInTheDocument()
  })

  it('surfaces an overdue legal hold as needing a person, not an auto-release', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(held.subject.externalReference!))
    const drawer = await screen.findByRole('dialog')

    expect(await within(drawer).findByText(/HOLD_REVIEW_OVERDUE/)).toBeInTheDocument()
    // The label and the value share one text node, so match on the container.
    expect(drawer.textContent).toContain(held.retentionHold!.legalBasis)
    // Held rows offer release, never a second hold.
    expect(within(drawer).getByRole('button', { name: 'Gỡ legal hold' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Đặt legal hold' })).not.toBeInTheDocument()
  })

  it('refuses a delete execute for ops_admin with the role explanation', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(overdue.subject.userId!))
    const drawer = await screen.findByRole('dialog')
    await user.click(await within(drawer).findByRole('button', { name: /Chạy xoá dữ liệu/ }))

    expect(await within(drawer).findByText(/quyền quản trị tối cao/)).toBeInTheDocument()
  })

  it('hides the hold controls from ops_admin — a hold is a legal instrument', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(held.subject.externalReference!))
    const drawer = await screen.findByRole('dialog')

    await within(drawer).findByText(/HOLD_REVIEW_OVERDUE/)
    expect(within(drawer).queryByRole('button', { name: /legal hold/ })).not.toBeInTheDocument()
  })

  it('shows the note guidance wherever an operator note can be typed', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    await user.click(await screen.findByRole('button', { name: 'Ghi nhận yêu cầu' }))
    const drawer = await screen.findByRole('dialog')
    expect(
      within(drawer).getByText(/Không nhập dữ liệu cá nhân, nội dung trao đổi/),
    ).toBeInTheDocument()
    // Structured subject, never a single free-text field.
    expect(within(drawer).getByLabelText('Đối tượng')).toBeInTheDocument()
  })
})
