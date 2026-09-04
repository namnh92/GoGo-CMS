import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import CostTestRunScreen from './costTestRun.view'

const FINISHED = '33333333-0000-4000-8000-000000000001'
const RUNNING = '33333333-0000-4000-8000-000000000002'

function renderRun(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/costs/test-runs/:id" element={<CostTestRunScreen />} />
    </Routes>,
    { route: `/costs/test-runs/${id}` },
  )
}

describe('test-run cost (COST-CMS-009)', () => {
  it('is an ops surface: an editor is denied', async () => {
    signInAs('editor')
    renderRun(FINISHED)

    expect(
      await screen.findByText('Chỉ ops_admin trở lên xem được chi phí vận hành.'),
    ).toBeInTheDocument()
  })

  it('reports a finished run as a floor when a billable meter has no price', async () => {
    signInAs('ops_admin')
    renderRun(FINISHED)

    expect(await screen.findByText(/1 chỉ số có tính cước nhưng chưa có giá/)).toBeInTheDocument()
    expect(screen.getByText('google.routeMatrix/billable_elements')).toBeInTheDocument()

    // The unpriced meter shows its usage and says the price is missing —
    // it does not contribute a zero to the total.
    const table = await screen.findByRole('table')
    const routes = within(table).getByText('billable_elements').closest('tr') as HTMLElement
    expect(within(routes).getByText('400')).toBeInTheDocument()
    expect(within(routes).getByText('Chưa có giá')).toBeInTheDocument()
  })

  it('shows an open run as unmeasured rather than as costing nothing', async () => {
    signInAs('ops_admin')
    renderRun(RUNNING)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'load · room fanout' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Lần chạy chưa kết thúc: chưa đo được gì.')).toBeInTheDocument()
    // Neither total may render as 0 while the run is open.
    expect(screen.queryByText(/US\$\s*0/)).not.toBeInTheDocument()
    expect(screen.getByText('Toàn bộ dịch vụ')).toBeInTheDocument()
  })
})
