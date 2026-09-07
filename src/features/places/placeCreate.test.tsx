import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import PlaceCreateScreen from './placeCreate.view'

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
}

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
    // which is what keeps `lat: 0` out of the Gulf of Guinea (#122).
    expect(bodies[0]).toEqual({ name: 'Quán Mới', lat: 10.7769, lng: 106.7009 })
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

  it('shows the duplicate candidates and lets the editor decide', async () => {
    signInAs('editor')
    let calls = 0
    server.use(
      http.post('*/cms/places', async ({ request }) => {
        calls += 1
        const body = (await request.json()) as { allowDuplicate?: boolean }
        if (!body.allowDuplicate) {
          return HttpResponse.json(
            {
              code: 'PLACE_DUPLICATE_SUSPECTED',
              message: 'Địa điểm này có thể đã có trong danh mục',
              field_errors: [
                { field: 'name', code: 'duplicate_candidate', message: 'Quán Cũ (12m)' },
              ],
              request_id: 'req-dup',
              retryable: false,
            },
            { status: 409 },
          )
        }
        return HttpResponse.json(CREATED, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    // The candidate is named with its distance — enough to go and look.
    expect(await screen.findByText('Quán Cũ (12m)')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalledWith(`/places/${CREATED.id}`)

    await user.click(screen.getByRole('button', { name: 'Đây là chỗ khác, vẫn tạo' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/places/${CREATED.id}`))
    expect(calls).toBe(2)
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
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    const phone = await screen.findByLabelText(/Điện thoại/)
    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'))
  })

  it('is a permission-denied screen for a moderator', async () => {
    signInAs('moderator')
    renderWithProviders(<PlaceCreateScreen />)

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tạo địa điểm' })).not.toBeInTheDocument()
  })
})
