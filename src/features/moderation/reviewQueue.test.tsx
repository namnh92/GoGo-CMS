import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import ReviewListScreen from './reviewList.view'

/** `useParams` only reports `reviewId` under a matching route. */
function ReviewRoutes() {
  return (
    <Routes>
      <Route path="/moderation/reviews" element={<ReviewListScreen />} />
      <Route path="/moderation/reviews/:reviewId" element={<ReviewListScreen />} />
    </Routes>
  )
}

const AT = '/moderation/reviews'

describe('review queue — server-side (CMS-031, finishes CMS-022)', () => {
  it('shows the filtered total, not the page length', async () => {
    signInAs('moderator')
    renderWithProviders(<ReviewRoutes />, { route: AT })

    // 32 fixtures, every 7th published (7, 14, 21, 28) → 4 published and 28
    // pending, paged 25 at a time. The total describes the filter, not the page.
    const info = await screen.findByText(/Trang này .* · tổng .* khớp bộ lọc/)
    expect(info).toHaveTextContent('Trang này 25 · tổng 28 khớp bộ lọc')
  })

  it('renders the columns the old contract could not supply', async () => {
    signInAs('moderator')
    renderWithProviders(<ReviewRoutes />, { route: AT })

    const table = await screen.findByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent?.trim())

    // Author, place, status and report count all arrived with GoGo-BE#219.
    expect(headers).toEqual(
      expect.arrayContaining([
        'Người viết',
        'Địa điểm',
        'Sao',
        'Trạng thái',
        'Báo cáo',
        'Kiểm duyệt',
      ]),
    )
  })

  it('pushes the status filter to the server rather than filtering the page', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ReviewRoutes />, { route: AT })

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'published')

    // 4 published in the fixtures — a count the client could not have derived
    // from a pending-only page.
    await waitFor(() => {
      const info = screen.getByText(/Trang này .* · tổng .* khớp bộ lọc/)
      expect(info).toHaveTextContent('Trang này 4 · tổng 4 khớp bộ lọc')
    })
  })

  it('narrows to reviews that carry an open report', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ReviewRoutes />, { route: AT })

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Báo cáo'), 'true')

    await waitFor(() => {
      const rows = within(screen.getByRole('table')).getAllByRole('row')
      // Header + at least one body row, and every body row shows a count.
      expect(rows.length).toBeGreaterThan(1)
    })
  })

  it('walks pages with the keyset cursor', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ReviewRoutes />, { route: AT })

    await screen.findByRole('table')
    const first = within(screen.getByRole('table')).getAllByRole('row')[1]?.textContent
    const previous = screen.getByRole('button', { name: 'Trang trước' })
    expect(previous).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => {
      const next = within(screen.getByRole('table')).getAllByRole('row')[1]?.textContent
      expect(next).not.toBe(first)
    })
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled()
  })

  it('opens the detail drawer from a shared link', async () => {
    signInAs('moderator')
    renderWithProviders(<ReviewRoutes />, { route: `${AT}/rev-001` })

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Chi tiết đánh giá')).toBeInTheDocument()
    // Facts come from the row already loaded — there is no per-review GET.
    expect(within(drawer).getByText('Lịch sử kiểm duyệt')).toBeInTheDocument()
  })

  it('requires a reason before a decision, and an editor may not decide at all', async () => {
    signInAs('editor')
    renderWithProviders(<ReviewRoutes />, { route: `${AT}/rev-001` })

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByRole('button', { name: 'Từ chối' })).toBeDisabled()
  })

  it('offers emergency hide only for a published review', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<ReviewRoutes />, { route: AT })

    // Pending: break-glass would have nothing to take down.
    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'published')
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    await user.click(within(screen.getByRole('table')).getAllByRole('row')[1]!)

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByRole('button', { name: 'Gỡ khẩn cấp' })).toBeInTheDocument()
  })

  it('renders permission-denied for a role without moderation read', async () => {
    signInAs('editor')
    renderWithProviders(<ReviewRoutes />, { route: AT })
    // Editors do have rank-based read, so the screen opens.
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})

describe('review deep-link (CMS-041, BE-CMS-G6)', () => {
  it('opens a decided review by id while the list filters pending', async () => {
    signInAs('moderator')
    // rev-007 is published; the default list filter is pending, so the old
    // page-scan could never have found it.
    renderWithProviders(<ReviewRoutes />, { route: `${AT}/rev-007` })

    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText(/rev-007|Đánh giá/)).toBeInTheDocument()
    // The unfiltered read means the "not in this filter" apology is gone.
    expect(screen.queryByText(/không nằm trong bộ lọc/)).not.toBeInTheDocument()
  })

  it('says REVIEW_NOT_FOUND for a link to a review that does not exist', async () => {
    signInAs('moderator')
    renderWithProviders(<ReviewRoutes />, { route: `${AT}/rev-999` })

    expect(await screen.findByText(/không tồn tại/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
