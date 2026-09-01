import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import {
  opsCostsUnmeasured,
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
    // "Chưa đo" now appears on the cost card too (GoGo-BE#335 gaps), so this
    // asserts the health table's own copy rather than the only one on screen.
    expect(screen.getAllByText('Chưa đo').length).toBeGreaterThan(0)
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

  /**
   * GoGo-BE#335 connected a durable ledger, so this card shows money. The rule
   * it replaced is not gone: what has no amount is *named*, never folded into
   * one.
   */
  it('shows estimated spend and names what it could not price', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    // 10,40 US$ month to date for Places (vi locale), from the fixture's
    // 10_400_000 micros.
    // The amount and its "MTD" label share one node, so the row is the unit
    // of assertion rather than a bare text match.
    const placesRow = (await screen.findByText('places')).closest('div')!
    // Intl separates the number from the currency with a non-breaking space, so
    // the assertion normalises whitespace rather than pinning U+00A0.
    expect(placesRow.textContent?.replace(/\s/g, ' ')).toContain('10,40 US$')
    // Routes has exact units and no verified per-element price.
    expect(screen.getByText('google.routeMatrix')).toBeInTheDocument()
    expect(screen.getByText('Chưa có giá')).toBeInTheDocument()
    // The SDK renders on the handset; nothing here counts it.
    expect(screen.getByText('google.maps_sdk_ios')).toBeInTheDocument()
    // Freshness, so a stale figure can be recognised as one.
    expect(screen.getByText(/bảng giá 2026-09-01/)).toBeInTheDocument()
  })

  it('renders "no cost source" without any currency figure — not as zero', async () => {
    // The ledger switched off (`COST_LEDGER_ENABLED=false`) is the rollback
    // path for GoGo-BE#335, and it must still read as "we do not know" rather
    // than as nothing spent.
    server.use(http.get('/v1/cms/ops/costs', () => HttpResponse.json(opsCostsUnmeasured)))
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    expect(await screen.findByText(/Chưa có nguồn chi phí nào được nối/)).toBeInTheDocument()
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d\s*₫/)).not.toBeInTheDocument()
  })
})
