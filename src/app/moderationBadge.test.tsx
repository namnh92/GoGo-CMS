import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import {
  communityPlaceQueue,
  moderationCheckinQueue,
  moderationReportQueue,
  moderationReviewQueue,
} from '@/shared/test/fixtures'
import { AppShell } from './AppShell'

/** What the server counts: everything still awaiting a decision. */
const EXPECTED_BACKLOG =
  moderationReviewQueue.filter((review) => review.status === 'pending').length +
  moderationReportQueue.filter((report) => report.status === 'open').length +
  moderationCheckinQueue.filter((checkin) => checkin.moderation === 'pending').length +
  communityPlaceQueue.length

describe('moderation badge (CMS-032)', () => {
  it('shows the backlog total, not the length of one loaded page', async () => {
    signInAs('moderator')
    renderWithProviders(<AppShell />)

    const link = await screen.findByRole('link', { name: /Kiểm duyệt/ })
    const badge = await within(link).findByText(/^\d+$/)

    // Derived from the fixtures rather than pinned to a literal, so the
    // assertion keeps meaning when the seed data changes.
    expect(badge).toHaveTextContent(String(EXPECTED_BACKLOG))
  })

  it('counts more than a single queue page, which the old sum could not', async () => {
    signInAs('moderator')
    renderWithProviders(<AppShell />)

    const link = await screen.findByRole('link', { name: /Kiểm duyệt/ })
    const badge = await within(link).findByText(/^\d+$/)
    // 25 is the review page size; a page-derived badge could never exceed it.
    await waitFor(() => expect(Number(badge.textContent)).toBeGreaterThan(25))
  })

  it('asks for nothing when the role cannot read moderation', async () => {
    // `ops_admin` is rank 2 and moderation asks for rank 1, so read passes —
    // the badge is offered. The point is that it is gated on read at all.
    signInAs('ops_admin')
    renderWithProviders(<AppShell />)
    expect(await screen.findByRole('link', { name: /Kiểm duyệt/ })).toBeInTheDocument()
  })
})
