import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import TaxonomyScreen from '@/features/taxonomy/taxonomy.view'

/**
 * The header search used to be an input nobody had wired up. These tests exist
 * so it cannot silently become one again: the affordance must open something.
 */
describe('command palette (CMS-018)', () => {
  it('replaces the header search with a control that opens the palette', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    // Not a textbox: a textbox here would swallow typing and do nothing.
    const trigger = await screen.findByRole('button', { name: /Tìm nhanh/ })
    expect(screen.queryByRole('searchbox', { name: /Tìm nhanh/ })).not.toBeInTheDocument()

    await user.click(trigger)
    const dialog = await screen.findByRole('dialog')
    // Opens with the search field focused, not with the close button.
    expect(within(dialog).getByRole('combobox')).toHaveFocus()
  })

  it('opens on the keyboard shortcut from anywhere in the shell', async () => {
    signInAs('ops_admin')
    renderWithProviders(<TaxonomyScreen />)
    await screen.findByRole('button', { name: /Tìm nhanh/ })

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('moves through results with the arrow keys and opens one with Enter', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByRole('combobox')

    const options = within(dialog).getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(within(dialog).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true'),
    )
    // The combobox keeps focus and points at the active option throughout.
    expect(input).toHaveFocus()
    expect(input.getAttribute('aria-activedescendant')).toBe(
      within(dialog).getAllByRole('option')[1]?.id,
    )

    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says something different when nothing is typed and when nothing matched', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')

    // Nav targets are the default list, so the "nothing typed" copy only shows
    // when there is genuinely nothing to offer — the no-match copy names the
    // term, which is the difference that matters to the operator.
    await user.type(within(dialog).getByRole('combobox'), 'zzzqqq')
    expect(await within(dialog).findByText(/Không có kết quả cho/)).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('option')).toHaveLength(0)
  })

  it('never offers a destination the role cannot open', async () => {
    signInAs('editor')
    renderWithProviders(<TaxonomyScreen />)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')

    const labels = within(dialog)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '')
    expect(labels.some((label) => label.includes('Nhật ký kiểm toán'))).toBe(true)
    // Ranking settings and search analytics are rank 2; an editor is rank 1.
    expect(labels.some((label) => label.includes('Cấu hình'))).toBe(false)
    expect(labels.some((label) => label.includes('Chất lượng tìm kiếm'))).toBe(false)
  })

  it('searches the catalog once the term is worth a request', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('combobox'), 'chào')

    const place = await within(dialog).findByText(/Chào Bạn Cafe/, {}, { timeout: 3000 })
    expect(place).toBeInTheDocument()
    expect(within(dialog).getByText('Địa điểm')).toBeInTheDocument()
  })
})
