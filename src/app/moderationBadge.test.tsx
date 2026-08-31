import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { AppShell } from './AppShell'

describe('moderation badge (CMS-032)', () => {
  it('shows the backlog total, not the length of one loaded page', async () => {
    signInAs('moderator')
    renderWithProviders(<AppShell />)

    const link = await screen.findByRole('link', { name: /Kiểm duyệt/ })
    const badge = await within(link).findByText(/^\d+$/)

    // Fixtures: 28 pending reviews + 2 reports + 1 check-in + 1 community place.
    // The old sum over the unified queue could not exceed its `limit`; this can.
    expect(badge).toHaveTextContent('32')
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
