import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import type { CmsPlaceDetail, PlaceHour } from '@/shared/api/contracts'
import PlaceEditorScreen from './placeEditor.view'

const PLACE = places.find((place) => place.id === 'pl-chao-ban')!

function Routed() {
  return (
    <Routes>
      <Route path="/places/:id" element={<PlaceEditorScreen />} />
    </Routes>
  )
}

const hour = (over: Partial<PlaceHour> & { dayOfWeek: number }): PlaceHour => ({
  kind: 'interval',
  openMinute: 8 * 60,
  closeMinute: 22 * 60,
  isOvernight: false,
  source: 'editor',
  verifiedAt: '2026-09-01T00:00:00.000Z',
  ...over,
})

function open(detail: Partial<CmsPlaceDetail> = {}) {
  server.use(http.get('/v1/cms/places/:id', () => HttpResponse.json({ ...PLACE, ...detail })))
  return renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })
}

/** The hours card's own Save; the identity block has its own. */
async function hoursCard() {
  const heading = await screen.findByText('Giờ mở cửa')
  return within(heading.closest('section, div[class*="rounded"]') as HTMLElement)
}

function sundaySection() {
  return within(screen.getByRole('region', { name: 'Chủ Nhật' }) as HTMLElement)
}

describe('opening hours by day group (GoGo-CMS#124)', () => {
  it('fills all seven days from one window and one apply', async () => {
    signInAs('editor')
    let sent: { hours: unknown[] } = { hours: [] }
    server.use(
      http.put('/v1/cms/places/:id/hours', async ({ request }) => {
        sent = (await request.json()) as { hours: unknown[] }
        return HttpResponse.json(PLACE)
      }),
    )
    const user = userEvent.setup()
    open({ hours: [] })

    await screen.findByText('Giờ mở cửa')
    await user.type(screen.getByLabelText('Giờ mở'), '08:00')
    await user.type(screen.getByLabelText('Giờ đóng'), '22:00')
    await user.click(screen.getByRole('button', { name: 'Áp dụng cho 7 ngày' }))

    // Nothing to overwrite, so no confirmation is asked for.
    const card = await hoursCard()
    await user.click(card.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(sent.hours).toHaveLength(7))
    expect(sent.hours[0]).toMatchObject({
      dayOfWeek: 0,
      kind: 'interval',
      openMinute: 480,
      closeMinute: 1320,
    })
  })

  it('names the days a quick-apply would overwrite before doing it', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open({ hours: [hour({ dayOfWeek: 0 }), hour({ dayOfWeek: 6 })] })

    await screen.findByText('Giờ mở cửa')
    await user.click(screen.getByRole('button', { name: 'Cuối tuần' }))
    await user.type(screen.getByLabelText('Giờ mở'), '09:00')
    await user.type(screen.getByLabelText('Giờ đóng'), '23:00')
    await user.click(screen.getByRole('button', { name: 'Áp dụng cho 2 ngày' }))

    // A preview, not a bare "are you sure": the days that lose data are listed.
    expect(await screen.findByText('Thay lịch những ngày đã có dữ liệu')).toBeInTheDocument()
    expect(
      screen.getByText('2 ngày đang có lịch sẽ bị thay bằng khung giờ mới.'),
    ).toBeInTheDocument()
  })

  it('editing Saturday alone leaves the other days untouched', async () => {
    signInAs('editor')
    let sent: { hours: { dayOfWeek: number; closeMinute: number }[] } = { hours: [] }
    server.use(
      http.put('/v1/cms/places/:id/hours', async ({ request }) => {
        sent = (await request.json()) as typeof sent
        return HttpResponse.json(PLACE)
      }),
    )
    const user = userEvent.setup()
    open({ hours: [0, 1, 6].map((dayOfWeek) => hour({ dayOfWeek })) })

    await screen.findByText('Giờ mở cửa')
    const saturday = within(screen.getByRole('region', { name: 'Thứ Bảy' }) as HTMLElement)
    const close = saturday.getByLabelText('Giờ đóng ngày Thứ Bảy')
    await user.clear(close)
    await user.type(close, '23:30')

    const card = await hoursCard()
    await user.click(card.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(sent.hours).toHaveLength(3))
    expect(sent.hours.find((h) => h.dayOfWeek === 6)!.closeMinute).toBe(23 * 60 + 30)
    expect(sent.hours.find((h) => h.dayOfWeek === 0)!.closeMinute).toBe(22 * 60)
    expect(sent.hours.find((h) => h.dayOfWeek === 1)!.closeMinute).toBe(22 * 60)
  })
})

