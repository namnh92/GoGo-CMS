import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { server } from '@/shared/test/server'
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
    // A reason is part of the confirmation (GoGo-BE#713 Q7).
    expect(within(dialog).getByRole('button', { name: 'Bật bảo trì' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/Lý do thay đổi/), 'Nâng cấp cơ sở dữ liệu')
    expect(within(dialog).getByRole('button', { name: 'Bật bảo trì' })).toBeEnabled()
  })

  it.each([
    ['a feature switch', 'feature_group_planning'],
    ['a version', 'minimum_app_version'],
    ['turning maintenance off', 'maintenance_mode'],
  ])('asks for a reason before writing %s, and sends it', async (_case, key) => {
    signInAs('ops_admin')
    const bodies: { key: string; body: unknown }[] = []
    server.use(
      http.put('/v1/cms/feature-flags/:key', async ({ request, params }) => {
        bodies.push({ key: String(params.key), body: await request.clone().json() })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<AppControlScreen />)

    if (key === 'feature_group_planning') {
      await user.click(await screen.findByRole('switch', { name: 'Bật ghi đè cho ' + key }))
    } else if (key === 'minimum_app_version') {
      const row = (await screen.findByText('Phiên bản tối thiểu')).closest('div')!.parentElement!
      const input = within(row).getByLabelText('Giá trị')
      await user.clear(input)
      await user.type(input, '2.0.0')
      await user.click(within(row).getByRole('button', { name: 'Lưu' }))
    } else {
      // Turn it on first (through its own confirmation), then back off.
      await user.click(await screen.findByRole('button', { name: 'Bật bảo trì' }))
      const on = await screen.findByRole('dialog')
      await user.type(within(on).getByLabelText(/Lý do thay đổi/), 'Bảo trì định kỳ')
      await user.click(within(on).getByRole('button', { name: 'Bật bảo trì' }))
      await user.click(await screen.findByRole('button', { name: 'Tắt bảo trì' }))
    }

    const dialog = await screen.findByRole('dialog', { name: `Đổi ${key}?` })
    const confirm = within(dialog).getByRole('button', { name: 'Lưu thay đổi' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/Lý do thay đổi/), 'Theo yêu cầu vận hành')
    await user.click(confirm)
    // Maintenance-off is the second write of its case, so two toasts can show.
    expect((await screen.findAllByText(new RegExp(`Đã lưu ${key}`))).length).toBeGreaterThan(0)
    expect(bodies.at(-1)).toMatchObject({
      key,
      body: { reason: 'Theo yêu cầu vận hành' },
    })
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
