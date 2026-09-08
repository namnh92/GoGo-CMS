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

/** The real mock chain: validating PATCH, mutating db, re-read on success. */
function openLive() {
  signInAs('editor')
  return renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })
}

/** A fixed detail plus a PATCH that only records what was sent. */
function openCaptured(detail: Partial<CmsPlaceDetail> = {}) {
  signInAs('editor')
  const sent: Record<string, unknown>[] = []
  server.use(
    http.get('/v1/cms/places/:id', () => HttpResponse.json({ ...PLACE, ...detail })),
    http.patch('/v1/cms/places/:id', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ ...PLACE, ...detail })
    }),
  )
  renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })
  return sent
}

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole('button', { name: 'Lưu thông tin' }))

describe('place address and contact (CMS-044)', () => {
  it('writes phone and website, and reads back what the server stored', async () => {
    const user = userEvent.setup()
    openLive()

    const phone = await screen.findByLabelText('Điện thoại')
    await user.clear(phone)
    await user.type(phone, '028 3822 9999')
    const website = screen.getByLabelText('Website')
    await user.clear(website)
    await user.type(website, 'chaoban.vn')

    await save(user)

    expect(await screen.findByText('Đã lưu thông tin định danh')).toBeInTheDocument()
    // The server is the only normalizer, so the boxes must end up showing what
    // it stored — not the string that was typed at them.
    await waitFor(() => expect(screen.getByLabelText('Điện thoại')).toHaveValue('+842838229999'))
    expect(screen.getByLabelText('Website')).toHaveValue('https://chaoban.vn/')
    // Only a stored http(s) value is offered as a link.
    expect(screen.getByRole('link', { name: 'Mở website đang lưu' })).toHaveAttribute(
      'href',
      'https://chaoban.vn/',
    )
  })

  it('has no free-text city or district box left to type into (ADM-106)', async () => {
    openLive()
    await screen.findByLabelText('Điện thoại')

    // The district tier was dissolved on 2025-07-01. Offering a box for it asks
    // an editor to fill in a unit that does not exist, and the free-text city
    // box could never express the identity anything downstream needs.
    expect(screen.queryByLabelText('Tỉnh/Thành phố')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Quận\/Huyện/)).not.toBeInTheDocument()
    // What replaces them: the two levels Vietnam currently has.
    expect(screen.getByRole('combobox', { name: 'Tỉnh / thành phố' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Phường \/ xã/ })).toBeInTheDocument()
  })

  it('sends null for every field the editor emptied', async () => {
    const user = userEvent.setup()
    const sent = openCaptured({
      city: 'TP.HCM',
      district: 'Quận 3',
      phone: '+842839301234',
      website: 'https://chaoban.cafe',
      description: 'Có mô tả',
      addressText: '126 Nguyễn Thị Minh Khai',
      areaKey: 'hcm_q3',
      avgVisitMinutes: 90,
    })

    await user.clear(await screen.findByLabelText('Điện thoại'))
    await user.clear(screen.getByLabelText('Website'))
    await user.clear(screen.getByLabelText('Mô tả'))
    await user.clear(screen.getByLabelText(/Địa chỉ \(dạng tự do\)/))
    await user.clear(screen.getByLabelText(/Thời lượng ghé trung bình/))
    // Scoped: the province and commune pickers carry a clear button of their
    // own now, and this test is about the discovery area.
    const areaField = screen.getByRole('combobox', { name: /Khu vực khám phá/ }).closest('div')!
    await user.click(within(areaField).getByRole('button', { name: 'Xoá lựa chọn' }))

    await save(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    // `null` clears, an absent key leaves it alone — before #425 an emptied box
    // arrived as an absent key, so a filled value could never be removed.
    expect(sent[0]).toMatchObject({
      phone: null,
      website: null,
      description: null,
      addressText: null,
      areaKey: null,
      avgVisitMinutes: null,
    })
  })

  it('claims nothing about a field the editor never touched', async () => {
    const user = userEvent.setup()
    const sent = openCaptured()

    const address = await screen.findByLabelText(/Địa chỉ \(dạng tự do\)/)
    await user.clear(address)
    await user.type(address, '1 Lê Duẩn')
    await save(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    // A save of one field must not restamp the provenance of seven others.
    expect(Object.keys(sent[0]!).sort()).toEqual(['addressText', 'expectedUpdatedAt'])
  })

  it('always sends the version the form was loaded from', async () => {
    const user = userEvent.setup()
    const sent = openCaptured({ updatedAt: '2026-02-02T02:02:02.000Z' })

    await user.type(await screen.findByLabelText(/Tên hiển thị/), ' mới')
    await save(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ expectedUpdatedAt: '2026-02-02T02:02:02.000Z' })
  })

  it('puts the server phone rejection under the phone box', async () => {
    const user = userEvent.setup()
    openLive()

    const phone = await screen.findByLabelText('Điện thoại')
    await user.clear(phone)
    // A bare subscriber number: no trunk 0, no country code. The server refuses
    // it rather than assuming Vietnam, and the client does not pre-empt that.
    await user.type(phone, '38229999')
    await save(user)

    const message = await screen.findByText('Thiếu mã quốc gia hoặc số 0 đầu')
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone.getAttribute('aria-describedby')).toContain(message.id)
    // What was typed survives a rejection.
    expect(phone).toHaveValue('38229999')
  })

  it('puts the server website rejection under the website box', async () => {
    const user = userEvent.setup()
    openLive()

    const website = await screen.findByLabelText('Website')
    await user.clear(website)
    // The value is rendered as an href in three clients; the allowlist is why.
    await user.type(website, 'javascript:alert(1)')
    await save(user)

    const message = await screen.findByText('Website phải là địa chỉ http hoặc https hợp lệ')
    expect(website).toHaveAttribute('aria-invalid', 'true')
    expect(website.getAttribute('aria-describedby')).toContain(message.id)
  })

  it('does not offer a link for a website that is not a stored http(s) url', async () => {
    openCaptured({ website: null })
    await screen.findByLabelText('Website')
    expect(screen.queryByRole('link', { name: 'Mở website đang lưu' })).not.toBeInTheDocument()
  })
})

