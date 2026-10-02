import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { importJobs } from '@/shared/test/fixtures'
import { importJobSchema, importJobSummarySchema } from '@/shared/api/contracts-import'
import ImportJobScreen from './jobDetail.view'
import ImportListScreen from './importList.view'

/*
 * GoGo-BE#284 / BE PR #658. A bulk import now parks on every provider fault,
 * and splits the pause in two: `paused_provider_quota` (wait for quota) and
 * `paused_provider_unavailable` (disabled API, bad key, upstream outage —
 * waiting does nothing). `ImportJobSummary.status` becomes an
 * `x-extensible-enum`, so a value the console has never heard of is data,
 * not a broken response.
 */

const quotaJob = importJobs.find((job) => job.status === 'paused_provider_quota')!

function Routed() {
  return (
    <Routes>
      <Route path="/imports" element={<ImportListScreen />} />
      <Route path="/imports/:jobId" element={<ImportJobScreen />} />
    </Routes>
  )
}

/** The quota-paused fixture, served under another status. */
function serveJobAs(status: string) {
  const job = { ...quotaJob, status }
  server.use(
    http.get(`*/cms/place-imports/${quotaJob.id}`, () => HttpResponse.json(job)),
    http.get('*/cms/place-imports', () => HttpResponse.json({ items: [job], nextOffset: null })),
  )
}

describe('import job status schema (GoGo-BE#284)', () => {
  it('accepts the provider-unavailable pause', () => {
    const parsed = importJobSummarySchema.safeParse({
      ...quotaJob,
      status: 'paused_provider_unavailable',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a status this console does not know yet instead of failing the parse', () => {
    const parsed = importJobSchema.safeParse({ ...quotaJob, status: 'archived_by_retention' })
    expect(parsed.success).toBe(true)
  })
})

describe('provider-unavailable pause (GoGo-BE#284)', () => {
  it('says the provider is unavailable, rows intact, and offers resume — not quota', async () => {
    signInAs('ops_admin')
    serveJobAs('paused_provider_unavailable')
    renderWithProviders(<Routed />, { route: `/imports/${quotaJob.id}` })

    expect(await screen.findByText('Tạm dừng — nhà cung cấp không dùng được')).toBeInTheDocument()
    const note = screen.getByText('Không gọi được nhà cung cấp').closest('p')!
    expect(note).toHaveAttribute('role', 'status')
    expect(within(note).getByText(/Dữ liệu của bạn còn nguyên/)).toBeInTheDocument()
    expect(within(note).getByText(/không phải hết hạn mức/)).toBeInTheDocument()
    // Not dressed up as the quota pause.
    expect(screen.queryByText('Nhà cung cấp hết hạn mức')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chạy tiếp' })).toBeEnabled()
  })

  it('still tells the quota pause apart (no regression)', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/imports/${quotaJob.id}` })

    expect(await screen.findByText('Nhà cung cấp hết hạn mức')).toBeInTheDocument()
    expect(screen.queryByText('Không gọi được nhà cung cấp')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chạy tiếp' })).toBeInTheDocument()
  })

  it('flags the pause on the job list and offers resume from the row', async () => {
    signInAs('ops_admin')
    serveJobAs('paused_provider_unavailable')
    renderWithProviders(<Routed />, { route: '/imports' })

    const table = await screen.findByRole('table')
    expect(screen.getByText('Không gọi được nhà cung cấp')).toBeInTheDocument()
    expect(screen.queryByText('Nhà cung cấp hết hạn mức')).not.toBeInTheDocument()
    expect(within(table).getByText('Tạm dừng — nhà cung cấp không dùng được')).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Chạy tiếp' })).toBeInTheDocument()
  })
})

describe('unknown job status (x-extensible-enum)', () => {
  it('renders the job with an "unknown status" badge and no start or resume', async () => {
    signInAs('ops_admin')
    serveJobAs('archived_by_retention')
    renderWithProviders(<Routed />, { route: `/imports/${quotaJob.id}` })

    expect(
      await screen.findByText('Trạng thái chưa xác định (archived_by_retention)'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Không tải được dữ liệu')).not.toBeInTheDocument()
    // Nothing is offered for a state the console cannot reason about.
    expect(screen.queryByRole('button', { name: 'Chạy tiếp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chạy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dừng' })).not.toBeInTheDocument()
    // CMS#223 F-01: no retry and no publish either, even with ready rows.
    expect(quotaJob.rowsByStatus.ready).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Thử lại dòng lỗi' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Xuất bản vào catalog/ })).toBeDisabled()
  })

  it('keeps the job list on screen when one row carries an unknown status', async () => {
    signInAs('ops_admin')
    serveJobAs('archived_by_retention')
    renderWithProviders(<Routed />, { route: '/imports' })

    const table = await screen.findByRole('table')
    expect(
      within(table).getByText('Trạng thái chưa xác định (archived_by_retention)'),
    ).toBeInTheDocument()
    // CMS#223 F-02: the row offers no action for a state it cannot reason about.
    for (const name of ['Chạy', 'Chạy tiếp', 'Dừng', 'Thử lại dòng lỗi']) {
      expect(within(table).queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})
