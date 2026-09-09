import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { screen } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { mockDb } from '@/shared/test/handlers'
import SubmissionQueueScreen from './submissionQueue.view'

function SubmissionRoutes() {
  return (
    <Routes>
      <Route path="/submissions" element={<SubmissionQueueScreen />} />
      <Route path="/submissions/:submissionId" element={<SubmissionQueueScreen />} />
    </Routes>
  )
}

const AT = '/submissions'

describe('SubmissionQueueScreen', () => {
  it('shows how many people asked for the same place — the triage signal', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: AT })

    expect(await screen.findByText('ChIJpopular')).toBeInTheDocument()
    // One row for four proposals, not four rows.
    expect(screen.getByText(/4 người cùng gửi/)).toBeInTheDocument()
  })

  it('says a fresh proposal has no name rather than titling it with a Place ID', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: AT })

    await screen.findByText('ChIJpopular')
    // GoGo-BE#528 — Google's name is not stored, and the queue must not spend a
    // Details call per row to fill a column. The honest answer is on screen.
    expect(screen.getByText('Chưa có tên')).toBeInTheDocument()
    expect(screen.getByText(/GoGo không lưu tên Google/)).toBeInTheDocument()
  })

  it('uses a name GoGo does hold, and says where it came from', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: AT })

    expect(await screen.findByText('Cà phê Ngọc Hà')).toBeInTheDocument()
    expect(screen.getByText('Tên do kiểm duyệt viên đặt')).toBeInTheDocument()
    expect(screen.getByText('Đã bổ sung')).toBeInTheDocument()
  })

  it('says whether a proposal came from an account, without naming anyone', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: AT })

    await screen.findByText('ChIJguest')
    expect(screen.getAllByText('Khách trong phòng').length).toBeGreaterThan(0)
    // Moderating does not need the person; the queue must not leak an id.
    expect(screen.queryByText(/submittedBy/i)).not.toBeInTheDocument()
  })

  it('costs no provider request to list', async () => {
    signInAs('moderator')
    mockDb.providerPreviewCalls = 0
    renderWithProviders(<SubmissionRoutes />, { route: AT })

    await screen.findByText('ChIJpopular')
    expect(mockDb.providerPreviewCalls).toBe(0)
  })

  it('opens the review drawer on the row, on its own URL', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: AT })

    await user.click(await screen.findByText('ChIJpopular'))

    // The drawer is where a decision is made; the queue only points at it.
    expect(await screen.findByRole('dialog', { name: /Kiểm duyệt đề xuất/ })).toBeInTheDocument()
  })

  it('an editor can read the queue but an ops_admin cannot decide', async () => {
    signInAs('ops_admin')
    renderWithProviders(<SubmissionRoutes />, {
      route: '/submissions/9a1d0c00-0000-4000-8000-000000000001',
    })

    // CmsSubmissionController is @RequireRole('moderator', 'editor'); ops_admin
    // outranks them for reads, so it sees the queue and the review drawer…
    expect((await screen.findAllByText('ChIJpopular')).length).toBeGreaterThan(0)
    // …but deciding stays with the roles that own it.
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
    expect(await screen.findByText(/không quyết định được/)).toBeInTheDocument()
  })
})