describe('the four states a day can be in', () => {
  it('renders no data, closed and open-24h as different things', async () => {
    signInAs('editor')
    open({
      hours: [
        hour({ dayOfWeek: 0, kind: 'closed', openMinute: 0, closeMinute: 0 }),
        hour({ dayOfWeek: 6, kind: 'open_24h', openMinute: 0, closeMinute: 0 }),
      ],
    })

    await screen.findByText('Giờ mở cửa')
    expect(sundaySection().getByRole('radio', { name: /Đóng cửa/ })).toBeChecked()
    const saturday = within(screen.getByRole('region', { name: 'Thứ Bảy' }) as HTMLElement)
    expect(saturday.getByRole('radio', { name: /Mở 24 giờ/ })).toBeChecked()

    // A day with no row is "chưa có dữ liệu", and the screen says so in words
    // rather than leaving two empty boxes that read as closed.
    const wednesday = within(screen.getByRole('region', { name: 'Thứ Tư' }) as HTMLElement)
    expect(wednesday.getByRole('radio', { name: /Chưa có dữ liệu/ })).toBeChecked()
    expect(
      wednesday.getByText(
        'Chưa có dữ liệu khác với đóng cửa. Ngày này sẽ không được gửi lên máy chủ.',
      ),
    ).toBeInTheDocument()
  })

  it('sends closed and open-24h with no minutes, and omits unknown days', async () => {
    signInAs('editor')
    let sent: { hours: { dayOfWeek: number; kind: string }[] } = { hours: [] }
    server.use(
      http.put('/v1/cms/places/:id/hours', async ({ request }) => {
        sent = (await request.json()) as typeof sent
        return HttpResponse.json(PLACE)
      }),
    )
    const user = userEvent.setup()
    open({ hours: [] })

    await screen.findByText('Giờ mở cửa')
    await user.click(sundaySection().getByRole('radio', { name: /Đóng cửa/ }))
    const card = await hoursCard()
    await user.click(card.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(sent.hours).toHaveLength(1))
    expect(sent.hours[0]).toEqual({
      dayOfWeek: 0,
      kind: 'closed',
      openMinute: 0,
      closeMinute: 0,
      isOvernight: false,
    })
  })
})

