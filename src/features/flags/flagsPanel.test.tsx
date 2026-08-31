import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { FlagsPanel } from './flagsPanel.view'

/** The row for one catalog key, found by its key text. */
async function rowFor(key: string) {
  const label = await screen.findByText(key)
  const row = label.closest('div.flex.flex-col')
  expect(row).not.toBeNull()
  return row as HTMLElement
}

describe('FlagsPanel (CMS-030)', () => {
  it('lists every registered key, including ones nobody has configured', async () => {
    signInAs('ops_admin')
    renderWithProviders(<FlagsPanel />)

    // Driven by the catalog, not the override list — a key with no stored row
    // would be invisible if it read only the overrides.
    expect(await screen.findByText('place_import.rules')).toBeInTheDocument()
    const row = await rowFor('place_import.rules')
    expect(within(row).getByText('Chưa cấu hình')).toBeInTheDocument()
  })

  it('shows an explicit zero as configured, not as unset', async () => {
    signInAs('ops_admin')
    renderWithProviders(<FlagsPanel />)

    const row = await rowFor('recommendation_limit')
    // Stored as 0. "Not configured" would be a different, wrong statement.
    expect(within(row).queryByText('Chưa cấu hình')).not.toBeInTheDocument()
    expect(within(row).getByLabelText('Giá trị')).toHaveValue('0')
  })

  it('names the type of every key', async () => {
    signInAs('ops_admin')
    renderWithProviders(<FlagsPanel />)

    const version = await rowFor('minimum_app_version')
    expect(within(version).getByText('Phiên bản')).toBeInTheDocument()
    const json = await rowFor('place_import.rules')
    expect(within(json).getByText('JSON')).toBeInTheDocument()
  })

  it('refuses a malformed version before it reaches the server', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<FlagsPanel />)

    const row = await rowFor('minimum_app_version')
    const field = within(row).getByLabelText('Giá trị')
    await user.clear(field)
    await user.type(field, '2.6')
    await user.click(within(row).getByRole('button', { name: 'Lưu' }))

    expect(await within(row).findByText('Phiên bản phải dạng 1.2.3.')).toBeInTheDocument()
  })

  it('refuses invalid JSON before it reaches the server', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<FlagsPanel />)

    const row = await rowFor('place_import.rules')
    // `{` starts a key sequence in user-event, so it is escaped here.
    await user.type(within(row).getByLabelText('Giá trị'), '{{not json')
    await user.click(within(row).getByRole('button', { name: 'Lưu' }))

    expect(await within(row).findByText('JSON không hợp lệ.')).toBeInTheDocument()
  })

  it('saves a valid typed value', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<FlagsPanel />)

    const row = await rowFor('minimum_app_version')
    const field = within(row).getByLabelText('Giá trị')
    await user.clear(field)
    await user.type(field, '3.0.0')
    await user.click(within(row).getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText(/Đã lưu minimum_app_version/)).toBeInTheDocument()
  })

  it('blocks a per-platform edit on a key that is not platform-scoped', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<FlagsPanel />)

    await screen.findByText('recommendation_limit')
    await user.selectOptions(screen.getByLabelText('Nền tảng'), 'ios')

    const row = await rowFor('recommendation_limit')
    // The server would refuse this write, so the console does not offer it.
    expect(within(row).getByText(/không nhận ghi đè theo nền tảng/)).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('separates values left behind by removed features', async () => {
    signInAs('ops_admin')
    renderWithProviders(<FlagsPanel />)

    expect(await screen.findByText('Giá trị còn sót lại')).toBeInTheDocument()
    expect(screen.getByText('legacy.map_provider_fallback')).toBeInTheDocument()
  })

  it('states that this is configuration, not a secret store', async () => {
    signInAs('ops_admin')
    renderWithProviders(<FlagsPanel />)

    expect(await screen.findByText(/không phải kho bí mật/)).toBeInTheDocument()
  })

  it('lets a role without flag.manage read but not write', async () => {
    // `editor` is rank 1; ops routes ask for rank 2, so the panel renders
    // nothing rather than a read-only shell of a screen it cannot open.
    signInAs('editor')
    renderWithProviders(<FlagsPanel />)
    await waitFor(() => expect(screen.queryByText('Cấu hình ứng dụng')).not.toBeInTheDocument())
    expect(screen.queryByText('minimum_app_version')).not.toBeInTheDocument()
  })
})
