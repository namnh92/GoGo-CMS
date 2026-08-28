import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import TaxonomyScreen from './taxonomy.view'

describe('TaxonomyScreen', () => {
  it('shows usage, which is what makes the never-delete rule checkable', async () => {
    signInAs('editor')
    renderWithProviders(<TaxonomyScreen />)

    expect(await screen.findByText('quiet_peaceful')).toBeInTheDocument()
    expect(screen.getByText('2.814')).toBeInTheDocument()
  })

  it('lists a switched-off key by default — this is where it gets switched back on', async () => {
    signInAs('editor')
    renderWithProviders(<TaxonomyScreen />)

    // Hiding it by default would make a deactivated key unreachable: the public
    // taxonomy endpoint never returns one.
    expect(await screen.findByText('chill_lounge')).toBeInTheDocument()
    expect(screen.getAllByText('Đang tắt').length).toBeGreaterThan(0)
  })

  it('filters down to active keys on request', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    await screen.findByText('chill_lounge')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'active')
    await waitFor(() => expect(screen.queryByText('chill_lounge')).not.toBeInTheDocument())
    expect(screen.getByText('quiet_peaceful')).toBeInTheDocument()
  })

  it('confirms deactivating a key that places still reference', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    await screen.findByText('quiet_peaceful')
    await user.click(screen.getByRole('switch', { name: /quiet_peaceful/ }))

    // 2814 places use it; the dialog says so instead of applying on a click.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/2\.814 địa điểm dùng/)
  })

  it('lets a moderator read the list without offering a write', async () => {
    // Reads are hierarchical (`@RequireRole('editor', 'ops_admin')` + rank), so
    // the screen opens; every control stays off because the write would 403.
    signInAs('moderator')
    renderWithProviders(<TaxonomyScreen />)

    expect(await screen.findByText('quiet_peaceful')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm khoá phân loại' })).toBeDisabled()
  })
})
