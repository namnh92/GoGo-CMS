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

  it('withholds the forecast until the month has enough days behind it', async () => {
    signInAs('ops_admin')
    server.use(
      http.get('/v1/cms/ops/costs', () =>
        HttpResponse.json(
          costsBody({
            cards: {
              ...costOverview.cards,
              projected: { ...costOverview.cards.projected, micros: null, elapsedDays: 2 },
            },
          }),
        ),
      ),
    )
    renderWithProviders(<CostCenterScreen />, { route: '/costs' })

    expect(await screen.findByText('Cần ít nhất 3 ngày dữ liệu, mới có 2')).toBeInTheDocument()
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
