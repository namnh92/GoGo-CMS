import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import type { AdminRole } from '@/shared/api/contracts'
import { roleCan } from '@/shared/auth/permissions'
import PlaceListScreen from '@/features/places/placeList.view'

const ROLES: AdminRole[] = ['editor', 'moderator', 'ops_admin', 'super_admin']

/**
 * SEC-001: break-glass is open to every active admin on purpose. Narrowing it
 * rebuilds the problem it exists to solve — everyone sharing one privileged
 * account, which collapses the audit trail into a single identity.
 */
describe('emergency takedown', () => {
  it('is offered to every staff role, not just the privileged ones', () => {
    for (const role of ROLES) expect(roleCan(role, 'emergency.takedown')).toBe(true)
  })

  it('is disabled on a place that is not published', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceListScreen />)
    await screen.findByText('Chào Bạn Cafe & Space')

    // `published → suspended` is the only transition the route accepts, so an
    // unpublished place must not offer the action at all.
    const published = screen.getAllByRole('button', { name: 'Gỡ khẩn cấp' })
    expect(published.length).toBeGreaterThan(0)
    for (const button of published) expect(button).toBeEnabled()

    const blocked = screen.getAllByRole('button', { name: /Chỉ áp dụng khi/ })
    expect(blocked.length).toBeGreaterThan(0)
    for (const button of blocked) expect(button).toBeDisabled()
  })

  it('refuses to submit until the reason meets the server floor', async () => {
    const user = userEvent.setup()
    signInAs('moderator')
    renderWithProviders(<PlaceListScreen />)
    await screen.findByText('Chào Bạn Cafe & Space')

    await user.click(screen.getAllByRole('button', { name: 'Gỡ khẩn cấp' })[0]!)
    const dialog = await screen.findByRole('dialog')

    const confirm = screen.getByRole('button', { name: 'Gỡ ngay' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText(/Lý do gỡ/), 'quá ngắn')
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText(/Lý do gỡ/), ' nhưng bây giờ thì đủ dài rồi')
    await waitFor(() => expect(confirm).toBeEnabled())

    // The dialog states the transition instead of asking "are you sure?".
    expect(dialog).toHaveTextContent('published')
    expect(dialog).toHaveTextContent('suspended')
    expect(dialog).toHaveTextContent(/ghi audit/)
  })

  it('takes the place down and reflects the new status', async () => {
    const user = userEvent.setup()
    signInAs('ops_admin')
    renderWithProviders(<PlaceListScreen />)
    await screen.findByText('Chào Bạn Cafe & Space')

    await user.click(screen.getAllByRole('button', { name: 'Gỡ khẩn cấp' })[0]!)
    await user.type(
      screen.getByLabelText(/Lý do gỡ/),
      'Địa điểm bị báo cáo lừa đảo, gỡ tạm trong lúc xác minh.',
    )
    await user.click(screen.getByRole('button', { name: 'Gỡ ngay' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByText('Tạm ngưng').length).toBeGreaterThan(1))
  })
})
