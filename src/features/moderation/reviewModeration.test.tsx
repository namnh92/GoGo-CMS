import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import ModerationQueueScreen from './moderationQueue.view'

/** `useParams` only reports a value under a matching route, so mount both. */
function ModerationRoutes() {
  return (
    <Routes>
      <Route path="/moderation" element={<ModerationQueueScreen />} />
      <Route path="/moderation/reviews/:reviewId" element={<ModerationQueueScreen />} />
    </Routes>
  )
}

/** The reviews tab is where CMS-022 lives; every test starts there. */
async function openReviews(user: ReturnType<typeof userEvent.setup>) {
  const tab = await screen.findByRole('tab', { name: /Đánh giá/ })
  await user.click(tab)
  return tab
}

describe('review moderation (CMS-022)', () => {
  it('opens straight onto the review named in the URL', async () => {
    signInAs('moderator')
    renderWithProviders(<ModerationRoutes />, { route: '/moderation/reviews/mr-2' })

    // The tab follows the link, so a pasted URL lands on the right item.
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Đánh giá/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    const selected = await screen.findByRole('button', { pressed: true })
    expect(selected).toBeInTheDocument()
  })

  it('narrows the loaded page by rating and says so honestly', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)
    await openReviews(user)

    const count = await screen.findByText(/Hiện \d+\/\d+ mục đã tải/)
    // The label counts what was loaded, never a server total the queue endpoint
    // does not send (GoGo-BE#219).
    expect(count).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Số sao'), '5')
    await waitFor(() => expect(screen.getByText(/Hiện \d+\/\d+ mục đã tải/)).toBeInTheDocument())
  })

  it('tells an empty queue apart from a filter that matched nothing', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)
    await openReviews(user)

    await screen.findByText(/Hiện \d+\/\d+ mục đã tải/)
    await user.type(screen.getByLabelText('Tìm trong nội dung đánh giá'), 'zzzqqq-no-match')

    expect(await screen.findByText('Không mục nào khớp bộ lọc')).toBeInTheDocument()
    expect(screen.queryByText('Hàng chờ trống')).not.toBeInTheDocument()
  })

  it('shows the moderation history for the selected review', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)
    await openReviews(user)

    expect(await screen.findByText('Lịch sử kiểm duyệt')).toBeInTheDocument()
    // Nothing decided yet, and it says that rather than rendering a blank box.
    expect(await screen.findByText(/Chưa có quyết định nào được ghi/)).toBeInTheDocument()
  })

  it('takes a decided review out of the pending queue', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)
    await openReviews(user)

    const before = (await screen.findByText(/Hiện \d+\/(\d+) mục đã tải/)).textContent ?? ''
    await user.type(
      screen.getByLabelText(/Lý do quyết định/),
      'Nội dung vi phạm quy tắc cộng đồng.',
    )
    await user.click(screen.getByRole('button', { name: 'Từ chối' }))

    // The queue lists pending items only, so a decided review leaves it. The
    // audit entry the decision wrote lives on in the log, not in this list.
    await waitFor(() =>
      expect(screen.getByText(/Hiện \d+\/\d+ mục đã tải/).textContent).not.toBe(before),
    )
  })

  it('lets an editor read the queue without offering a decision', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)
    await openReviews(user)

    await screen.findByText('Lịch sử kiểm duyệt')
    const reject = screen.getByRole('button', { name: 'Từ chối' })
    expect(reject).toBeDisabled()
  })

  it('keeps the filter bar off every tab that has no rating to filter', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ModerationQueueScreen />)
    await openReviews(user)
    expect(screen.getByLabelText('Số sao')).toBeInTheDocument()

    await user.click(within(screen.getByRole('tablist')).getByRole('tab', { name: /Báo cáo/ }))
    await waitFor(() => expect(screen.queryByLabelText('Số sao')).not.toBeInTheDocument())
  })
})