describe('place provenance (CMS-044)', () => {
  const provenanceBox = async () => {
    const heading = await screen.findByText(/Nguồn của từng trường/)
    return within(heading.closest('section') as HTMLElement)
  }

  it('names the source per field, and says so when nothing recorded one', async () => {
    openCaptured()
    const box = await provenanceBox()

    expect(box.getAllByText('Biên tập viên GoGo').length).toBeGreaterThan(0)
    // `google_derived` is not `provider`: copying a value from a preview does
    // not transfer ownership of it.
    expect(box.getByText('Lấy từ bản xem trước Google')).toBeInTheDocument()
    // `city`, `district` and `website` have no row in the map. That is a fact
    // stated in words — never defaulted to GoGo.
    expect(box.getAllByText('Chưa ghi nhận nguồn').length).toBeGreaterThanOrEqual(3)
  })

  it('says it for every field when the place has no provenance at all', async () => {
    openCaptured({ provenance: {} })
    const box = await provenanceBox()
    expect(box.getAllByText('Chưa ghi nhận nguồn')).toHaveLength(8)
  })

  it('renders a source type it has never seen rather than blanking it', async () => {
    openCaptured({
      provenance: { name: { sourceType: 'partner_feed', sourceReference: null, verifiedAt: null } },
    })
    const box = await provenanceBox()
    expect(box.getByText('partner_feed')).toBeInTheDocument()
  })
})

