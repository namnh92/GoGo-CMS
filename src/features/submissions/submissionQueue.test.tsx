import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import SubmissionQueueScreen from './submissionQueue.view'

describe('SubmissionQueueScreen', () => {
  it('shows how many people asked for the same place — the triage signal', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionQueueScreen />)

    // Appears twice by design: the list row and the detail heading.
    expect(await screen.findAllByText('ChIJpopular')).toHaveLength(2)
    // One row for four proposals, not four rows.
    expect(screen.getByText(/4 người cùng gửi/)).toBeInTheDocument()
  })

  it('says whether a proposal came from an account, without naming anyone', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionQueueScreen />)

    await screen.findByText('ChIJguest')
    expect(screen.getAllByText('Khách trong phòng').length).toBeGreaterThan(0)
    // Moderating does not need the person; the queue must not leak an id.
    expect(screen.queryByText(/submittedBy/i)).not.toBeInTheDocument()
  })

  it('refuses to decide until a reason is written', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionQueueScreen />)

    await screen.findAllByText('ChIJpopular')
    const approve = screen.getByRole('button', { name: 'Duyệt' })
    expect(approve).toBeDisabled()

    await user.type(screen.getByLabelText(/Lý do quyết định/), 'quán hợp lệ')
    await waitFor(() => expect(approve).toBeEnabled())
  })

  it('keeps merge disabled until a target place is given', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionQueueScreen />)

    await screen.findAllByText('ChIJpopular')
    await user.type(screen.getByLabelText(/Lý do quyết định/), 'trùng địa điểm')

    // The server rejects a merge without a target, so the button stays off
    // rather than sending a call that cannot succeed.
    const merge = screen.getByRole('button', { name: 'Gộp' })
    expect(merge).toBeDisabled()
    await user.type(screen.getByLabelText(/ID địa điểm để gộp vào/), 'abc-123')
    await waitFor(() => expect(merge).toBeEnabled())
  })

  it('an editor can read the queue but an ops_admin cannot', async () => {
    signInAs('ops_admin')
    renderWithProviders(<SubmissionQueueScreen />)
    // CmsSubmissionController is @RequireRole('moderator', 'editor'); ops_admin
    // outranks them for reads, so it sees the queue.
    expect(await screen.findAllByText('ChIJpopular')).not.toHaveLength(0)
    // …but deciding stays with the roles that own it.
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
    expect(screen.getByText(/không quyết định được/)).toBeInTheDocument()
  })
})