describe('typing, and what survives a rejection', () => {
  it('keeps a half-typed time instead of discarding it', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open({ hours: [hour({ dayOfWeek: 1 })] })

    await screen.findByText('Giờ mở cửa')
    const monday = within(screen.getByRole('region', { name: 'Thứ Hai' }) as HTMLElement)
    const open_ = monday.getByLabelText('Giờ mở ngày Thứ Hai')
    await user.clear(open_)
    await user.type(open_, '9')
    // The old editor parsed every keystroke and dropped anything unparseable,
    // so `9` never appeared. The draft is a string until save.
    expect(open_).toHaveValue('9')
    await user.type(open_, ':30')
    expect(open_).toHaveValue('9:30')
  })

  it('points at the overlapping row instead of sending the week', async () => {
    signInAs('editor')
    let called = false
    server.use(
      http.put('/v1/cms/places/:id/hours', () => {
        called = true
        return HttpResponse.json(PLACE)
      }),
    )
    const user = userEvent.setup()
    open({
      hours: [
        hour({ dayOfWeek: 1, openMinute: 8 * 60, closeMinute: 14 * 60 }),
        hour({ dayOfWeek: 1, openMinute: 13 * 60, closeMinute: 20 * 60 }),
      ],
    })

    await screen.findByText('Giờ mở cửa')
    const card = await hoursCard()
    await user.click(card.getByRole('button', { name: 'Lưu' }))

    // Against the row that produced it, not only in a summary panel.
    const monday = within(screen.getByRole('region', { name: 'Thứ Hai' }) as HTMLElement)
    await waitFor(() =>
      expect(monday.getByText('Ca này trùng giờ với một ca khác')).toBeInTheDocument(),
    )
    expect(called).toBe(false)
  })

  it('a rejected PUT leaves the draft exactly where it was', async () => {
    signInAs('editor')
    server.use(
      http.put('/v1/cms/places/:id/hours', () =>
        HttpResponse.json(
          {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
            field_errors: [
              {
                field: 'hours.0.closeMinute',
                code: 'not_after_open',
                message: 'Giờ đóng phải sau giờ mở',
              },
            ],
            request_id: 'req-hours-1',
            retryable: false,
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    open({ hours: [hour({ dayOfWeek: 1 })] })

    await screen.findByText('Giờ mở cửa')
    const monday = within(screen.getByRole('region', { name: 'Thứ Hai' }) as HTMLElement)
    const close = monday.getByLabelText('Giờ đóng ngày Thứ Hai')
    await user.clear(close)
    await user.type(close, '23:45')

    const card = await hoursCard()
    await user.click(card.getByRole('button', { name: 'Lưu' }))

    // The server's field path lands on the row that produced it, and the value
    // the editor typed is still there.
    await waitFor(() => expect(monday.getByText('Giờ đóng phải sau giờ mở')).toBeInTheDocument())
    expect(close).toHaveValue('23:45')
  })

  it('a provider row keeps its source until the editor changes it', async () => {
    signInAs('editor')
    let sent: { hours: { source?: string }[] } = { hours: [] }
    server.use(
      http.put('/v1/cms/places/:id/hours', async ({ request }) => {
        sent = (await request.json()) as typeof sent
        return HttpResponse.json(PLACE)
      }),
    )
    const user = userEvent.setup()
    open({ hours: [hour({ dayOfWeek: 1, source: 'provider' })] })

    await screen.findByText('Giờ mở cửa')
    const card = await hoursCard()
    await user.click(card.getByRole('button', { name: 'Lưu' }))

    // Re-saving a provider week is not a verification anyone performed.
    await waitFor(() => expect(sent.hours).toHaveLength(1))
    expect(sent.hours[0]!.source).toBe('provider')
  })

  it('a provider row edited by hand becomes the editor’s claim', async () => {
    signInAs('editor')
    let sent: { hours: { source?: string }[] } = { hours: [] }
    server.use(
      http.put('/v1/cms/places/:id/hours', async ({ request }) => {
        sent = (await request.json()) as typeof sent
        return HttpResponse.json(PLACE)
      }),
    )
    const user = userEvent.setup()
    open({ hours: [hour({ dayOfWeek: 1, source: 'provider' })] })

    await screen.findByText('Giờ mở cửa')
    const monday = within(screen.getByRole('region', { name: 'Thứ Hai' }) as HTMLElement)
    const close = monday.getByLabelText('Giờ đóng ngày Thứ Hai')
    await user.clear(close)
    await user.type(close, '23:00')

    const card = await hoursCard()
    await user.click(card.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(sent.hours).toHaveLength(1))
    expect(sent.hours[0]!.source).toBe('editor')
  })
})

describe('permissions', () => {
  it('a role without place.write sees the week read-only', async () => {
    signInAs('moderator')
    open({ hours: [hour({ dayOfWeek: 1 })] })

    await screen.findByText('Giờ mở cửa')
    const monday = within(screen.getByRole('region', { name: 'Thứ Hai' }) as HTMLElement)
    expect(monday.getByLabelText('Giờ mở ngày Thứ Hai')).toBeDisabled()
    expect(monday.getByRole('radio', { name: /Đóng cửa/ })).toBeDisabled()
  })
})
