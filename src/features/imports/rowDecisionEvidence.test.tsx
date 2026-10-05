import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { importJobs } from '@/shared/test/fixtures'
import ImportJobScreen from './jobDetail.view'

/*
 * GoGo-BE#280 (BE#672 @cda3e2a) — a merge or candidate confirmation on a row
 * whose stored address / phone / website no longer pass the evidence rules is
 * `409 CONTACT_EVIDENCE_REQUIRED`, and the server has already persisted the
 * row as `validation_failed`. The console says why in its own words and
 * reloads the rows, instead of leaving a stale "duplicate" offering a merge
 * that can never succeed.
 */
const job = importJobs[0]!

describe('row decision refused for contact evidence', () => {
  it('explains the refusal and reloads the rows', async () => {
    signInAs('ops_admin')
    let rowReads = 0
    server.use(
      http.post('*/cms/place-imports/:jobId/rows/:rowId/merge', () =>
        HttpResponse.json(
          {
            code: 'CONTACT_EVIDENCE_REQUIRED',
            message: 'contact evidence required',
            field_errors: [
              { field: 'phone_source_type', code: 'PHONE_EVIDENCE_REQUIRED', message: 'x' },
            ],
            request_id: 'req-evidence',
            retryable: false,
          },
          { status: 409 },
        ),
      ),
    )
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'GET' && /\/place-imports\/[^/]+\/rows/.test(request.url))
        rowReads += 1
    })
    const user = userEvent.setup()
    renderWithProviders(
      <Routes>
        <Route path="/imports/:jobId" element={<ImportJobScreen />} />
      </Routes>,
      { route: `/imports/${job.id}` },
    )

    const table = await screen.findByRole('table')
    await within(table).findByText('Chào Bạn Cafe')
    const before = rowReads
    await user.click(within(table).getByRole('button', { name: 'Gộp' }))

    expect(await screen.findByText(/chưa đủ nguồn theo quy định hiện hành/)).toBeInTheDocument()
    await waitFor(() => expect(rowReads).toBeGreaterThan(before))
    server.events.removeAllListeners()
  })
})
