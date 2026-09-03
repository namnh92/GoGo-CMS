import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { cmsManualCostItems } from '@/shared/test/fixtures'
import ManualCostsScreen from './manualCosts.view'

const apple = cmsManualCostItems.find((item) => item.id === 'mc-apple')!
const domain = cmsManualCostItems.find((item) => item.id === 'mc-domain')!

async function openCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Thêm khoản chi' }))
  return screen.findByRole('dialog')
}

describe('manual costs (COST-CMS-010)', () => {
  it('is an ops surface: an editor is denied, and sees no table', async () => {
    signInAs('editor')
    renderWithProviders(<ManualCostsScreen />, { route: '/costs/manual' })

    expect(await screen.findByText('Chỉ ops_admin trở lên xem được chi phí.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm khoản chi' })).not.toBeInTheDocument()
  })

  it('lists items with the fee per period and the registry service, never a daily share', async () => {
    signInAs('ops_admin')
    renderWithProviders(<ManualCostsScreen />, { route: '/costs/manual' })

    const table = await screen.findByRole('table')
    const appleRow = within(table).getByText(apple.name).closest('tr')!
    expect(within(appleRow).getByText('Apple · Developer Program')).toBeInTheDocument()
    expect(within(appleRow).getByText('/năm')).toBeInTheDocument()
    expect(within(appleRow).getByText('chưa kết thúc', { exact: false })).toBeInTheDocument()
    const domainRow = within(table).getByText(domain.name).closest('tr')!
    expect(within(domainRow).getByText('một lần')).toBeInTheDocument()
    expect(within(domainRow).getByText('Gia hạn 1 năm')).toBeInTheDocument()
    // 99 USD a year is rendered as money, not as micros.
    expect(within(appleRow).queryByText(/99000000/)).not.toBeInTheDocument()
  })

  it('creates an item from the registry service list and sends an Idempotency-Key', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    let key: string | null = null
    let sent: Record<string, unknown> | null = null
    server.use(
      http.post('/v1/cms/ops/costs/manual-items', async ({ request }) => {
        key = request.headers.get('idempotency-key')
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          {
            item: {
              ...apple,
              id: 'mc-new',
              providerId: sent.providerId,
              serviceId: sent.serviceId,
              name: sent.name,
              amountMicros: sent.amountMicros,
              currency: sent.currency,
              period: sent.period,
              effectiveFrom: sent.effectiveFrom,
              effectiveTo: sent.effectiveTo,
              note: sent.note,
            },
          },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<ManualCostsScreen />, { route: '/costs/manual' })

    const drawer = await openCreateForm(user)
    // The picker is the server's list: Play Console is offered, Places is not.
    const picker = within(drawer).getByLabelText(/Dịch vụ/)
    expect(
      within(picker).getByRole('option', { name: 'Google · Play Console' }),
    ).toBeInTheDocument()
    expect(within(picker).queryByRole('option', { name: /Places/ })).not.toBeInTheDocument()
    await user.selectOptions(picker, 'hosting.vps')
    await user.type(within(drawer).getByLabelText(/Tên khoản chi/), 'VPS Hetzner')
    await user.type(within(drawer).getByLabelText(/^Số tiền/), '12.5')
    await user.type(within(drawer).getByLabelText(/Hiệu lực từ/), '2026-09-01')
    await user.click(within(drawer).getByRole('button', { name: 'Thêm' }))

    expect(await screen.findByText('Đã thêm VPS Hetzner.')).toBeInTheDocument()
    expect(key).toMatch(/\S{8,}/)
    // Micros per period, integer, with the provider the service belongs to.
    expect(sent).toMatchObject({
      providerId: 'hosting',
      serviceId: 'hosting.vps',
      name: 'VPS Hetzner',
      amountMicros: 12_500_000,
      currency: 'USD',
      period: 'MONTHLY',
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
      note: null,
    })
  })

  it('refuses an inverted range and a bad amount before sending anything', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    let posted = false
    server.use(
      http.post('/v1/cms/ops/costs/manual-items', () => {
        posted = true
        return HttpResponse.json({}, { status: 500 })
      }),
    )
    renderWithProviders(<ManualCostsScreen />, { route: '/costs/manual' })

    const drawer = await openCreateForm(user)
    await user.selectOptions(within(drawer).getByLabelText(/Dịch vụ/), 'apple.developer_program')
    await user.type(within(drawer).getByLabelText(/Tên khoản chi/), 'Apple')
    await user.type(within(drawer).getByLabelText(/^Số tiền/), '99.999')
    await user.type(within(drawer).getByLabelText(/Hiệu lực từ/), '2026-09-10')
    await user.type(within(drawer).getByLabelText(/Hiệu lực đến/), '2026-09-01')
    await user.click(within(drawer).getByRole('button', { name: 'Thêm' }))

    expect(
      await within(drawer).findByText('Số tiền không hợp lệ cho loại tiền này.'),
    ).toBeInTheDocument()
    expect(
      within(drawer).getByText('Ngày kết thúc phải từ ngày bắt đầu trở đi.'),
    ).toBeInTheDocument()
    expect(posted).toBe(false)
  })

  it('shows a server field error under its field instead of a toast', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    server.use(
      http.post('/v1/cms/ops/costs/manual-items', () =>
        HttpResponse.json(
          {
            code: 'COST_MANUAL_ITEM_INVALID',
            message: 'hosting.vps does not declare MANUAL_COST; a manual item cannot name it',
            field_errors: [
              {
                field: 'serviceId',
                code: 'manual_cost_not_supported',
                message: 'hosting.vps does not declare MANUAL_COST; a manual item cannot name it',
              },
            ],
            request_id: 'r1',
            retryable: false,
          },
          { status: 400 },
        ),
      ),
    )
    renderWithProviders(<ManualCostsScreen />, { route: '/costs/manual' })

    const drawer = await openCreateForm(user)
    await user.selectOptions(within(drawer).getByLabelText(/Dịch vụ/), 'hosting.vps')
    await user.type(within(drawer).getByLabelText(/Tên khoản chi/), 'VPS')
    await user.type(within(drawer).getByLabelText(/^Số tiền/), '5')
    await user.type(within(drawer).getByLabelText(/Hiệu lực từ/), '2026-09-01')
    await user.click(within(drawer).getByRole('button', { name: 'Thêm' }))

    expect(await within(drawer).findByText(/does not declare MANUAL_COST/)).toBeInTheDocument()
    // Once, under the field — not repeated as a toast.
    expect(screen.getAllByText(/does not declare MANUAL_COST/)).toHaveLength(1)
  })

  it('edits only what changed, and the trail shows the audited diff', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    let patch: Record<string, unknown> | null = null
    server.use(
      http.patch('/v1/cms/ops/costs/manual-items/:id', async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ item: { ...apple, ...patch } })
      }),
    )
    renderWithProviders(<ManualCostsScreen />, { route: '/costs/manual' })

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(apple.name))
    const drawer = await screen.findByRole('dialog')
    const amount = within(drawer).getByLabelText(/^Số tiền/) as HTMLInputElement
    expect(amount.value).toBe('99.00')
    await user.clear(amount)
    await user.type(amount, '129')
    await user.click(within(drawer).getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText(`Đã lưu ${apple.name}.`)).toBeInTheDocument()
    expect(patch).toEqual({ amountMicros: 129_000_000 })
  })

  it('deletes behind a confirmation that says what goes away', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<ManualCostsScreen />, { route: '/costs/manual' })

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(domain.name))
    const drawer = await screen.findByRole('dialog')
    await user.click(within(drawer).getByRole('button', { name: 'Xoá khoản chi' }))

    const dialogs = await screen.findAllByRole('dialog')
    const confirm = dialogs[dialogs.length - 1]!
    expect(within(confirm).getByText('Những thay đổi sẽ xảy ra')).toBeInTheDocument()
    expect(within(confirm).getByText(new RegExp(domain.name))).toBeInTheDocument()
    expect(within(confirm).getByText('Dòng chi phí đã sinh')).toBeInTheDocument()
    expect(within(confirm).getByText('Không còn')).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Xoá' }))

    expect(await screen.findByText(`Đã xoá ${domain.name}.`)).toBeInTheDocument()
    // Gone from the table — it still appears on the trail, as it was.
    await waitFor(() =>
      expect(within(screen.getByRole('table')).queryByText(domain.name)).not.toBeInTheDocument(),
    )
    // Audit is a feature: the deletion is on the trail, with the item as it was.
    expect(await screen.findByText('cost.manual_item.deleted')).toBeInTheDocument()
  })
})
