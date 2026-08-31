import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import AppControlScreen from './appControl.view'

describe('app control (CMS-037)', () => {
  it('asks for confirmation naming the scope before enabling maintenance', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<AppControlScreen />)

    await user.click(await screen.findByRole('button', { name: 'Bật bảo trì' }))
    const dialog = await screen.findByRole('dialog')
    // Not a bare "are you sure": the dialog names environment, platform and
    // the exact key about to flip.
    expect(within(dialog).getByText('maintenance_mode')).toBeInTheDocument()
    expect(within(dialog).getByText(/màn bảo trì/)).toBeInTheDocument()
  })

  it('refuses a version that is not semver before sending it', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<AppControlScreen />)

    const row = (await screen.findByText('Phiên bản tối thiểu')).closest('div')!.parentElement!
    const input = within(row).getByLabelText('Giá trị')
    await user.clear(input)
    await user.type(input, 'v1.2')
    await user.click(within(row).getByRole('button', { name: 'Lưu' }))

    expect(await within(row).findByText(/1\.2\.3/)).toBeInTheDocument()
  })

  it('lists only feature_* switches the server catalog declares', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AppControlScreen />)

    expect(await screen.findByText('feature_group_planning')).toBeInTheDocument()
    expect(screen.getByText('feature_ai_recommendation')).toBeInTheDocument()
    // Non-feature keys stay in the generic flags panel, not here.
    expect(screen.queryByText('recommendation_limit')).not.toBeInTheDocument()
    expect(screen.queryByText('place_import.rules')).not.toBeInTheDocument()
  })

  it('renders read-only for a role that cannot manage flags', async () => {
    signInAs('moderator')
    renderWithProviders(<AppControlScreen />)

    // Moderator is rank 1: ops reads are above it, so the screen denies.
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })
})
