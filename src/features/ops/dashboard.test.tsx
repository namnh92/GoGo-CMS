import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import {
  moderationReportQueue,
  moderationCheckinQueue,
  communityPlaceQueue,
  moderationReviewQueue,
} from '@/shared/test/fixtures'
import DashboardScreen from './dashboard.view'

function Routed() {
  return (
    <Routes>
      <Route path="/" element={<DashboardScreen />} />
    </Routes>
  )
}

describe('dashboard (CMS-035)', () => {
  it('shows the four real moderation queues with database-backed counts', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    // The KPI card carries the same words, so scope by the section heading.
    const heading = await screen.findByRole('heading', { name: 'Hàng chờ kiểm duyệt' })
    const card = heading.closest('section') ?? heading.parentElement!.parentElement!
    // Each count derives from the fixtures exactly the way the mock counts
    // them (pending/open only), so a fixture change cannot pin a stale literal.
    const expected: Array<[string, number]> = [
      ['Đánh giá chờ duyệt', moderationReviewQueue.filter((r) => r.status === 'pending').length],
      ['Báo cáo chờ xử lý', moderationReportQueue.filter((r) => r.status === 'open').length],
      [
        'Check-in chờ duyệt',
        moderationCheckinQueue.filter((r) => r.moderation === 'pending').length,
      ],
      ['Địa điểm cộng đồng', communityPlaceQueue.length],
    ]
    // Two queues can share a count, so each number is asserted inside its own
    // labelled row rather than anywhere in the card.
    for (const [label, count] of expected) {
      const row = (await within(card).findByText(label)).closest('button')!
      expect(within(row).getByText(String(count))).toBeInTheDocument()
    }
  })

  it('lists recent import jobs from the real endpoint', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    expect(await screen.findByText('Import gần đây')).toBeInTheDocument()
    // The mock serves the fixture jobs; at least one shows with its status badge.
    expect(await screen.findByText('Mở quản lý import')).toBeInTheDocument()
  })

  it('renders cost and monitoring as explicitly not connected, with no invented numbers', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    expect(await screen.findByText('Sức khoẻ dịch vụ')).toBeInTheDocument()
    expect(screen.getAllByText('Chưa nối').length).toBe(2)
    // The named missing contracts appear as monospace endpoints.
    expect(screen.getByText('GET /v1/cms/ops/health')).toBeInTheDocument()
    expect(screen.getByText('GET /v1/cms/ops/costs')).toBeInTheDocument()
    // No dollar figure anywhere on the screen.
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument()
  })
})
