import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { costOverview, opsLatencySemantics, opsProviders, opsSummary } from '@/shared/test/fixtures'
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
  })

  /**
   * COST-CMS-014 (#119), ADR-0014 amendment. /monitoring is the runtime
   * surface and states no amount: the estimate that used to sit here (list
   * price, no free tier) disagreed with the Cost Center (ledger, free tier
   * applied) for the same service on the same day. The column is now a link
   * to the row that does the arithmetic, and nothing on this page is money.
   */
  it('prints no money anywhere and links each provider row to its Cost Center row', async () => {
    signInAs('ops_admin')
    render()
    await screen.findByText('512')
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/chưa trừ hạn mức miễn phí/)).not.toBeInTheDocument()
    expect(screen.queryByText('Chưa có giá')).not.toBeInTheDocument()
    expect(screen.queryByText('Chi phí ước tính')).not.toBeInTheDocument()
    const places = (await screen.findByText('Google Places')).closest('tr')!
    expect(within(places).getByRole('link', { name: 'Cost Center →' })).toHaveAttribute(
      'href',
      '/costs#service-google.places',
    )
    // Units are a count, not a price — they stay.
    expect(within(places).getByText('500')).toBeInTheDocument()
    // Two SDKs behind one console group: the link lands on the provider, and
    // the uninstrumented row still says so in words.
    const sdk = (await screen.findByText('Google Maps SDK (app)')).closest('tr')!
    expect(within(sdk).getByRole('link', { name: 'Cost Center →' })).toHaveAttribute(
      'href',
      '/costs#provider-google',
    )
    expect(within(sdk).getByText(/Chưa đo/)).toBeInTheDocument()
  })

  it('lists the Maps SDK as a provider row rather than leaving it out', async () => {
    signInAs('ops_admin')
    render()
    // An absent row and a zero row read the same to anyone not holding the
    // spec, so the uninstrumented provider is named and marked.
    expect(await screen.findByText('Google Maps SDK (app)')).toBeInTheDocument()
  })

  /**
   * COST-CMS-012 (#112). /monitoring is the runtime surface for the whole
   * registry: every provider has a row, Google is one group, and a provider
   * nothing measures says so instead of disappearing.
   */
  it('lists every registry provider once — Google as one group, none dropped for lacking telemetry', async () => {
    signInAs('ops_admin')
    render()

    const table = (await screen.findByText('Upstash')).closest('table')!
    // One header row plus one row per fixture provider — nothing filtered out.
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 6)
    for (const name of ['Google', 'Cloudflare', 'Upstash', 'Apple', 'GoGo (nội bộ)', 'VIETMAP']) {
      expect(within(table).getByText(name)).toBeInTheDocument()
    }
    // Google appears once here; its service groups live in their own table below.
    expect(within(table).getAllByText('Google')).toHaveLength(1)
    expect(screen.getByText('Google Places')).toBeInTheDocument()
  })

  it('states four dimensions per provider, none derived from another — never a zero, never a blank', async () => {
    signInAs('ops_admin')
    render()
    const table = (await screen.findByText('Upstash')).closest('table')!
    const rowOf = (name: string) => within(table).getByText(name).closest('tr')!

    // Google: active, PARTIAL — three of four runtime services measured, the
    // unmeasured one named; money arrives by code and is fresh.
    const google = rowOf('Google')
    expect(within(google).getByText('Đang dùng')).toBeInTheDocument()
    expect(within(google).getByText('PARTIAL')).toBeInTheDocument()
    expect(
      within(google).getByText('3/4 dịch vụ đo đủ. Chưa đo: Maps SDK (mobile).'),
    ).toBeInTheDocument()
    expect(within(google).getByText('Tự động')).toBeInTheDocument()
    expect(within(google).getByText('Mới')).toBeInTheDocument()
    // Upstash: this process calls Redis and measures nothing — a runtime gap
    // beside a working cost collector, two facts in two cells.
    const upstash = rowOf('Upstash')
    expect(within(upstash).getByText('NOT INSTRUMENTED')).toBeInTheDocument()
    expect(within(upstash).getByText('Có runtime, chưa có metric nào: Redis.')).toBeInTheDocument()
    expect(within(upstash).getByText('Tự động')).toBeInTheDocument()
    expect(within(upstash).getByText('Mới')).toBeInTheDocument()
    // VIETMAP: planned — no runtime, no way for money in, nothing to be current.
    const vietmap = rowOf('VIETMAP')
    expect(within(vietmap).getByText('Chưa nối')).toBeInTheDocument()
    expect(within(vietmap).getByText('N/A')).toBeInTheDocument()
    expect(within(vietmap).getByText('Không có')).toBeInTheDocument()
    expect(within(vietmap).getByText('Không áp dụng')).toBeInTheDocument()
    expect(screen.queryByText('NO TELEMETRY')).not.toBeInTheDocument()
    // Apple: a fee is active (the form exists), has no runtime, and is manual.
    const apple = rowOf('Apple')
    expect(within(apple).getByText('Đang dùng')).toBeInTheDocument()
    expect(within(apple).getByText('N/A')).toBeInTheDocument()
    expect(within(apple).getByText('Nhập tay')).toBeInTheDocument()
    expect(within(apple).getByText('Mới')).toBeInTheDocument()
    // Every row links to the financial surface.
    expect(within(table).getAllByRole('link', { name: 'Cost Center →' })).toHaveLength(6)
  })

  /**
   * COST-CMS-015 (#129). The API connects its rate-limit Redis client at boot
   * (GoGo-BE#424/#427) and reports how that went on the service row. A bad
   * outcome is a warning — the store fails open to memory — so it must never
   * read as the provider being down: same registry status, same coverage.
   */
  it('shows the boot-time Redis connection in the Upstash drill-down, as a warning when it failed', async () => {
    signInAs('ops_admin')
    render()
    const table = (await screen.findByText('Upstash')).closest('table')!
    const upstash = within(table).getByText('Upstash').closest('tr')!
    await userEvent.click(within(upstash).getByRole('button', { name: 'Chi tiết dịch vụ' }))
    const detail = screen.getByText('Dịch vụ của Upstash').closest('td')!
    const line = within(detail).getByTestId('runtime-connection')
    expect(within(line).getByText('Đã kết nối')).toBeInTheDocument()
    expect(within(line).queryByText(/fail-open/)).not.toBeInTheDocument()
  })

  it('a failed boot-time connection is amber and says fail-open, not down', async () => {
    server.use(
      http.get(`${BASE}/cms/ops/costs`, () =>
        HttpResponse.json({
          ...costOverview,
          providerRows: costOverview.providerRows.map((p) =>
            p.providerId !== 'upstash'
              ? p
              : {
                  ...p,
                  services: p.services.map((s) => ({
                    ...s,
                    runtime: {
                      ...s.runtime,
                      connection: {
                        operation: 'upstash.redis.rate_limit.connect',
                        status: 'unavailable',
                        observedAt: '2026-09-06T03:00:02.000Z',
                      },
                    },
                  })),
                },
          ),
        }),
      ),
    )
    signInAs('ops_admin')
    render()
    const table = (await screen.findByText('Upstash')).closest('table')!
    const upstash = within(table).getByText('Upstash').closest('tr')!
    // The provider row itself is untouched by the failure.
    expect(within(upstash).getByText('Đang dùng')).toBeInTheDocument()
    await userEvent.click(within(upstash).getByRole('button', { name: 'Chi tiết dịch vụ' }))
    const detail = screen.getByText('Dịch vụ của Upstash').closest('td')!
    const line = within(detail).getByTestId('runtime-connection')
    expect(within(line).getByText('Không kết nối được')).toBeInTheDocument()
    expect(within(line).getByText(/fail-open/)).toBeInTheDocument()
    expect(within(detail).queryByText('Lỗi')).not.toBeInTheDocument()
  })

  it('drills a provider down to its services instead of settling for one word', async () => {
    signInAs('ops_admin')
    render()
    const table = (await screen.findByText('Upstash')).closest('table')!
    const google = within(table).getByText('Google').closest('tr')!
    const toggle = within(google).getByRole('button', { name: 'Chi tiết dịch vụ' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Dịch vụ của Google')).not.toBeInTheDocument()

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const detail = screen.getByText('Dịch vụ của Google').closest('td')!
    const sdk = within(detail).getByText('Maps SDK (mobile)').closest('tr')!
    expect(within(sdk).getByText('SDK phía client')).toBeInTheDocument()
    expect(within(sdk).getByText('NOT INSTRUMENTED')).toBeInTheDocument()
    expect(within(sdk).getByText('0 / 1')).toBeInTheDocument()
    // The cost dimension of the SDK: automatic in principle, never observed —
    // and never called an error, which is what ERROR is reserved for.
    expect(within(sdk).getByText('Chưa quan sát')).toBeInTheDocument()
    expect(within(sdk).queryByText('Lỗi')).not.toBeInTheDocument()
    const places = within(detail).getByText('Places API').closest('tr')!
    expect(within(places).getByText('Trong process')).toBeInTheDocument()
    expect(within(places).getByText('FULL')).toBeInTheDocument()
    expect(within(places).getByText('2 / 2')).toBeInTheDocument()
    // No row without a provider is invented: a planned provider has nothing to open.
    const vietmap = within(table).getByText('VIETMAP').closest('tr')!
    expect(within(vietmap).queryByRole('button')).not.toBeInTheDocument()

    await userEvent.click(within(google).getByRole('button', { name: 'Ẩn chi tiết' }))
    expect(screen.queryByText('Dịch vụ của Google')).not.toBeInTheDocument()
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
