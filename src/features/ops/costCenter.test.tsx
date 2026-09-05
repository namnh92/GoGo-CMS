import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { costOverview, opsCosts } from '@/shared/test/fixtures'
import CostCenterScreen from './costCenter.view'

/** The endpoint answers the legacy #335 keys and the v2 payload in one body. */
function costsBody(overrides: Partial<typeof costOverview> = {}) {
  return { ...opsCosts, ...costOverview, ...overrides }
}

/** By display name: a registry id also appears in the "no cost source" card. */
async function rowOf(displayName: string): Promise<HTMLElement> {
  return (await screen.findByText(displayName)).closest('tr') as HTMLElement
}

describe('Cost Center (COST-CMS-009)', () => {
  it('is an ops surface: an editor is denied and sees no numbers', async () => {
    signInAs('editor')
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    expect(
      await screen.findByText('Chỉ ops_admin trở lên xem được chi phí vận hành.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders every provider the registry sent, including one the client has never heard of', async () => {
    signInAs('ops_admin')
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    // Registry order, registry names — nothing here is a client-side list.
    expect(await screen.findByText('Google')).toBeInTheDocument()
    expect(screen.getByText('Cloudflare')).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('GoGo (nội bộ)')).toBeInTheDocument()

    // A provider in the registry with nothing connected is "chưa nối", and its
    // services table is absent rather than a row of zeros.
    const vietmap = screen.getByText('VIETMAP').closest('section') as HTMLElement
    expect(within(vietmap).getByText('Chưa nối')).toBeInTheDocument()
    expect(within(vietmap).getByText('Provider này chưa khai báo dịch vụ nào.')).toBeInTheDocument()
  })

  it('keeps "nothing measured this" and "measured zero" apart, and never prints $0 for the first', async () => {
    signInAs('ops_admin')
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    // Usage is exact, money is not: Routes bills per matrix element at a price
    // nobody verified. The quantity shows; the money says it has no source.
    const routes = await rowOf('Routes — Matrix')
    expect(within(routes).getByText(/8\.400/)).toBeInTheDocument()
    expect(within(routes).getByText('Chưa có nguồn chi phí')).toBeInTheDocument()
    expect(within(routes).queryByText(/US\$\s*0/)).not.toBeInTheDocument()

    // Sheets is instrumented under a fresh source and counted nothing. That is
    // a measured zero and says so in words.
    const sheets = await rowOf('Sheets API')
    expect(within(sheets).getByText('Đã đo, bằng 0')).toBeInTheDocument()
    expect(within(sheets).queryByText('Chưa có nguồn chi phí')).not.toBeInTheDocument()

    // The Maps SDK renders on a handset: nothing counts it at all.
    const sdk = await rowOf('Maps SDK (mobile)')
    expect(within(sdk).getByText('Chưa đo')).toBeInTheDocument()

    // The unknown card names what the console cannot cost.
    const unknownCard = screen.getByText('Chưa rõ chi phí').closest('section') as HTMLElement
    expect(within(unknownCard).getByText('vietmap')).toBeInTheDocument()
    expect(within(unknownCard).getByText('1 provider · 3 dịch vụ')).toBeInTheDocument()
  })

  it('never adds an invoice to the estimate it displaced', async () => {
    signInAs('ops_admin')
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    const r2 = await rowOf('R2 object storage')
    expect(within(r2).getByText('Hoá đơn')).toBeInTheDocument()
    // Reported spend is the ACTUAL row (1.25), not ACTUAL + ESTIMATED (2.65).
    expect(within(r2).queryByText(/2,65|2\.65/)).not.toBeInTheDocument()
    // A stale source still has numbers — a different claim from having none.
    expect(within(r2).getByText('Cũ')).toBeInTheDocument()
  })

  it('re-queries when the window changes rather than only repainting', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    const windows: string[] = []
    server.use(
      http.get('/v1/cms/ops/costs', ({ request }) => {
        const window = new URL(request.url).searchParams.get('window') ?? 'mtd'
        windows.push(window)
        return HttpResponse.json(costsBody({ window: window as typeof costOverview.window }))
      }),
    )
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    await screen.findByText('Google')
    await user.click(screen.getByRole('button', { name: 'Hôm nay' }))

    await waitFor(() => expect(windows).toContain('today'))
    expect(windows[0]).toBe('mtd')
  })

  it('opens a service and names an operation the registry does not know', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    await user.click(await screen.findByRole('button', { name: /Places API/ }))

    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('google.placePhoto')).toBeInTheDocument()
    expect(within(drawer).getByText('Ngoài registry')).toBeInTheDocument()
    expect(within(drawer).getByText('ledger')).toBeInTheDocument()
  })

  it('says the ledger is off instead of showing its silence as zero', async () => {
    signInAs('ops_admin')
    server.use(
      http.get('/v1/cms/ops/costs', () => HttpResponse.json(costsBody({ ledgerEnabled: false }))),
    )
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    expect(await screen.findByText(/Sổ chi phí trong tiến trình đang tắt/)).toBeInTheDocument()
  })

  it('keeps month actual, end-of-month cash and normalised run-rate as three numbers (COST-CMS-012)', async () => {
    signInAs('ops_admin')
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    // Month actual: what landed, split by how it is billed — never a forecast input.
    const actual = (await screen.findByText('Thực chi tháng này')).closest('div') as HTMLElement
    expect(within(actual).getByText(/20[,.]54/)).toBeInTheDocument()
    expect(
      within(actual).getByText(/Usage 12[,.]29 .* · định kỳ 12[,.]00 .* · một lần 25[,.]00/),
    ).toBeInTheDocument()

    const forecast = screen.getByText('Dự báo tháng 2026-09').closest('section') as HTMLElement
    // Cash: usage projection + this month's recurring charges + one-offs — 86.87,
    // not the old MTD × days (20.54 ÷ 10 × 30 = 61.62).
    const cash = within(forecast)
      .getByText('Dự báo tiền mặt cuối tháng')
      .closest('div') as HTMLElement
    expect(within(cash).getByText(/^86[,.]87/)).toBeInTheDocument()
    expect(within(forecast).queryByText(/61[,.]62/)).not.toBeInTheDocument()
    // Run-rate: annual fees as a twelfth, one-offs named as excluded.
    const runRate = within(forecast)
      .getByText('Run-rate tháng (chuẩn hoá)')
      .closest('div') as HTMLElement
    expect(within(runRate).getByText(/^60[,.]95/)).toBeInTheDocument()
    expect(within(runRate).getByText(/Không gồm 25[,.]00 .* phí một lần/)).toBeInTheDocument()
    // What is still to bill is listed by date, with its kind.
    expect(within(forecast).getByText('VPS (backup)')).toBeInTheDocument()
    expect(within(forecast).getByText('2026-09-20')).toBeInTheDocument()
    expect(within(forecast).getByText('Định kỳ · hàng năm')).toBeInTheDocument()

    // The budget line is the cash forecast, with the run-rate beside it.
    expect(screen.getByText(/Dự báo tiền mặt hết tháng 86[,.]87/)).toBeInTheDocument()
    expect(screen.getByText(/Run-rate chuẩn hoá 60[,.]95 .*\/tháng/)).toBeInTheDocument()
  })

  it('shows the cash forecast as a known floor, with the reason, until the usage half can be projected', async () => {
    signInAs('ops_admin')
    const { forecast, budget } = costOverview.cards
    server.use(
      http.get('/v1/cms/ops/costs', () =>
        HttpResponse.json(
          costsBody({
            cards: {
              ...costOverview.cards,
              forecast: {
                ...forecast,
                elapsedDays: 2,
                usage: {
                  mtdMicros: 2_000_000,
                  projectedMicros: null,
                  reason: 'INSUFFICIENT_HISTORY',
                },
                cash: { micros: null, floorMicros: 50_000_000, partial: true },
                runRate: { ...forecast.runRate, micros: null, usageMicros: null },
              },
              budget: {
                ...budget,
                total: {
                  ...budget.total!,
                  projectedMicros: null,
                  projectedPct: null,
                  projectedFloorMicros: 50_000_000,
                  runRateMicros: null,
                },
              },
            },
          }),
        ),
      ),
    )
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    expect(await screen.findByText(/≥ 50[,.]00/)).toBeInTheDocument()
    // The reason is stated beside both the cash and the run-rate figure.
    expect(screen.getAllByText(/cần ít nhất 3 ngày dữ liệu, mới có 2/)).toHaveLength(2)
    // No invented number: the old formula would have printed 30.00 here.
    expect(screen.queryByText(/\b30[,.]00\b/)).not.toBeInTheDocument()
    expect(screen.getByText(/Đã cam kết ít nhất 50[,.]00/)).toBeInTheDocument()
  })

  it('refuses to sum two currencies into one figure', async () => {
    signInAs('ops_admin')
    server.use(
      http.get('/v1/cms/ops/costs', () =>
        HttpResponse.json(
          costsBody({
            cards: {
              ...costOverview.cards,
              monthToDate: {
                ...costOverview.cards.monthToDate,
                mixedCurrency: true,
                currency: null,
              },
            },
          }),
        ),
      ),
    )
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    expect(await screen.findByText('Nhiều loại tiền — không cộng được')).toBeInTheDocument()
  })

  it('lists test runs with a link into the run', async () => {
    signInAs('ops_admin')
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    const link = await screen.findByRole('link', { name: 'e2e · suggestion smoke' })
    expect(link).toHaveAttribute('href', '/costs/test-runs/33333333-0000-4000-8000-000000000001')
  })
})
