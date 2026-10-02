import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import PlaceCreateScreen from './placeCreate.view'
import { fillSources, SOURCE_LABEL, SOURCE_TEXT } from './placeCreate.testkit'

/**
 * GoGo-CMS#150. Three things are worth holding still here, and each of them was
 * a defect before:
 *
 *  - the screen exists at all — `/places/new` used to fall through to the
 *    editor with the id "new" and answer `400 Invalid uuid` (#128);
 *  - a suspected duplicate is a question, not a failure: the editor sees the
 *    candidates and chooses, rather than being told "save failed";
 *  - a rejected field lands on its own box, because a form-wide toast leaves an
 *    editor hunting for which of eleven inputs was wrong.
 */
const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const CREATED = {
  id: '9d3a1a52-6c4e-4c3f-9c0e-2f2b0f0a1111',
  name: 'Quán Mới',
  status: 'draft',
  areaKey: null,
  addressText: null,
  city: null,
  district: null,
  phone: null,
  website: null,
  description: null,
  avgVisitMinutes: null,
  lat: 10.7769,
  lng: 106.7009,
  updatedAt: new Date().toISOString(),
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Tên hiển thị/), 'Quán Mới')
  await user.type(screen.getByLabelText(/Vĩ độ/), '10.7769')
  await user.type(screen.getByLabelText(/Kinh độ/), '106.7009')
  await fillSources(user)
}

/** A refusal in the BFF envelope. */
function envelope(code: string, status: number, fieldErrors: object[] = []) {
  return HttpResponse.json(
    { code, message: code, field_errors: fieldErrors, request_id: `req-${code}`, retryable: false },
    { status },
  )
}

/** Every create the screen sends: its body and its `Idempotency-Key`. */
type Sent = { body: Record<string, unknown>; key: string | null }

/** Answers each create in turn from `replies`; the last one repeats. */
function createAnswers(...replies: (() => Response)[]) {
  const sent: Sent[] = []
  server.use(
    http.post('*/cms/places', async ({ request }) => {
      sent.push({
        body: (await request.json()) as Record<string, unknown>,
        key: request.headers.get('Idempotency-Key'),
      })
      const reply = replies[Math.min(sent.length - 1, replies.length - 1)]!
      return reply()
    }),
  )
  return sent
}

const created = () => HttpResponse.json(CREATED, { status: 201 })
const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

beforeEach(() => {
  navigate.mockClear()
})

