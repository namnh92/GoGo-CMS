import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { importJobs } from '@/shared/test/fixtures'
import { resetMockDb } from '@/shared/test/handlers'
import ImportJobScreen from './jobDetail.view'

/*
 * GoGo-BE#280 (BE#672 @cda3e2a) — a merge or candidate confirmation on a row
 * whose stored address / phone / website no longer pass the evidence rules is
 * `409 CONTACT_EVIDENCE_REQUIRED`, and the server has already persisted the
 * row as `validation_failed`. The console says why in its own words and
 * reloads the rows, instead of leaving a stale "duplicate" offering a merge
 * that can never succeed.
 *
 * Fable F-05 (@af0c2ef) — driven through the default handlers: `row-14` is
 * the fixture's legacy row (address, no `contactEvidence`), and the mock
 * persists the refusal, so the reload below shows the failed row.
 */
const job = importJobs[0]!

beforeEach(() => resetMockDb())

/** The table row named, re-found each time so a reload is never read through a stale node. */
const rowOf = (name: string) =>
  within(screen.getByRole('table')).getByText(name).closest('tr') as HTMLElement

describe('row decision refused for contact evidence', () => {
  it('explains the refusal, reloads the rows, and shows the row failed in place', async () => {
    signInAs('ops_admin')
    let rowReads = 0
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
    expect(within(rowOf('Chào Bạn Cafe')).getByText('Trùng lặp')).toBeInTheDocument()
    const before = rowReads
    await user.click(within(rowOf('Chào Bạn Cafe')).getByRole('button', { name: 'Gộp' }))

    expect(await screen.findByText(/chưa đủ nguồn theo quy định hiện hành/)).toBeInTheDocument()
    await waitFor(() => expect(rowReads).toBeGreaterThan(before))
    // The reloaded row is what the server persisted: failed on its address
    // evidence, with the column codes an operator quotes, and no merge on offer.
    await waitFor(() => {
      const row = rowOf('Chào Bạn Cafe')
      expect(within(row).getByText('Không hợp lệ')).toBeInTheDocument()
      expect(within(row).getAllByText('ADDRESS_EVIDENCE_REQUIRED')).toHaveLength(3)
      expect(within(row).queryByRole('button', { name: 'Gộp' })).toBeNull()
    })
    server.events.removeAllListeners()
  })
})
