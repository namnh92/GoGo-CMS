import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { opsCostModel, opsLatencySemantics, opsProviders, opsSummary } from '@/shared/test/fixtures'
import MonitoringScreen from './monitoring.view'

const BASE = '*/v1'

function Routed() {
  return (
    <Routes>
      <Route path="/monitoring" element={<MonitoringScreen />} />
    </Routes>
  )
}

const render = () => renderWithProviders(<Routed />, { route: '/monitoring' })

describe('provider monitoring (GoGo-BE#315)', () => {
  it('is closed to a role the server would refuse anyway', () => {
    // The nav hides it and this renders the permission screen, but neither is
    // the check: `/v1/cms/ops/*` answers 403 to rank 1 regardless.
    signInAs('editor')
    render()
    expect(screen.getByText(/ops_admin/)).toBeInTheDocument()
  })

  it('shows the overview once the store answers', async () => {
    signInAs('ops_admin')
    render()

    expect(await screen.findByText('420')).toBeInTheDocument()
    expect(screen.getByText('Đang thu thập')).toBeInTheDocument()
    // Seconds in the API, milliseconds on the screen — the conversion is
    // presentation, and 440 ms reads better than 0.44 s at a glance.
    expect(screen.getAllByText('440 ms').length).toBeGreaterThan(0)
  })

  it('says what the p95 leaves out rather than leaving it to be guessed', async () => {
    signInAs('ops_admin')
    render()
    expect(await screen.findByText(/không tính status 400, 404/)).toBeInTheDocument()
    expect(screen.getByText(opsLatencySemantics.excludesReason)).toBeInTheDocument()
  })

  it('keeps rejected-request latency out of the headline figure but on the page', async () => {
    signInAs('ops_admin')
    render()
    const row = (await screen.findByText('Độ trễ của request bị từ chối')).closest('tr')!
    // 30ms next to a 440ms p95 is the entire reason rejections are excluded.
    expect(within(row).getByText('30 ms')).toBeInTheDocument()
    expect(within(row).getByText('50 ms')).toBeInTheDocument()
  })

  it('withholds p99 instead of printing one from too few samples', async () => {
    signInAs('ops_admin')
    render()
    const row = (await screen.findByText('Độ trễ p50 / p99')).closest('tr')!
    expect(within(row).getByText('175 ms')).toBeInTheDocument()
    expect(within(row).getByText('chưa đo')).toBeInTheDocument()
  })

  it('renders an uninstrumented provider as "chưa đo", never as zero calls', async () => {
    signInAs('ops_admin')
    render()

    const sheets = (await screen.findByText('Google Sheets')).closest('tr')!
    expect(
      within(sheets).getByText(/Chưa đo — chưa có metric nào cho provider này/),
    ).toBeInTheDocument()
    // The defect this guards: eight zeros in a row reads as "nobody used it"
    // when the truth is "nobody measured it".
    expect(within(sheets).queryByText('0')).not.toBeInTheDocument()
  })

  it('shows Sheets with no billable units even where other providers have them', async () => {
    signInAs('ops_admin')
    render()
    const places = (await screen.findByText('Google Places')).closest('tr')!
    expect(within(places).getByText('500')).toBeInTheDocument()
    expect(screen.getByText(opsCostModel.note)).toBeInTheDocument()
  })

  it('never prints a currency next to a unit count', async () => {
    signInAs('ops_admin')
    const { container } = render()
    await screen.findByText('512')
    // `estimatedCost` is null because no unit price exists in the system.
    expect(container.textContent).not.toMatch(/[₫$€]/)
    expect(screen.getByText(/không phải tiền/)).toBeInTheDocument()
  })

  it('switching the window re-queries rather than repainting', async () => {
    signInAs('ops_admin')
    render()
    await screen.findByText('420')

    await userEvent.click(screen.getByRole('button', { name: '30 ngày' }))

    // A selector that only swaps a query param without changing the render is
    // a bug (workspace quality-gates rule).
    expect(await screen.findByText(/Yêu cầu 30d nhưng kho chỉ giữ 14 ngày/)).toBeInTheDocument()
    expect(screen.getByText(/phủ 14d/)).toBeInTheDocument()
  })

  it('states a shorter span instead of drawing sixteen days that never existed', async () => {
    signInAs('ops_admin')
    render()
    await screen.findByText('420')
    await userEvent.click(screen.getByRole('button', { name: '30 ngày' }))
    expect(await screen.findByText(/không tồn tại chứ không phải bằng 0/)).toBeInTheDocument()
  })

  it('says monitoring is down without implying GoGo is', async () => {
    server.use(
      http.get(`${BASE}/cms/ops/summary`, () =>
        HttpResponse.json({
          ...opsSummary,
          backend: { status: 'unavailable', detail: 'Monitoring backend is not answering' },
          totals: null,
          trends: null,
        }),
      ),
    )
    signInAs('ops_admin')
    render()

    expect(await screen.findByText(/Phần còn lại của GoGo không bị ảnh hưởng/)).toBeInTheDocument()
    expect(screen.getByText('Không kết nối được')).toBeInTheDocument()
    // Blank cards, not zeroed ones.
    expect(screen.getAllByText('chưa đo').length).toBeGreaterThan(3)
  })

  it('marks stale data as stale rather than passing it off as live', async () => {
    server.use(
      http.get(`${BASE}/cms/ops/summary`, () =>
        HttpResponse.json({
          ...opsSummary,
          backend: { status: 'degraded', detail: 'Monitoring backend is not answering' },
          stale: true,
          asOf: '2026-09-01T11:56:00.000Z',
        }),
      ),
    )
    signInAs('ops_admin')
    render()

    expect(await screen.findByText(/Lần làm mới gần nhất thất bại/)).toBeInTheDocument()
    expect(screen.getByText('Số liệu cũ')).toBeInTheDocument()
    // The numbers are still shown: during an incident they are usually the
    // ones someone wants.
    expect(screen.getByText('420')).toBeInTheDocument()
  })

  it('draws no trend line from a single point', async () => {
    server.use(
      http.get(`${BASE}/cms/ops/summary`, () =>
        HttpResponse.json({
          ...opsSummary,
          trends: {
            stepSeconds: 300,
            series: {
              requests: [{ t: '2026-09-01T12:00:00.000Z', v: 1 }],
              failures: [],
              latencyP95: [],
              costUnits: [],
            },
          },
        }),
      ),
    )
    signInAs('ops_admin')
    render()
    // One point is not a trend, and a flat stub reads like one.
    expect((await screen.findAllByText('Chưa đủ dữ liệu để vẽ')).length).toBe(4)
  })

  it('reaches only the CMS ops contract — never /v1/metrics, never Grafana', async () => {
    const seen: string[] = []
    server.events.on('request:start', ({ request }) => seen.push(request.url))
    signInAs('ops_admin')
    render()
    await screen.findByText('420')

    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    for (const url of seen) {
      expect(url).not.toContain('/v1/metrics')
      expect(url).not.toContain('grafana')
      // No PromQL leaves the browser: the window is the whole input surface.
      expect(url).not.toContain('query=')
      expect(url).not.toContain('promql')
    }
    expect(seen.some((u) => u.includes('/cms/ops/summary?window=24h'))).toBe(true)
  })

  it('ships no credential in anything it renders', async () => {
    signInAs('ops_admin')
    const { container } = render()
    await screen.findByText('420')
    const text = container.innerHTML
    for (const secret of ['glc_', 'grafana.net', 'Authorization', 'Bearer ']) {
      expect(text).not.toContain(secret)
    }
    // Series names describe internal structure and have no business in a DOM.
    expect(text).not.toContain('places_provider_requests_total')
    expect(text).not.toContain('histogram_quantile')
    void opsProviders
  })
})
