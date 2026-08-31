import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import ImportJobScreen from './jobDetail.view'

/** `useParams` only reports `jobId` under a matching route. */
const JOB_ID = '4f0b8e10-0000-4000-8000-000000000209'
const JOB_ROUTE = `/imports/${JOB_ID}`

function JobRoutes() {
  return (
    <Routes>
      <Route path="/imports/:jobId" element={<ImportJobScreen />} />
    </Routes>
  )
}
import { bucketCounts, ROW_STATUS_BUCKET } from './validation'
import { importRowStatusSchema } from '@/shared/api/contracts-import'

describe('validation buckets (CMS-024)', () => {
  it('accounts for every row status the contract defines', () => {
    // If the enum grows, this fails rather than silently dropping the new
    // status out of the counters.
    for (const status of importRowStatusSchema.options) {
      expect(ROW_STATUS_BUCKET).toHaveProperty(status)
    }
  })

  it('counts in-flight rows as in-flight, never as warnings', () => {
    const { buckets, inFlight, counted } = bucketCounts({
      ready: 4,
      imported: 2,
      needs_confirmation: 3,
      duplicate: 1,
      validation_failed: 2,
      unresolved: 1,
      failed: 1,
      pending: 5,
      resolving: 2,
    })

    expect(buckets).toEqual({ valid: 6, warning: 3, error: 4, duplicate: 1 })
    expect(inFlight).toBe(7)
    // Every row lands somewhere: the four buckets plus in-flight are the total.
    expect(buckets.valid + buckets.warning + buckets.error + buckets.duplicate + inFlight).toBe(
      counted,
    )
  })

  it('keeps an unknown future status in the total instead of dropping it', () => {
    const { buckets, inFlight, counted } = bucketCounts({ ready: 1, some_new_status: 3 })
    expect(buckets.valid).toBe(1)
    expect(inFlight).toBe(3)
    expect(counted).toBe(4)
  })
})

describe('validation counters on the job screen (CMS-024)', () => {
  it('renders the four buckets with their meaning spelled out', async () => {
    signInAs('ops_admin')
    renderWithProviders(<JobRoutes />, { route: JOB_ROUTE })

    const heading = await screen.findByText('Kết quả kiểm tra dữ liệu')
    const card = heading.closest('section')
    expect(card).not.toBeNull()

    for (const label of ['Hợp lệ', 'Cần xác nhận', 'Lỗi', 'Trùng']) {
      expect(within(card!).getByText(label)).toBeInTheDocument()
    }
    // Meaning is carried by text, not by the tone of the card. KpiCard prefixes
    // a glyph on toned rows, hence the loose match.
    expect(within(card!).getByText(/sẵn sàng \+ đã nhập/)).toBeInTheDocument()
    expect(within(card!).getByText(/dòng đang xử lý/)).toBeInTheDocument()
  })

  it('says the counts cover the whole job, not the page on screen', async () => {
    signInAs('ops_admin')
    renderWithProviders(<JobRoutes />, { route: JOB_ROUTE })

    expect(await screen.findByText(/Đếm trên toàn bộ job, do server tính/)).toBeInTheDocument()
    // 210 ready + 12 needs_confirmation + 4 duplicate + 6 failed = 232 classified,
    // 266 pending still in flight — the fixture's own numbers, not a guess.
    expect(await screen.findByText(/266 dòng đang xử lý/)).toBeInTheDocument()
  })
})