describe('create a place', () => {
  it('creates a draft and lands on the editor to finish it', async () => {
    signInAs('editor')
    const bodies: unknown[] = []
    server.use(
      http.post('*/cms/places', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(CREATED, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/places/${CREATED.id}`))
    // Nothing is invented on the way out: an untouched box sends no key at all,
    // which is what keeps `lat: 0` out of the Gulf of Guinea (#122). And every
    // fact that is sent names its evidence (GoGo-BE#440) — `geom` for the pin.
    expect(bodies[0]).toEqual({
      name: 'Quán Mới',
      lat: 10.7769,
      lng: 106.7009,
      sourceReferences: { name: SOURCE_TEXT, geom: SOURCE_TEXT },
    })
  })

  it('sends an Idempotency-Key and never a googleDerivedFields', async () => {
    signInAs('editor')
    const sent = createAnswers(created)
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    // The contract's own pattern for the header.
    expect(sent[0]!.key).toMatch(/^[\w-]{8,128}$/)
    expect(sent[0]!.body).not.toHaveProperty('googleDerivedFields')
  })

  it('will not send a fact without its source, and says so on the source box', async () => {
    signInAs('editor')
    const sent = createAnswers(created)
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await user.type(screen.getByLabelText(/Điện thoại/), '0283822999')
    await submit(user)

    const phoneSource = await screen.findByLabelText(SOURCE_LABEL.phone)
    await waitFor(() => expect(phoneSource).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('Ghi nguồn cho thông tin này')).toBeInTheDocument()
    expect(sent).toHaveLength(0)

    await user.type(phoneSource, 'Gọi điện cho quán')
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.body).toMatchObject({
      phone: '0283822999',
      sourceReferences: { name: SOURCE_TEXT, geom: SOURCE_TEXT, phone: 'Gọi điện cho quán' },
    })
  })

  it('drops the source of a fact the editor emptied — no stray reference', async () => {
    signInAs('editor')
    const sent = createAnswers(created)
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    const website = screen.getByLabelText(/Website/)
    await user.type(website, 'https://quanmoi.vn')
    await fillSources(user, ['website'], 'Website của quán')
    await user.clear(website)
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.body).not.toHaveProperty('website')
    expect(sent[0]!.body.sourceReferences).toEqual({ name: SOURCE_TEXT, geom: SOURCE_TEXT })
  })

  it('refuses to submit without a name or a position, and says which', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    // Three messages, each next to its own input rather than one toast — and
    // each of them a sentence. The first cut of this screen rendered the raw
    // i18n key `placeEditor.error.required`, and this assertion only counted
    // the alerts, so it passed anyway.
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(3))
    for (const alert of screen.getAllByRole('alert')) {
      expect(alert).not.toHaveTextContent(/^placeEditor\./)
    }
    expect(screen.getAllByText('Không được để trống').length).toBeGreaterThanOrEqual(3)
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining('/places/'))
  })

  it('names each duplicate candidate and opens it by id, in a new tab', async () => {
    signInAs('editor')
    const sent = createAnswers(
      () =>
        envelope('PLACE_DUPLICATE_SUSPECTED', 409, [
          {
            field: 'name',
            code: 'duplicate_candidate',
            message: 'Quán Cũ (12m)',
            candidate: {
              placeId: '0b7e7a52-1111-4c3f-9c0e-2f2b0f0a2222',
              name: 'Quán Cũ',
              status: 'published',
              distanceM: 12,
              nameSimilarity: 0.734,
            },
          },
        ]),
      created,
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await submit(user)

    // Enough to go and look: name, status, distance, similarity — and a link
    // to the place itself, not to a queue.
    expect(await screen.findByText('Quán Cũ')).toBeInTheDocument()
    expect(screen.getByText('Cách 12 m · tên giống 73%')).toBeInTheDocument()
    expect(screen.getByText('Đã xuất bản')).toBeInTheDocument()
    const open = screen.getByRole('link', { name: 'Mở “Quán Cũ” trong tab mới' })
    expect(open).toHaveAttribute('href', '/places/0b7e7a52-1111-4c3f-9c0e-2f2b0f0a2222')
    expect(open).toHaveAttribute('target', '_blank')
    expect(navigate).not.toHaveBeenCalledWith(`/places/${CREATED.id}`)

    await user.click(screen.getByRole('button', { name: 'Đây là chỗ khác, vẫn tạo' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/places/${CREATED.id}`))
    expect(sent).toHaveLength(2)
    expect(sent[1]!.body).toMatchObject({ allowDuplicate: true })
    // A different body is a different attempt: reusing the first key would be
    // `422 IDEMPOTENCY_KEY_REUSED`.
    expect(sent[1]!.key).not.toBe(sent[0]!.key)
  })

  it('still shows a duplicate the server sent without a candidate', async () => {
    signInAs('editor')
    createAnswers(() =>
      envelope('PLACE_DUPLICATE_SUSPECTED', 409, [
        { field: 'name', code: 'duplicate_candidate', message: 'Quán Cũ (12m)' },
      ]),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await submit(user)

    expect(await screen.findByText('Quán Cũ (12m)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /trong tab mới/ })).not.toBeInTheDocument()
  })

  it('puts a rejected phone on the phone box, not in a toast', async () => {
    signInAs('editor')
    server.use(
      http.post('*/cms/places', () =>
        HttpResponse.json(
          {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
            field_errors: [
              { field: 'phone', code: 'invalid_string', message: 'Số điện thoại không hợp lệ' },
            ],
            request_id: 'req-phone',
            retryable: false,
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await user.type(screen.getByLabelText(/Điện thoại/), '38229999')
    await fillSources(user, ['phone'], 'Gọi điện cho quán')
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    const phone = await screen.findByLabelText(/Điện thoại/)
    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'))
  })

  it('a retry after a lost response reuses the key, so the server can replay', async () => {
    signInAs('editor')
    const sent = createAnswers(() => HttpResponse.error(), created)
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await submit(user)
    expect(await screen.findByText('Không kết nối được máy chủ.')).toBeInTheDocument()

    await submit(user)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/places/${CREATED.id}`))
    expect(sent).toHaveLength(2)
    expect(sent[1]!.body).toEqual(sent[0]!.body)
    expect(sent[1]!.key).toBe(sent[0]!.key)
  })

  it('a corrected body after a failure is a new attempt with a new key', async () => {
    signInAs('editor')
    const sent = createAnswers(() => HttpResponse.error(), created)
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await submit(user)
    await screen.findByText('Không kết nối được máy chủ.')

    await user.type(screen.getByLabelText(/Tên hiển thị/), ' 2')
    await submit(user)

    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]!.body.name).toBe('Quán Mới 2')
    expect(sent[1]!.key).not.toBe(sent[0]!.key)
  })

  it('puts SOURCE_REFERENCE_INVALID on the source box it names', async () => {
    signInAs('editor')
    createAnswers(() =>
      envelope('SOURCE_REFERENCE_INVALID', 400, [
        { field: 'sourceReferences.geom', code: 'too_big', message: 'too long' },
      ]),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await submit(user)

    const geom = screen.getByLabelText(SOURCE_LABEL.geom)
    await waitFor(() => expect(geom).toHaveAttribute('aria-invalid', 'true'))
    expect(
      screen.getByText(
        'Máy chủ không nhận nguồn này — kiểm tra lại (1–500 ký tự, đúng thông tin đã nhập).',
      ),
    ).toBeInTheDocument()
  })

  it.each([
    [
      'GOOGLE_CONTENT_NOT_PERSISTABLE',
      400,
      'Dữ liệu lấy từ Google không được lưu như dữ liệu của GoGo. Kiểm tra lại từng thông tin và ghi nguồn độc lập.',
    ],
    [
      'SOURCE_REFERENCE_INVALID',
      400,
      'Có thông tin chưa ghi nguồn, hoặc có nguồn cho thông tin chưa nhập.',
    ],
    [
      'IDEMPOTENT_REQUEST_IN_FLIGHT',
      409,
      'Lần gửi trước vẫn đang được xử lý. Đợi vài giây rồi thử lại.',
    ],
    [
      'RATE_LIMITED',
      429,
      'Bạn đã tạo quá nhiều địa điểm trong một phút (tối đa 20). Đợi một chút rồi bấm “Tạo địa điểm” lại — dữ liệu trong form vẫn giữ nguyên.',
    ],
  ])('says what %s means, in Vietnamese, and keeps the key', async (code, status, text) => {
    signInAs('editor')
    const sent = createAnswers(() => envelope(code, status))
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await submit(user)

    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.getByText('Chưa tạo được địa điểm')).toBeInTheDocument()

    // Same body, same attempt: the key the server may still be holding.
    await submit(user)
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]!.key).toBe(sent[0]!.key)
  })

  it.each([
    ['IDEMPOTENCY_KEY_REQUIRED', 400, 'Yêu cầu thiếu mã chống gửi trùng. Bấm lại để gửi lần nữa.'],
    [
      'IDEMPOTENCY_KEY_REUSED',
      422,
      'Lần gửi trước dùng dữ liệu khác. Bấm lại để gửi dữ liệu hiện tại như một lần tạo mới.',
    ],
  ])('says what %s means and starts a fresh attempt', async (code, status, text) => {
    signInAs('editor')
    const sent = createAnswers(() => envelope(code, status), created)
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await submit(user)
    expect(await screen.findByText(text)).toBeInTheDocument()

    await submit(user)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/places/${CREATED.id}`))
    expect(sent[1]!.key).not.toBe(sent[0]!.key)
  })

  it('is a permission-denied screen for a moderator', async () => {
    signInAs('moderator')
    renderWithProviders(<PlaceCreateScreen />)

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tạo địa điểm' })).not.toBeInTheDocument()
  })
})
