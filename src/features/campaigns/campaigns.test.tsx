import { describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsCampaigns } from '@/shared/test/fixtures'
import CampaignListScreen from './campaignList.view'
import CampaignDetailScreen from './campaignDetail.view'

const draft = cmsCampaigns.find((campaign) => campaign.id === 'cp-cuoi-tuan')!
const scheduled = cmsCampaigns.find((campaign) => campaign.id === 'cp-le-2-9')!
const sending = cmsCampaigns.find((campaign) => campaign.id === 'cp-dang-gui')!
const sent = cmsCampaigns.find((campaign) => campaign.id === 'cp-da-gui')!
const failed = cmsCampaigns.find((campaign) => campaign.id === 'cp-loi')!
const reachedNobody = cmsCampaigns.find((campaign) => campaign.id === 'cp-khong-toi-ai')!
const drafts = cmsCampaigns.filter((campaign) => campaign.status === 'draft').length

const PLACE_ID = '0b6f3c2e-8a41-4d9f-9e27-5c1a7d3b6f80'

/** A campaign fixture, served with the given destination instead of its own. */
function serveAt(
  base: (typeof cmsCampaigns)[number],
  destinationType: string,
  destinationValue: string | null,
) {
  server.use(
    http.get(`*/cms/campaigns/${base.id}`, () =>
      HttpResponse.json({ ...base, destinationType, destinationValue }),
    ),
  )
}
const serveDraftAt = (type: string, value: string | null) => serveAt(draft, type, value)

function Routed() {
  return (
    <Routes>
      <Route path="/campaigns" element={<CampaignListScreen />} />
      <Route path="/campaigns/:id" element={<CampaignDetailScreen />} />
    </Routes>
  )
}

describe('campaign list (CMS-029)', () => {
  it('shows the filtered total, not the page length', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/campaigns' })

    await screen.findByRole('table')
    expect(
      screen.getByText(
        `Trang này ${cmsCampaigns.length} · tổng ${cmsCampaigns.length} khớp bộ lọc`,
      ),
    ).toBeInTheDocument()
  })

  it('pushes the status filter to the server', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/campaigns' })

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'draft')
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`tổng ${drafts} khớp bộ lọc`))).toBeInTheDocument(),
    )
  })

  it('says "not sent" rather than zero for a campaign that has not run', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/campaigns' })

    const table = await screen.findByRole('table')
    const row = within(table).getByText(draft.name).closest('tr')!
    // A zero here would read as "sent to nobody" rather than "not sent yet".
    expect(within(row).getByText('Chưa gửi')).toBeInTheDocument()
  })

  it('offers only the audiences the server can resolve', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/campaigns' })

    await user.click(await screen.findByRole('button', { name: 'Tạo chiến dịch' }))
    const drawer = await screen.findByRole('dialog')
    const audience = within(drawer).getByLabelText(/Đối tượng/) as HTMLSelectElement

    // city / app_version / custom_segment from the mockup are absent by design.
    expect(Array.from(audience.options).map((option) => option.value)).toEqual([
      'all',
      'couple',
      'group',
      'platform',
    ])
  })

  it('asks for a platform only when the audience is platform-scoped', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/campaigns' })

    await user.click(await screen.findByRole('button', { name: 'Tạo chiến dịch' }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).queryByLabelText('Nền tảng')).not.toBeInTheDocument()

    await user.selectOptions(within(drawer).getByLabelText(/Đối tượng/), 'platform')
    expect(within(drawer).getByLabelText('Nền tảng')).toBeInTheDocument()
  })

  it('hides campaigns from a role below ops_admin', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: '/campaigns' })

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })
})

