import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { importJobs } from '@/shared/test/fixtures'
import ImportJobScreen from './jobDetail.view'

/**
 * PI-BE-028 / PI-CMS-033 — publishing an import creates the rows that resolved
 * and nothing else.
 *
 * A real file mixes them: a Place ID that resolved, a share link that matched a
 * place already in the catalogue, a name Google could not pin down. The server
 * publishes only `ready` rows, and the fixture job is that shape — 210 ready
 * beside duplicates, rows awaiting confirmation, failures and pending work. The
 * screen must promise exactly the ready count and never imply the rest are on
 * their way in.
 */

/** The mixed fixture: ready 210, duplicate 4, needs_confirmation 12, failed 6. */
const JOB = importJobs.find((job) => job.rowsByStatus.duplicate === 4)!
const ROUTE = `/imports/${JOB.id}`

function mount() {
  signInAs('ops_admin')
  return renderWithProviders(
    <Routes>
      <Route path="/imports/:jobId" element={<ImportJobScreen />} />
    </Routes>,
    { route: ROUTE },
  )
}

describe('publishing a mixed import job', () => {
  it('offers to publish the ready rows only', async () => {
    mount()

    await userEvent.click(await screen.findByRole('button', { name: /Xuất bản vào catalog/ }))
    const dialog = await screen.findByRole('dialog', { name: /Xác nhận xuất bản/ })

    // 210, not the 500 uploaded and not the 232 classified: a duplicate row and
    // a row nobody has confirmed are not on their way into the catalogue.
    expect(within(dialog).getByText(/Xuất bản 210 dòng đã chọn/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/500/)).not.toBeInTheDocument()
    // And it says so in words, because a count alone does not tell an operator
    // which rows were left behind.
    expect(within(dialog).getByText(/Chỉ các dòng ở trạng thái “Sẵn sàng”/)).toBeInTheDocument()
  })

  it('reports what the server created, not what was uploaded', async () => {
    const published: string[] = []
    server.use(
      http.post(`*/cms/place-imports/${JOB.id}/publish`, () => {
        published.push(JOB.id)
        // The duplicate, unresolved and failed rows created nothing.
        return HttpResponse.json({ jobId: JOB.id, created: 210, failed: [] }, { status: 201 })
      }),
    )
    mount()

    await userEvent.click(await screen.findByRole('button', { name: /Xuất bản vào catalog/ }))
    const dialog = await screen.findByRole('dialog', { name: /Xác nhận xuất bản/ })
    await userEvent.click(within(dialog).getByRole('button', { name: /Xuất bản vào catalog/ }))

    await waitFor(() => expect(published).toHaveLength(1))
    expect(await screen.findByText(/Đã tạo 210 địa điểm, 0 dòng lỗi/)).toBeInTheDocument()
  })

  it('offers nothing to publish when no row resolved', async () => {
    server.use(
      http.get(`*/cms/place-imports/${JOB.id}`, () =>
        HttpResponse.json({
          ...JOB,
          status: 'failed',
          rowsByStatus: { duplicate: 4, unresolved: 2, validation_failed: 1 },
        }),
      ),
    )
    mount()

    // A duplicate is not a candidate and neither is an unresolved row, so the
    // action that would create places is unavailable rather than a no-op.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Xuất bản vào catalog/ })).toBeDisabled(),
    )
  })
})
