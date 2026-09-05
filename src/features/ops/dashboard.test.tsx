import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import {
  costOverview,
  costProviderRows,
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
   * COST-CMS-011 (#111). The card summarises the registry: one line per
   * provider, money after precedence, and an unknown that stays unknown.
   * Places / Routes / Sheets are Google services and never appear here as
   * providers.
   */
  it('summarises every registry provider and never lists a Google service as one', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    // 10,40 US$ month to date for Google (vi locale), from the fixture's
    // 10_400_000 micros. Amount and badges share the row, so the row is the
    // unit of assertion; Intl separates number and currency with a
    // non-breaking space, hence the whitespace normalisation.
    const googleRow = (await screen.findByText('Google')).closest('div')!
    expect(googleRow.textContent?.replace(/\s/g, ' ')).toContain('10,40 US$')
    // Every registry provider is a line — including the ones with no source.
    for (const name of ['Cloudflare', 'Apple', 'GoGo (nội bộ)', 'VIETMAP']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    // A planned provider has no cost source: a dash and the sentence, never 0.
    const vietmapRow = screen.getByText('VIETMAP').closest('div')!
    expect(vietmapRow.textContent).toContain('Chưa có nguồn chi phí')
    expect(vietmapRow.textContent).not.toMatch(/\d\s*(US\$|₫)/)
    // The legacy Google service groups are gone from the dashboard.
    for (const legacy of ['places', 'routes', 'sheets', 'maps_sdk', 'google.routeMatrix']) {
      expect(screen.queryByText(legacy)).not.toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: /Cost Center/ })).toHaveAttribute('href', '/costs')
  })

  it('renders an all-unknown registry without any currency figure — not as zero', async () => {
    server.use(
      http.get('/v1/cms/ops/costs', () =>
        HttpResponse.json({
          ...costOverview,
          providerRows: costProviderRows.filter((p) => p.costStatus === 'UNKNOWN'),
        }),
      ),
    )
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/' })

    const row = (await screen.findByText('VIETMAP')).closest('div')!
    expect(row.textContent).toContain('Chưa có nguồn chi phí')
    expect(screen.queryByText(/\d\s*US\$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d\s*₫/)).not.toBeInTheDocument()
  })
})
