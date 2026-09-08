import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { importJobs, importRows } from '@/shared/test/fixtures'
import ImportWizardScreen from './importWizard.view'
import ImportJobScreen from './jobDetail.view'

/**
 * ADM-107 — what an import says about administrative units.
 *
 * The mapping step used to offer "district" as something to map, which told an
 * operator that GoGo files places under districts — a tier dissolved on
 * 2025-07-01. And the review screen, the last place where an operator can still
 * act on a row, said nothing at all about which commune the row would land in.
 */

const JOB = importJobs[0]!
const CSV = ['name,category,city,district', 'Lacàph,cafe,Ho Chi Minh,Quận 1'].join('\n')

async function openMappingStep() {
  signInAs('ops_admin')
  const user = userEvent.setup()
  renderWithProviders(<ImportWizardScreen />)
  const file = new File([CSV], 'hcm.csv', { type: 'text/csv' })
  await user.upload(screen.getByLabelText(/chọn tệp|file/i), file)
  await user.click(await screen.findByRole('button', { name: /tiếp tục/i }))
  return user
}

function openJob() {
  signInAs('ops_admin')
  return renderWithProviders(
    <Routes>
      {/* `useParams` only reports `jobId` under a matching route. */}
      <Route path="/imports/:jobId" element={<ImportJobScreen />} />
    </Routes>,
    { route: `/imports/${JOB.id}` },
  )
}

/** The row cell, found by the row's own number. */
async function cellFor(rowNumber: number) {
  const heading = await screen.findByText(`#${rowNumber}`)
  return heading.closest('tr')!
}

describe('the mapping step', () => {
  it('no longer offers district as something to map', async () => {
    await openMappingStep()
    const select = await screen.findByLabelText('name')
    const values = within(select)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)

    expect(values).not.toContain('district')
    // Still offered, because it is still useful: as a search hint.
    expect(values).toContain('city')
  })

  it('labels city as a search hint rather than as an administrative level', async () => {
    await openMappingStep()
    const select = await screen.findByLabelText('name')
    const cityOption = within(select).getByRole('option', { name: /gợi ý tìm kiếm/ })
    // The stored value stays the canonical wire name the server receives; only
    // what an operator reads changes, because reading "city" next to a list of
    // address fields is what made it look like the address.
    expect((cityOption as HTMLOptionElement).value).toBe('city')
    expect(cityOption).toHaveTextContent(/không phải cấp hành chính/)
  })

  it('says why the district choice is gone, where an operator would look for it', async () => {
    await openMappingStep()
    expect(screen.getByText(/đã giải thể từ 01\/07\/2025/)).toBeInTheDocument()
    // And that a legacy sheet's column is not rejected — it is still read.
    expect(screen.getByText(/vẫn được nhận/)).toBeInTheDocument()
  })

  it('calls the default city a search hint rather than an administrative level', async () => {
    signInAs('ops_admin')
    renderWithProviders(<ImportWizardScreen />)
    expect(
      await screen.findByText(/Đơn vị hành chính của địa điểm do toạ độ quyết định/),
    ).toBeInTheDocument()
  })
})

describe('the review screen', () => {
  it('shows the commune a matched row will land in, by name and code', async () => {
    openJob()
    const row = await cellFor(13)
    expect(within(row).getByText('Phường Bến Nghé (26734)')).toBeInTheDocument()
    expect(within(row).getByText('Thành phố Hồ Chí Minh (79)')).toBeInTheDocument()
  })

  it('never calls an automatic match verified or published', async () => {
    openJob()
    const row = await cellFor(13)
    // The claim an import screen is most tempted to make. `AUTO_MATCHED` left
    // to speak for itself reads as approval; this says what it actually is.
    expect(within(row).getByText(/chưa xác minh/)).toBeInTheDocument()
    // And the reason comes from the server's approval policy, in its own words.
    expect(within(row).getByText(/chưa được người thật xác nhận/)).toBeInTheDocument()
  })

  it('does not call a row blocked when the policy says it is not', async () => {
    // Row 14 matched a place a reviewer already verified — the single bulk row
    // that may legitimately publish. A screen deriving "a mapping exists, so it
    // blocks" would contradict the publish step it is describing.
    openJob()
    const row = await cellFor(14)
    expect(within(row).getByText('Đã được người duyệt xác minh')).toBeInTheDocument()
    expect(within(row).getByText('Ánh xạ hành chính không chặn việc đăng.')).toBeInTheDocument()
    expect(within(row).queryByText(/Chưa đủ điều kiện đăng/)).not.toBeInTheDocument()
  })

  it('tells the outcomes apart in words, not in shades of one badge', async () => {
    openJob()
    // Needs a person: the evidence disagreed with itself.
    expect(within(await cellFor(18)).getByText('Cần người xem')).toBeInTheDocument()
    // Nothing placed it — which is not a review task.
    expect(within(await cellFor(17)).getByText('Không xác định được')).toBeInTheDocument()
    // Not resolved against the provider yet: "not yet", not "nowhere".
    expect(within(await cellFor(12)).getByText('Chưa phân giải')).toBeInTheDocument()
    expect(within(await cellFor(16)).getByText('Chưa phân giải')).toBeInTheDocument()
  })

  it('shows no district anywhere on the row', async () => {
    openJob()
    const row = await cellFor(13)
    await waitFor(() => expect(within(row).queryByText(/Quận\/Huyện/)).not.toBeInTheDocument())
    expect(screen.queryByText('Quận/Huyện')).not.toBeInTheDocument()
  })

  it('reads the identity off the row rather than inventing one', async () => {
    // The fixture is the contract's shape; a screen that derived a commune from
    // the sheet's own text would be doing the resolver's job with worse data.
    const ready = importRows[JOB.id]!.find((row) => row.rowNumber === 13)!
    expect(ready.administrative?.communeCode).toBe('26734')
    openJob()
    const row = await cellFor(13)
    expect(
      within(row).getByText(new RegExp(ready.administrative!.communeCode!)),
    ).toBeInTheDocument()
  })
})
