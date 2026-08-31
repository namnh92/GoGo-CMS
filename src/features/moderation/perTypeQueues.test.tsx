import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import {
  communityPlaceQueue,
  moderationCheckinQueue,
  moderationReportQueue,
} from '@/shared/test/fixtures'
import ModerationQueueScreen from './moderationQueue.view'

const openReports = moderationReportQueue.filter((r) => r.status === 'open').length
const pendingCheckins = moderationCheckinQueue.filter((c) => c.moderation === 'pending').length

async function goToTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('tab', { name }))
}

describe('per-type moderation queues (CMS-033)', () => {
  it('reports open with the server total, not a page length', async () => {
    signInAs('moderator')
    renderWithProviders(<ModerationQueueScreen />)

    await waitFor(() =>
      expect(screen.getByText(`Tổng ${openReports} khớp bộ lọc`)).toBeInTheDocument(),
    )
    // 31 reports, page size 25 — a page-derived total could never say 28.
    expect(openReports).toBeGreaterThan(25)
    expect(screen.getByText('Trang này 25 mục')).toBeInTheDocument()
  })

  it('pushes the report status filter to the server', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)

    await screen.findByText(`Tổng ${openReports} khớp bộ lọc`)
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'actioned')

    const actioned = moderationReportQueue.filter((r) => r.status === 'actioned').length
    await waitFor(() =>
      expect(screen.getByText(`Tổng ${actioned} khớp bộ lọc`)).toBeInTheDocument(),
    )
  })

  it('walks report pages with the keyset cursor', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)

    await screen.findByText('Trang này 25 mục')
    const previous = screen.getByRole('button', { name: 'Trang trước' })
    expect(previous).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() =>
      expect(screen.getByText(`Trang này ${openReports - 25} mục`)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled()
  })

  it('filters check-ins by bill on the server', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)

    await goToTab(user, /Check-in/)
    await waitFor(() =>
      expect(screen.getByText(`Tổng ${pendingCheckins} khớp bộ lọc`)).toBeInTheDocument(),
    )

    await user.selectOptions(screen.getByLabelText('Hoá đơn'), 'true')
    const withBill = moderationCheckinQueue.filter(
      (c) => c.moderation === 'pending' && c.hasBill,
    ).length
    await waitFor(() =>
      expect(screen.getByText(`Tổng ${withBill} khớp bộ lọc`)).toBeInTheDocument(),
    )
  })

  it('searches community places on the server', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)

    await goToTab(user, /Địa điểm người dùng gửi/)
    await waitFor(() =>
      expect(
        screen.getByText(`Tổng ${communityPlaceQueue.length} khớp bộ lọc`),
      ).toBeInTheDocument(),
    )

    await user.type(screen.getByLabelText('Tìm theo tên địa điểm'), 'Tiệm Bánh')
    const matching = communityPlaceQueue.filter((p) => p.name.includes('Tiệm Bánh')).length
    await waitFor(() =>
      expect(screen.getByText(`Tổng ${matching} khớp bộ lọc`)).toBeInTheDocument(),
    )
  })

  it('keeps the decision path: a reason is required, and an editor cannot decide', async () => {
    signInAs('editor')
    renderWithProviders(<ModerationQueueScreen />)

    await screen.findByLabelText(/Lý do quyết định/)
    expect(screen.getByRole('button', { name: 'Đã xử lý' })).toBeDisabled()
  })

  it('keeps break-glass reachable from a report that names a resource', async () => {
    signInAs('moderator')
    renderWithProviders(<ModerationQueueScreen />)

    // The first open report targets a place, review or member; each maps onto a
    // break-glass route, so the button stays offered.
    expect(await screen.findByRole('button', { name: 'Gỡ khẩn cấp' })).toBeInTheDocument()
  })

  it('resets paging when the tab changes', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)

    await screen.findByText('Trang này 25 mục')
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled())

    await goToTab(user, /Check-in/)
    // A cursor from the reports queue means nothing to the check-in queue.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled())
  })
})