describe('campaign delivery (CMS-029)', () => {
  it('never offers a cancel once the worker has started sending', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${sending.id}` })

    expect(await screen.findByText(/Worker đang gửi/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Huỷ lịch gửi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi ngay' })).not.toBeInTheDocument()
  })

  it('offers a cancel while the campaign is only scheduled', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${scheduled.id}` })

    expect(await screen.findByRole('button', { name: 'Huỷ lịch gửi' })).toBeInTheDocument()
  })

  it('locks editing for anything that has been sent', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${sent.id}` })

    expect(await screen.findByText(/chỉ sửa được khi ở trạng thái nháp/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tên chiến dịch/)).toBeDisabled()
  })

  it('shows the recorded provider error on a failed campaign', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${failed.id}` })

    expect(await screen.findByText(/OneSignal 401/)).toBeInTheDocument()
  })

  it('shows the delivery counts on a campaign that reached nobody', async () => {
    // #191 / GoGo-BE#516. These two numbers are the only thing explaining a
    // failed dispatch, and the console used to render them as "Chưa gửi"
    // because it gated on `status === 'sent' | 'sending'`.
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${reachedNobody.id}` })

    // Scoped to the delivery card, and read through each label: "Gửi lỗi" is
    // also the status badge's text, and a bare `3` matches half the page.
    // `Provider đã nhận` is unique on the page; its label sits in a pair div
    // inside the facts grid, so two hops up is the grid itself.
    const grid = (await screen.findByText('Provider đã nhận')).parentElement!.parentElement!
    const fact = (label: string) =>
      within(grid).getByText(label).parentElement?.textContent?.replace(label, '').trim()

    expect(fact('Số người nhận')).toBe('3')
    expect(fact('Provider đã nhận')).toBe('0')
    expect(fact('Gửi lỗi')).toBe('3')
    expect(within(grid).queryByText('Chưa gửi')).not.toBeInTheDocument()
  })

  it('explains a no-acceptance failure in words, not as an error code', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${reachedNobody.id}` })

    expect(await screen.findByText(/Không thiết bị nào nhận được/)).toBeInTheDocument()
    // The raw code belongs in a log, not in front of an operator.
    expect(screen.queryByText(/NO_SUBSCRIPTION_ACCEPTED/)).not.toBeInTheDocument()
  })

  it('says the recipient count is resolved at send time rather than showing zero', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    expect(await screen.findByText('Số người nhận')).toBeInTheDocument()
    expect(screen.getAllByText('Tính lại lúc gửi').length).toBeGreaterThan(0)
  })

  it('confirms a send by naming audience, destination and time', async () => {
    signInAs('ops_admin')
    serveDraftAt('place', PLACE_ID)
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await user.click(await screen.findByRole('button', { name: 'Gửi ngay' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/không thu hồi được/)).toBeInTheDocument()
    expect(within(dialog).getByText('Tất cả người dùng')).toBeInTheDocument()
    expect(within(dialog).getByText(`Địa điểm · ${PLACE_ID}`)).toBeInTheDocument()
  })

  it('refuses a destination id that is not a UUID before sending it', async () => {
    signInAs('ops_admin')
    serveDraftAt('place', PLACE_ID)
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    const value = (await screen.findByLabelText('Điểm đến')) as HTMLInputElement
    await user.clear(value)
    await user.type(value, 'rec-cuoi-tuan')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Điểm đến phải là ID dạng UUID.')).toBeInTheDocument()
  })

  it('estimates the audience without sending anything', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    expect(await screen.findByText(/Ước tính .* người nhận/)).toBeInTheDocument()
    // The estimate is a read; the campaign is still a draft afterwards.
    expect(screen.getByText('Nháp')).toBeInTheDocument()
  })
})

/*
 * BE-CMS-M3 — a saved campaign image shows itself.
 *
 * `CmsCampaign` carried only `imageKey`, so the detail screen had nothing to
 * render and set `readUrl: null` unconditionally. The console was right not to
 * fabricate a storage URL; the gap was the contract, which now returns the
 * same `imageUrl` the push provider is given.
 */
