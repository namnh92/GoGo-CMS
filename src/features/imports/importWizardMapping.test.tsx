import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import ImportWizardScreen from './importWizard.view'
import { MAPPABLE_FIELDS } from '@/shared/api/contracts-import'

/**
 * CMS-031 — the mapping step sends the server's own vocabulary, and says what
 * it is about to drop before the import runs rather than after.
 */

const CSV = ['name,category,tags,notes,city', 'Lacàph,cafe,coffee,Specialty,Ho Chi Minh'].join('\n')

async function openMapping(csv: string, filename: string) {
  signInAs('ops_admin')
  const user = userEvent.setup()
  renderWithProviders(<ImportWizardScreen />)

  const file = new File([csv], filename, { type: 'text/csv' })
  await user.upload(screen.getByLabelText(/chọn tệp|file/i), file)
  await user.click(await screen.findByRole('button', { name: /tiếp tục/i }))
  return user
}

async function openMappingStep() {
  return openMapping(CSV, 'hcm.csv')
}

describe('import wizard mapping step', () => {
  it('offers the canonical wire values, not a private vocabulary', async () => {
    await openMappingStep()

    const select = await screen.findByLabelText('name')
    const values = within(select)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
      .filter(Boolean)

    expect(values).toEqual([...MAPPABLE_FIELDS])
    // The field the server still has no column for is gone…
    expect(values).not.toContain('address')
    // …as is the camelCase spelling the server used to discard…
    expect(values).not.toContain('googleMapsUrl')
    expect(values).toContain('google_maps_url')
    // …and the legacy free-text columns, which read old sheets and should not
    // be chosen for a new one (PI-CMS-009).
    for (const legacy of ['district', 'category_raw', 'price_raw', 'audiences_raw', 'vibes_raw']) {
      expect(values, legacy).not.toContain(legacy)
    }
    // `phone` and `website` are offered now: PI-BE-025 gave them columns, so a
    // header mapped onto either is stored rather than dropped.
    expect(values).toContain('phone')
    expect(values).toContain('website')
    expect(values).toContain('google_place_id')
  })

  it('does not offer source_row_id: the server derives it', async () => {
    await openMappingStep()

    const select = await screen.findByLabelText('name')
    const values = within(select)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)

    expect(values).not.toContain('source_row_id')
    // And it says so, so a missing column does not read as an oversight.
    expect(screen.getByText(/suy ra định danh từ vị trí dòng/i)).toBeInTheDocument()
  })

  it('names the columns whose data is about to be dropped', async () => {
    await openMappingStep()

    // `tags` has no canonical home yet and `notes` maps to `note`, so only
    // `tags` should be reported as dropped.
    const dropped = await screen.findByText(/cột chưa ánh xạ, dữ liệu sẽ bị bỏ qua/i)
    expect(dropped).toHaveTextContent('tags')
    expect(dropped).not.toHaveTextContent('notes')
  })

  it('does not block on a file that has every genuinely required column', async () => {
    const user = await openMappingStep()

    // `category` is mapped, so nothing blocks — the old wizard blocked here on
    // `address`, a field the server has never accepted.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const next = screen.getByRole('button', { name: /tiếp tục/i })
    expect(next).not.toBeDisabled()
    await user.click(next)
    // The review step is the only one offering to create the job.
    expect(await screen.findByRole('button', { name: /tạo phiên nhập/i })).toBeInTheDocument()
  })

  it('blocks before the import when a required column is genuinely absent', async () => {
    // Nothing here identifies a place — no link, no Place ID, no query, no
    // name — so the server cannot derive a category and the operator must.
    await openMapping('city,note\nHà Nội,ghi chú', 'nocat.csv')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('category')
    expect(screen.getByRole('button', { name: /tiếp tục/i })).toBeDisabled()
  })

  /**
   * PI-CMS-032 — the wizard used to demand a `category` column from every file,
   * including the two shapes the published template teaches. An operator who
   * followed the template hit a dead end, and the way out was an empty column.
   */
  it('lets a link-only file through without a category column', async () => {
    await openMapping(
      'name,google_maps_url\nAeon MaxValu,https://www.google.com/maps/place/Aeon+MaxValu/@21.02,105.79,17z',
      'link-only.csv',
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tiếp tục/i })).not.toBeDisabled()
    // And it says why the column is missing rather than leaving it unexplained.
    expect(screen.getByText(/suy category từ loại hình google/i)).toBeInTheDocument()
  })

  it('lets a Place-ID-only file through without a category column', async () => {
    await openMapping('google_place_id\nChIJNz9FhWqpNTEROakgr0rjnAM', 'place-id-only.csv')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tiếp tục/i })).not.toBeDisabled()
    expect(screen.getByText(/suy category từ loại hình google/i)).toBeInTheDocument()
  })

  it('stops marking category required once the file identifies the place', async () => {
    await openMapping('name,google_place_id\nQuán A,ChIJNz9FhWqpNTEROakgr0rjnAM', 'both.csv')

    const select = await screen.findByLabelText('name')
    const category = within(select)
      .getAllByRole('option')
      .find((option) => (option as HTMLOptionElement).value === 'category')
    // The asterisk is a promise about what the wizard will refuse; it must not
    // outlive the refusal.
    expect(category?.textContent).not.toContain('*')
  })

  it('keeps quiet about derivation when the operator mapped a category column', async () => {
    // A mapped column is the operator's answer, even when a cell is blank — the
    // note is about a missing column, so it stays quiet here.
    await openMapping('name,category\nQuán A,cafe', 'withcat.csv')

    expect(screen.queryByText(/suy category từ loại hình google/i)).not.toBeInTheDocument()
  })
})
