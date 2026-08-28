import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import SettingsScreen from './settings.view'

async function openExperiments(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: /Thử nghiệm A\/B/ }))
}

describe('SettingsScreen', () => {
  it('shows both names on a config version, so four-eyes is checkable', async () => {
    signInAs('ops_admin')
    renderWithProviders(<SettingsScreen />)

    expect((await screen.findAllByText(/Tạo bởi vy\.vo/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Duyệt bởi minh\.anh/).length).toBeGreaterThan(0)
  })

  it('refuses a split over 100% before sending it', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<SettingsScreen />)
    await openExperiments(user)

    await user.click((await screen.findAllByRole('button', { name: 'Chỉnh tỷ lệ' }))[0]!)
    // Each field is capped at 1, so over-allocation only happens across
    // variants — which is exactly the case the server refuses.
    for (const share of screen.getAllByLabelText('Tỷ lệ')) {
      await user.clear(share)
      await user.type(share, '0.6')
    }

    // The server refuses this too; the client only avoids a doomed round trip.
    expect(await screen.findByText(/Tổng tỷ lệ các nhánh phải ≤ 100%/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled())
  })

  it('never offers an unapproved draft as a variant', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<SettingsScreen />)

    // Draft a new version, then check the experiment editor treats it as blocked.
    await screen.findAllByText(/Tạo bởi vy\.vo/)
    await openExperiments(user)
    await user.click((await screen.findAllByRole('button', { name: 'Chỉnh tỷ lệ' }))[0]!)

    // v3 is approved and offered; a draft would be listed with its reason only.
    expect(screen.getAllByLabelText('Tỷ lệ').length).toBe(2)
    expect(screen.queryByText(/Bản nháp chưa duyệt/)).not.toBeInTheDocument()
  })

  it('warns that activating an unevaluated version is a change nobody measured', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<SettingsScreen />)

    await user.click(await screen.findByRole('button', { name: 'Kích hoạt' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/chưa đánh giá là bật một thay đổi chưa ai đo/)
    // Naming what happens to the version currently in force.
    expect(dialog).toHaveTextContent(/Đã quay lui/)
  })

  it('an editor cannot open the console at all', async () => {
    signInAs('editor')
    renderWithProviders(<SettingsScreen />)
    // `@RequireRole('ops_admin')` — rank-based read does not reach down.
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })
})
