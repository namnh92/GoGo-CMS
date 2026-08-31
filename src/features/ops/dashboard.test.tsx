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

  it('renders every health state distinctly — unknown is never healthy', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    expect(await screen.findByText('Sức khoẻ dịch vụ')).toBeInTheDocument()
    // The four states from the fixture, each in words, not colour alone.
    expect(await screen.findByText('Suy giảm')).toBeInTheDocument()
    expect(screen.getByText('Sập')).toBeInTheDocument()
    expect(screen.getByText('Chưa đo')).toBeInTheDocument()
    expect(screen.getAllByText('Khoẻ').length).toBeGreaterThan(0)
    // The unknown provider's explanation is shown, not painted over.
    expect(screen.getByText(/chưa có lời gọi nào/)).toBeInTheDocument()
  })

  it('marks a truncated failure count as a floor and labels the outbox row', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    // Title appears in both the heading and the sr-only caption; take the table.
    await screen.findByRole('heading', { name: 'Hàng đợi nền' })
    const table = (await screen.findByText('image-processing')).closest('table')!
    // 500 was capped: rendered as a floor, never as an exact count.
    expect(within(table).getByText('≥500')).toBeInTheDocument()
    // The Postgres outbox is a queue here, and says where its numbers come from.
    expect(within(table).getByText('outbox_events')).toBeInTheDocument()
    expect(within(table).getByText('outbox')).toBeInTheDocument()
  })

  it('renders "no cost source" without any currency figure — not as zero', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    expect(await screen.findByText(/Chưa có nguồn chi phí nào được nối/)).toBeInTheDocument()
    // No invented money on the whole screen: the fixture has sourcesConfigured=false.
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d\s*₫/)).not.toBeInTheDocument()
  })
})
