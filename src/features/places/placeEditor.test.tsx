import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import type { CmsPlaceDetail } from '@/shared/api/contracts'
import PlaceEditorScreen from './placeEditor.view'

const PLACE = places.find((place) => place.id === 'pl-chao-ban')!

function Routed() {
  return (
    <Routes>
      <Route path="/places/:id" element={<PlaceEditorScreen />} />
    </Routes>
  )
}

/** The in-form panel, not the toast — both are `role="alert"` by design. */
async function rejectionPanel(title: string) {
  const heading = await screen.findByText(title)
  return within(heading.closest('[role="alert"]') as HTMLElement)
}

function open(detail: Partial<CmsPlaceDetail> = {}) {
  server.use(http.get('/v1/cms/places/:id', () => HttpResponse.json({ ...PLACE, ...detail })))
  return renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })
}

/** The 400 GoGo-BE actually answered, verbatim from the issue. */
const VALIDATION_400 = {
  code: 'VALIDATION_FAILED',
  message: 'Request validation failed',
  field_errors: [
    {
      field: 'avgVisitMinutes',
      code: 'too_small',
      message: 'Number must be greater than or equal to 10',
    },
  ],
  request_id: 'req-abc123',
  retryable: false,
}

describe('place editor save (GoGo-CMS#122)', () => {
  it('saves a place whose visit duration was never set', async () => {
    signInAs('editor')
    let body: Record<string, unknown> = {}
    server.use(
      http.patch('/v1/cms/places/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(PLACE)
      }),
    )
    const user = userEvent.setup()
    open({ avgVisitMinutes: null, lat: null, lng: null })

    await user.click(await screen.findByRole('button', { name: 'Lưu thông tin' }))

    expect(await screen.findByText('Đã lưu thông tin định danh')).toBeInTheDocument()
    // `z.coerce.number()` used to turn the empty boxes into 0. `0` fails the
    // server's `avgVisitMinutes >= 10`, and `lat: 0, lng: 0` it *accepts* —
    // moving the place and invalidating every cached travel leg.
    expect(body).not.toHaveProperty('avgVisitMinutes')
    expect(body).not.toHaveProperty('lat')
    expect(body).not.toHaveProperty('lng')
  })

  /*
   * #140 — the save above reported success while the block underneath kept
   * saying "Có thay đổi chưa lưu", on every place with a null number field.
   *
   * An empty `<input type="number">` reads back as `''`, and the default seeded
   * from a null was `undefined`; react-hook-form compared the two, never found
   * them equal, and no save could clear it. The success toast fired regardless,
   * which is why the test above passed through the whole bug.
   */
  it('stops calling the block unsaved once the save lands', async () => {
    signInAs('editor')
    server.use(http.patch('/v1/cms/places/:id', () => HttpResponse.json(PLACE)))
    const user = userEvent.setup()
    open({ avgVisitMinutes: null, lat: null, lng: null })

    await user.type(await screen.findByLabelText(/Quận\/Huyện/), 'Quận 3')
    expect(screen.getAllByText('Có thay đổi chưa lưu').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    expect(await screen.findByText('Đã lưu thông tin định danh')).toBeInTheDocument()

    await waitFor(() => expect(screen.queryByText('Có thay đổi chưa lưu')).not.toBeInTheDocument())
    expect(screen.getAllByText(/^Đã lưu lúc/).length).toBeGreaterThan(0)
  })

  it('lets a saved place be left without a discard warning', async () => {
    signInAs('editor')
    server.use(http.patch('/v1/cms/places/:id', () => HttpResponse.json(PLACE)))
    const user = userEvent.setup()
    open({ avgVisitMinutes: null, lat: null, lng: null })

    await user.type(await screen.findByLabelText(/Quận\/Huyện/), 'Quận 3')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    await screen.findByText('Đã lưu thông tin định danh')

    // Offering "Rời đi và bỏ thay đổi" on a place with nothing unsaved teaches
    // editors to click through the guard, so the real one costs them work.
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('is accepted by a mock that now enforces the server schema', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open({ avgVisitMinutes: null })

    await user.click(await screen.findByRole('button', { name: 'Lưu thông tin' }))

    // No override here: this goes through the validating PATCH handler.
    expect(await screen.findByText('Đã lưu thông tin định danh')).toBeInTheDocument()
  })

  it('refuses a duration the server would reject, before sending it', async () => {
    signInAs('editor')
    let sent = 0
    server.use(
      http.patch('/v1/cms/places/:id', () => {
        sent += 1
        return HttpResponse.json(PLACE)
      }),
    )
    const user = userEvent.setup()
    open()

    const duration = await screen.findByLabelText(/Thời lượng ghé trung bình/)
    await user.clear(duration)
    await user.type(duration, '5')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    expect(await screen.findByText('Nhỏ nhất là 10')).toBeInTheDocument()
    expect(sent).toBe(0)
    // What was typed is still there — a rejected save discards nothing.
    expect(duration).toHaveValue(5)
  })

  it('puts a server field error under its own field, in Vietnamese', async () => {
    signInAs('editor')
    server.use(
      http.patch('/v1/cms/places/:id', () => HttpResponse.json(VALIDATION_400, { status: 400 })),
    )
    const user = userEvent.setup()
    open()

    const duration = await screen.findByLabelText(/Thời lượng ghé trung bình/)
    await user.clear(duration)
    await user.type(duration, '90')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    // Not "Number must be greater than or equal to 10", and not only a toast.
    const message = await screen.findByText('Nhỏ nhất là 10')
    expect(message).toBeInTheDocument()
    // The control points at its message, so a screen reader reads both.
    expect(duration).toHaveAttribute('aria-invalid', 'true')
    expect(duration.getAttribute('aria-describedby')).toContain(message.id)
    // The one string an operator can quote to whoever reads the logs.
    const panel = await rejectionPanel('Máy chủ từ chối lưu thông tin định danh')
    expect(panel.getByText('req-abc123')).toBeInTheDocument()
    expect(duration).toHaveValue(90)
  })

  it('surfaces a rejected path the form has no control for', async () => {
    signInAs('editor')
    server.use(
      http.patch('/v1/cms/places/:id', () =>
        HttpResponse.json(
          {
            ...VALIDATION_400,
            field_errors: [
              { field: 'taxonomyIds.0', code: 'invalid_string', message: 'Invalid uuid' },
            ],
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    open()

    await user.click(await screen.findByRole('button', { name: 'Lưu thông tin' }))

    const panel = await rejectionPanel('Máy chủ từ chối lưu thông tin định danh')
    expect(panel.getByText('taxonomyIds.0')).toBeInTheDocument()
    expect(panel.getByText(/Sai định dạng/)).toBeInTheDocument()
  })

  it('reports saved state per block, not once for the whole page', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open()

    await user.click(await screen.findByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Đã lưu giờ mở cửa')).toBeInTheDocument()
    // Exactly one block claims it was saved: the one whose request answered.
    await waitFor(() => expect(screen.getAllByText(/^Đã lưu lúc/)).toHaveLength(1))
    expect(screen.queryByText('Đã lưu thông tin định danh')).not.toBeInTheDocument()
    // The identity block reports the row's last change, a different claim.
    expect(screen.getAllByText(/^Thay đổi gần nhất/).length).toBeGreaterThan(0)
  })

  it('warns before the browser leaves with unsaved edits', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open()

    await screen.findByLabelText(/Tên hiển thị/)
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true)

    await user.type(screen.getByLabelText(/Tên hiển thị/), ' mới')

    await waitFor(() =>
      expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false),
    )
    // And leaving in-app asks first, naming what is at stake.
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Thông tin định danh')).toBeInTheDocument()
  })

  it('offers only the status transitions the server accepts', async () => {
    signInAs('super_admin')
    open()

    const select = await screen.findByLabelText('Trạng thái')
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)
    // `published` may only be suspended or archived (cms-catalog.service.ts);
    // the list used to carry every status, so a draft could be published here.
    expect(options).toEqual(['Đã xuất bản', 'Tạm ngưng', 'Lưu trữ'])
  })

  it('closes the status control on a terminal state', async () => {
    signInAs('super_admin')
    open({ status: 'archived' })

    const select = await screen.findByLabelText('Trạng thái')
    expect(select).toBeDisabled()
    expect(screen.getByText('Trạng thái cuối — không chuyển tiếp được nữa.')).toBeInTheDocument()
  })
})
