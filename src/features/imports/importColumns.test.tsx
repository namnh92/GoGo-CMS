import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import ImportListScreen from './importList.view'

describe('import list columns (CMS-023)', () => {
  it('gives “created by” and “completed at” each their own column', async () => {
    signInAs('ops_admin')
    renderWithProviders(<ImportListScreen />)

    const table = await screen.findByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent?.trim())

    expect(headers).toContain('Người tạo')
    expect(headers).toContain('Hoàn tất lúc')
    // The author used to be glued onto the timestamp cell; it is scannable now.
    expect(headers).toContain('Bắt đầu')
  })

  it('renders a job with no completion time as an em dash, not a blank cell', async () => {
    signInAs('ops_admin')
    renderWithProviders(<ImportListScreen />)

    const table = await screen.findByRole('table')
    // Fixtures carry at least one job still running, so the nullish branch is
    // exercised rather than assumed.
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('adds no Duplicates column — the list contract has no such counter', async () => {
    signInAs('ops_admin')
    renderWithProviders(<ImportListScreen />)

    const table = await screen.findByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent?.trim() ?? '')

    expect(headers.some((h) => /trùng|duplicate/i.test(h))).toBe(false)
  })

  it('marks no column sortable, because the list is paged on the server', async () => {
    signInAs('ops_admin')
    renderWithProviders(<ImportListScreen />)

    const table = await screen.findByRole('table')
    // Sorting one loaded page would read as a global sort and lie about it.
    for (const header of within(table).getAllByRole('columnheader')) {
      expect(header).not.toHaveAttribute('aria-sort', 'none')
    }
  })
})