describe('campaign image (BE-CMS-M3)', () => {
  // The preview is decorative — the key beside it is the label — so it carries
  // an empty alt and is queried as an element rather than by role.
  const preview = (container: HTMLElement) => container.querySelector('img')

  it('previews the saved image from the contract, not a guessed URL', async () => {
    signInAs('ops_admin')
    const { container } = renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    expect(await screen.findByTitle(draft.imageKey!)).toBeInTheDocument()
    expect(preview(container)).toHaveAttribute('src', draft.imageUrl)
  })

  it('says so when the saved image will not load', async () => {
    signInAs('ops_admin')
    const { container } = renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await screen.findByTitle(draft.imageKey!)
    // The field and the phone mock both show it, and both have to give up.
    for (const img of [...container.querySelectorAll('img')]) fireEvent.error(img)

    expect(await screen.findAllByText('Không tải được ảnh')).toHaveLength(2)
    expect(preview(container)).toBeNull()
  })

  /*
   * The preview claims to show what lands on a phone. Once the image actually
   * reaches the device (`big_picture` / `ios_attachments`), a preview that
   * showed only title and body was describing the notification this campaign
   * used to send.
   */
  it('shows the image inside the notification preview, not only in the field', async () => {
    signInAs('ops_admin')
    const { container } = renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await screen.findByTitle(draft.imageKey!)
    const shown = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    // One in the upload field, one inside the phone mock.
    expect(shown.filter((src) => src === draft.imageUrl)).toHaveLength(2)
  })

  it('shows a text-only campaign as having no image, not as a failed one', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/campaigns/${scheduled.id}` })

    expect(await screen.findByText('Chưa có ảnh')).toBeInTheDocument()
    expect(screen.queryByText('Không tải được ảnh')).not.toBeInTheDocument()
  })
})

/*
 * GoGo-BE#604, owner option (c). The app opens `place` and `saved` only (and
 * Home by default); a push pointing at a recommendation, a plan template or an
 * external link lands on Home with nothing said. The console keeps the three
 * in the list — disabled, with the reason in words — and GoGo-BE refuses them
 * with 422 INVALID_DESTINATION.
 */
describe('destinations the app cannot open (GoGo-BE#604)', () => {
  const destinationSelect = async () =>
    (await screen.findByLabelText('Loại điểm đến')) as HTMLSelectElement
  const option = (select: HTMLSelectElement, value: string) =>
    Array.from(select.options).find((item) => item.value === value)!
  /** CMS#222 F-02: the refusal is about the type, so it sits on the type select. */
  const expectTypeRefused = async () => {
    const select = screen.getByLabelText('Loại điểm đến')
    await waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'))
    expect(select).toHaveAccessibleDescription(
      expect.stringContaining('App chưa mở được đích này.'),
    )
    expect(screen.getByLabelText('Điểm đến')).not.toHaveAttribute('aria-invalid')
  }
  const refusal = (status: number) =>
    HttpResponse.json(
      {
        code: 'INVALID_DESTINATION',
        message: 'That destination cannot be used',
        field_errors: [],
        request_id: `mock-invalid-destination-${status}`,
        retryable: false,
      },
      { status },
    )

  it('lists the three as disabled, each with the reason in words', async () => {
    signInAs('ops_admin')
    serveDraftAt('home', null)
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    const select = await destinationSelect()
    for (const [value, label] of [
      ['recommendation', 'Gợi ý biên tập'],
      ['plan_template', 'Mẫu lịch trình'],
      ['external_url', 'Link ngoài'],
    ] as const) {
      const item = option(select, value)
      expect(item.disabled).toBe(true)
      // The reason is text, not a grey colour alone.
      expect(item.textContent).toBe(`${label} — App chưa mở được đích này`)
    }
    for (const value of ['home', 'place', 'saved']) {
      expect(option(select, value).disabled).toBe(false)
    }
  })

  it('shows an existing campaign as it is, warns it cannot be sent, and blocks the send', async () => {
    signInAs('ops_admin')
    // The fixture draft already points at a recommendation.
    expect(draft.destinationType).toBe('recommendation')
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    const select = await destinationSelect()
    // Shown as stored, not silently swapped to something else.
    expect(select.value).toBe('recommendation')
    expect(
      screen.getByText(/App chưa mở được đích "Gợi ý biên tập". Hãy đổi sang/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Đang khoá gửi và gửi thử/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi ngay' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Gửi thử cho tôi' })).toBeDisabled()
  })

  it('lets the editor switch an existing campaign to an allowed destination', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    let sent: Record<string, unknown> | undefined
    server.use(
      http.patch(`*/cms/campaigns/${draft.id}`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...draft, ...sent })
      }),
    )
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await user.selectOptions(await destinationSelect(), 'home')
    expect(screen.queryByText(/Hãy đổi sang Trang chủ/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(sent?.destinationType).toBe('home'))
  })

  it('refuses to save an unopenable destination before the round-trip', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    let patched = false
    server.use(
      http.patch(`*/cms/campaigns/${draft.id}`, () => {
        patched = true
        return HttpResponse.json(draft)
      }),
    )
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await destinationSelect()
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await expectTypeRefused()
    expect(patched).toBe(false)
  })

  it('maps a 422 INVALID_DESTINATION from the server onto the destination field', async () => {
    // BE and CMS may deploy out of order: the server refusing something this
    // console still offers must land on the field, not as a bare toast.
    signInAs('ops_admin')
    serveDraftAt('place', PLACE_ID)
    const user = userEvent.setup()
    server.use(
      http.patch(`*/cms/campaigns/${draft.id}`, () =>
        HttpResponse.json(
          {
            code: 'INVALID_DESTINATION',
            message: 'That destination cannot be opened by the app',
            field_errors: [],
            request_id: 'mock-invalid-destination',
            retryable: false,
          },
          { status: 422 },
        ),
      ),
    )
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await destinationSelect()
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await expectTypeRefused()
  })

  it('gives no switch advice on a scheduled campaign, and says to cancel first', async () => {
    // CMS#222 F-01: the form is locked, so "switch and save" was wrong advice,
    // and a scheduled send may still go out — no promise that it will not.
    signInAs('ops_admin')
    serveAt(scheduled, 'recommendation', '3f1c2b8a-9d4e-4a71-b0c5-8e2f6a1d7c93')
    renderWithProviders(<Routed />, { route: `/campaigns/${scheduled.id}` })

    expect(await screen.findByText(/hãy huỷ lịch gửi trước rồi đổi/)).toBeInTheDocument()
    expect(screen.queryByText(/Hãy đổi sang Trang chủ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Đang khoá gửi/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ lịch gửi' })).toBeEnabled()
  })

  it('states only the fact on a campaign that has already gone out', async () => {
    signInAs('ops_admin')
    expect(sent.destinationType).toBe('plan_template')
    renderWithProviders(<Routed />, { route: `/campaigns/${sent.id}` })

    expect(
      await screen.findByText('App chưa mở được điểm đến của chiến dịch này.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Hãy đổi sang Trang chủ/)).not.toBeInTheDocument()
    expect(screen.queryByText(/huỷ lịch gửi trước/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Đang khoá gửi/)).not.toBeInTheDocument()
  })

  it('clears the refusal once the editor switches the type', async () => {
    // CMS#222 F-04: the error described the old type and stayed after a switch.
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await destinationSelect()
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await expectTypeRefused()

    await user.selectOptions(screen.getByLabelText('Loại điểm đến'), 'home')
    expect(screen.getByLabelText('Loại điểm đến')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Điểm đến')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(/App chưa mở được đích này\. Chọn/)).toBeNull()
  })

  it('leaves a 400 INVALID_DESTINATION as the generic refusal, not "unavailable"', async () => {
    // CMS#222 F-03: 400 is the existing malformed/unsafe refusal; only 422 is
    // the app-cannot-open refusal of GoGo-BE#604.
    signInAs('ops_admin')
    serveDraftAt('place', PLACE_ID)
    const user = userEvent.setup()
    server.use(http.patch(`*/cms/campaigns/${draft.id}`, () => refusal(400)))
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await destinationSelect()
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('That destination cannot be used')).toBeInTheDocument()
    expect(screen.getByLabelText('Loại điểm đến')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Điểm đến')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(/App chưa mở được đích này\. Chọn/)).toBeNull()
  })

  it('maps a 422 INVALID_DESTINATION on schedule onto the type select', async () => {
    signInAs('ops_admin')
    serveDraftAt('place', PLACE_ID)
    const user = userEvent.setup()
    server.use(http.post(`*/cms/campaigns/${draft.id}/schedule`, () => refusal(422)))
    renderWithProviders(<Routed />, { route: `/campaigns/${draft.id}` })

    await user.click(await screen.findByRole('button', { name: 'Gửi ngay' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Gửi ngay' }))

    await expectTypeRefused()
  })
})