describe('place editor concurrency (CMS-044)', () => {
  const STALE = '2026-03-01T00:00:00.000Z'
  const FRESH = '2026-03-02T10:30:00.000Z'

  it('detects a concurrent save through the mock that mirrors GoGo-BE', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    // Loaded from a version the row has already moved past.
    server.use(
      http.get('/v1/cms/places/:id', () => HttpResponse.json({ ...PLACE, updatedAt: STALE })),
    )
    renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })

    await user.type(await screen.findByLabelText(/Tên hiển thị/), ' mới')
    await save(user)

    // No override on PATCH: this is the mock's own 409 PLACE_MODIFIED.
    expect(await screen.findByText('Người khác đã lưu địa điểm này')).toBeInTheDocument()
  })

  it('keeps the edits, shows what differs, and offers reload or overwrite', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    let reads = 0
    const sent: Record<string, unknown>[] = []
    server.use(
      http.get('/v1/cms/places/:id', () => {
        reads += 1
        // Somebody else renamed the place between load and submit.
        return reads === 1
          ? HttpResponse.json({ ...PLACE, updatedAt: STALE })
          : HttpResponse.json({ ...PLACE, name: 'Chào Bạn Coffee', updatedAt: FRESH })
      }),
      http.patch('/v1/cms/places/:id', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        sent.push(body)
        if (body.expectedUpdatedAt !== FRESH) {
          return HttpResponse.json(
            {
              code: 'PLACE_MODIFIED',
              message: 'This place changed after the form was loaded',
              field_errors: [{ field: 'updatedAt', code: 'stale', message: FRESH }],
              request_id: 'req-conflict',
              retryable: false,
            },
            { status: 409 },
          )
        }
        return HttpResponse.json({ ...PLACE, name: body.name, updatedAt: FRESH })
      }),
    )
    renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })

    const name = await screen.findByLabelText(/Tên hiển thị/)
    await user.clear(name)
    await user.type(name, 'Chào Bạn Cafe & Space (mới)')
    await save(user)

    const panel = within(
      (await screen.findByText('Người khác đã lưu địa điểm này')).closest(
        '[role="alert"]',
      ) as HTMLElement,
    )
    // Nothing the editor typed is discarded.
    expect(name).toHaveValue('Chào Bạn Cafe & Space (mới)')
    // And they are told exactly what they would be overwriting.
    expect(panel.getByText(/Bạn nhập: Chào Bạn Cafe & Space \(mới\)/)).toBeInTheDocument()
    expect(panel.getByText(/Máy chủ: Chào Bạn Coffee/)).toBeInTheDocument()

    await user.click(panel.getByRole('button', { name: 'Ghi đè' }))

    expect(await screen.findByText('Đã lưu thông tin định danh')).toBeInTheDocument()
    // The retry carries the version the row is actually on now.
    expect(sent.at(-1)).toMatchObject({
      name: 'Chào Bạn Cafe & Space (mới)',
      expectedUpdatedAt: FRESH,
    })
  })

  it('asks before reloading, because reloading is what loses the work', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    let reads = 0
    server.use(
      http.get('/v1/cms/places/:id', () => {
        reads += 1
        return reads === 1
          ? HttpResponse.json({ ...PLACE, updatedAt: STALE })
          : HttpResponse.json({ ...PLACE, name: 'Chào Bạn Coffee', updatedAt: FRESH })
      }),
      http.patch('/v1/cms/places/:id', () =>
        HttpResponse.json(
          {
            code: 'PLACE_MODIFIED',
            message: 'changed',
            field_errors: [{ field: 'updatedAt', code: 'stale', message: FRESH }],
            request_id: 'req-conflict',
            retryable: false,
          },
          { status: 409 },
        ),
      ),
    )
    renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })

    const name = await screen.findByLabelText(/Tên hiển thị/)
    await user.clear(name)
    await user.type(name, 'Tên của tôi')
    await save(user)

    const panel = within(
      (await screen.findByText('Người khác đã lưu địa điểm này')).closest(
        '[role="alert"]',
      ) as HTMLElement,
    )
    await user.click(panel.getByRole('button', { name: 'Tải lại' }))

    const dialog = await screen.findByRole('dialog')
    // A bare "are you sure?" is not a confirmation: it names what is lost.
    expect(within(dialog).getByText('Tên của tôi')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Tải lại' }))

    await waitFor(() =>
      expect(screen.getByLabelText(/Tên hiển thị/)).toHaveValue('Chào Bạn Coffee'),
    )
    expect(screen.queryByText('Người khác đã lưu địa điểm này')).not.toBeInTheDocument()
  })
})
