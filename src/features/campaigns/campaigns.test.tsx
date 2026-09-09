import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsCampaigns } from '@/shared/test/fixtures'
import CampaignListScreen from './campaignList.view'
import CampaignDetailScreen from './campaignDetail.view'

const draft = cmsCampaigns.find((campaign) => campaign.id === 'cp-cuoi-tuan')!
const scheduled = cmsCampaigns.find((campaign) => campaign.id === 'cp-le-2-9')!
const sending = cmsCampaigns.find((campaign) => campaign.id === 'cp-dang-gui')!
const sent = cmsCampaigns.find((campaign) => campaign.id === 'cp-da-gui')!
const failed = cmsCampaigns.find((campaign) => campaign.id === 'cp-loi')!
const reachedNobody = cmsCampaigns.find((campaign) => campaign.id === 'cp-khong-toi-ai')!
const drafts = cmsCampaigns.filter((campaign) => campaign.status === 'draft').length

function Routed() {
  return (
    <Routes>
      <Route path="/campaigns" element={<CampaignListScreen />} />
      <Route path="/campaigns/:id" element={<CampaignDetailScreen />} />
    </Routes>
  )
}

describe('campaign list (CMS-029)', () => {
  it('shows the filtered total, not the page length', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/campaigns' })

    await screen.findByRole('table')
    expect(
      screen.getByText(
        `Trang này ${cmsCampaigns.length} · tổng ${cmsCampaigns.length} khớp bộ lọc`,
      ),
    ).toBeInTheDocument()
  })

  it('pushes the status filter to the server', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/campaigns' })

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'draft')
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`tổng ${drafts} khớp bộ lọc`))).toBeInTheDocument(),
    )
  })

  it('says "not sent" rather than zero for a campaign that has not run', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/campaigns' })

    const table = await screen.findByRole('table')
    const row = within(table).getByText(draft.name).closest('tr')!
    // A zero here would read as "sent to nobody" rather than "not sent yet".
    expect(within(row).getByText('Chưa gửi')).toBeInTheDocument()
  })

  it('offers only the audiences the server can resolve', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/campaigns' })

    await user.click(await screen.findByRole('button', { name: 'Tạo chiến dịch' }))
    const drawer = await screen.findByRole('dialog')
    const audience = within(drawer).getByLabelText(/Đối tượng/) as HTMLSelectElement

    // city / app_version / custom_segment from the mockup are absent by design.
    expect(Array.from(audience.options).map((option) => option.value)).toEqual([
      'all',
      'couple',
      'group',
      'platform',
    ])
  })

  it('asks for a platform only when the audience is platform-scoped', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/campaigns' })

    await user.click(await screen.findByRole('button', { name: 'Tạo chiến dịch' }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).queryByLabelText('Nền tảng')).not.toBeInTheDocument()

    await user.selectOptions(within(drawer).getByLabelText(/Đối tượng/), 'platform')
    expect(within(drawer).getByLabelText('Nền tảng')).toBeInTheDocument()
  })

  it('hides campaigns from a role below ops_admin', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: '/campaigns' })

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })
})

describe('campaign delivery (CMS-029)', () => {
  it('never offers a cancel once the worker has started sending', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${sending.id}` })

    expect(await screen.findByText(/Worker đang gửi/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Huỷ lịch gửi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi ngay' })).not.toBeInTheDocument()
  })

  it('offers a cancel while the campaign is only scheduled', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${scheduled.id}` })

    expect(await screen.findByRole('button', { name: 'Huỷ lịch gửi' })).toBeInTheDocument()
  })

  it('locks editing for anything that has been sent', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${sent.id}` })

    expect(await screen.findByText(/chỉ sửa được khi ở trạng thái nháp/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tên chiến dịch/)).toBeDisabled()
  })

  it('shows the recorded provider error on a failed campaign', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${failed.id}` })

    expect(await screen.findByText(/OneSignal 401/)).toBeInTheDocument()
  })

  it('shows the delivery counts on a campaign that reached nobody', async () => {
    // #191 / GoGo-BE#516. These two numbers are the only thing explaining a
    // failed dispatch, and the console used to render them as "Chưa gửi"
    // because it gated on `status === 'sent' | 'sending'`.
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${reachedNobody.id}` })

    // Scoped to the delivery card, and read through each label: "Gửi lỗi" is
    // also the status badge's text, and a bare `3` matches half the page.
    // `Provider đã nhận` is unique on the page; its label sits in a pair div
    // inside the facts grid, so two hops up is the grid itself.
    const grid = (await screen.findByText('Provider đã nhận')).parentElement!.parentElement!
    const fact = (label: string) =>
      within(grid).getByText(label).parentElement?.textContent?.replace(label, '').trim()

    expect(fact('Số người nhận')).toBe('3')
    expect(fact('Provider đã nhận')).toBe('0')
    expect(fact('Gửi lỗi')).toBe('3')
    expect(within(grid).queryByText('Chưa gửi')).not.toBeInTheDocument()
  })

  it('explains a no-acceptance failure in words, not as an error code', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${reachedNobody.id}` })

    expect(await screen.findByText(/Không thiết bị nào nhận được/)).toBeInTheDocument()
    // The raw code belongs in a log, not in front of an operator.
    expect(screen.queryByText(/NO_SUBSCRIPTION_ACCEPTED/)).not.toBeInTheDocument()
  })

  it('says the recipient count is resolved at send time rather than showing zero', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    expect(await screen.findByText('Số người nhận')).toBeInTheDocument()
    expect(screen.getAllByText('Tính lại lúc gửi').length).toBeGreaterThan(0)
  })

  it('confirms a send by naming audience, destination and time', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await user.click(await screen.findByRole('button', { name: 'Gửi ngay' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/không thu hồi được/)).toBeInTheDocument()
    expect(within(dialog).getByText('Tất cả người dùng')).toBeInTheDocument()
    expect(within(dialog).getByText(/Gợi ý biên tập ·/)).toBeInTheDocument()
  })

  it('refuses a destination id that is not a UUID before sending it', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    const value = (await screen.findByLabelText('Điểm đến')) as HTMLInputElement
    await user.clear(value)
    await user.type(value, 'rec-cuoi-tuan')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Điểm đến phải là ID dạng UUID.')).toBeInTheDocument()
  })

  it('estimates the audience without sending anything', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    expect(await screen.findByText(/Ước tính .* người nhận/)).toBeInTheDocument()
    // The estimate is a read; the campaign is still a draft afterwards.
    expect(screen.getByText('Nháp')).toBeInTheDocument()
  })
})
