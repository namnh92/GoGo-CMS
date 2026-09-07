import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import PlaceCreateScreen from './placeCreate.view'
import { roundCoordinate } from './placeCreateLink.view'

/**
 * GoGo-CMS#157 — adding a place by its Google Maps link.
 *
 * The screen used to open on a latitude box. What is worth holding still is
 * that the link fills the form *and* that provenance follows what the editor
 * actually did with what it filled: leaving Google's answer alone is accepting
 * it, changing it makes the value the editor's own, and the request body has to
 * say which — the server keeps no snapshot to work it out from.
 *
 * Every assertion here reads the rendered sentence rather than counting
 * elements. Counting is what let a screen full of raw i18n keys ship green
 * (#152).
 */
const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const CREATED = {
  id: '9d3a1a52-6c4e-4c3f-9c0e-2f2b0f0a1111',
  name: 'Cà Phê Bên Đường',
  status: 'draft',
  areaKey: null,
  addressText: '9 Nguyễn Huệ, Quận 1',
  city: null,
  district: null,
  phone: null,
  website: null,
  description: null,
  avgVisitMinutes: null,
  lat: 10.7743,
  lng: 106.7038,
  updatedAt: new Date().toISOString(),
}

const RESOLVED = {
  status: 'RESOLVED',
  matchConfidence: 0.97,
  reasonCodes: ['EXACT_PROVIDER_ID'],
  candidate: {
    googlePlaceId: 'ChIJcafe',
    name: 'Cà Phê Bên Đường',
    address: '9 Nguyễn Huệ, Quận 1',
    // The doubles cms-dev actually answered for Landmark 81 — Google publishes
    // 10.7951153 / 106.7221002 and JSON hands back the nearest double, which is
    // not the same one. See the precision block at the bottom of this file.
    location: { lat: 10.795115299999999, lng: 106.72210020000001 },
    googleRating: 4.4,
    googleRatingCount: 88,
    googleScore: 71,
    businessStatus: 'OPERATIONAL',
    source: 'google_places',
    fetchedAt: new Date().toISOString(),
    attributions: ['Dữ liệu bản đồ ©2026 Google'],
  },
  candidates: [],
}

const AMBIGUOUS = {
  status: 'CANDIDATE_SELECTION',
  reasonCodes: ['MULTIPLE_BRANCHES'],
  matchConfidence: 0.62,
  candidates: [
    { googlePlaceId: 'ChIJa', name: 'Highlands Coffee', address: '1 Lê Lợi', confidence: 0.62 },
    {
      googlePlaceId: 'ChIJb',
      name: 'Highlands Coffee',
      address: '88 Hai Bà Trưng',
      confidence: 0.6,
    },
  ],
}

const LINK = 'https://www.google.com/maps/place/?q=place_id:ChIJcafe&place_id=ChIJcafe'

function resolvesTo(body: Record<string, unknown>, status = 201) {
  const calls: unknown[] = []
  server.use(
    http.post('*/cms/places/resolve-link', async ({ request }) => {
      calls.push(await request.json())
      return HttpResponse.json(body, { status })
    }),
  )
  return calls
}

function createdWith() {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post('*/cms/places', async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(CREATED, { status: 201 })
    }),
  )
  return bodies
}

async function pasteAndResolve(user: ReturnType<typeof userEvent.setup>, url = LINK) {
  await user.type(screen.getByLabelText('Link Google Maps'), url)
  await user.click(screen.getByRole('button', { name: 'Tìm địa điểm' }))
}

beforeEach(() => {
  navigate.mockClear()
})

describe('add a place by Google Maps link', () => {
  it('fills the form from the resolved place, attribution and all', async () => {
    signInAs('editor')
    resolvesTo(RESOLVED)
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user)

    expect(await screen.findByText('Google trả về địa điểm này')).toBeInTheDocument()
    expect(screen.getByText('Cà Phê Bên Đường')).toBeInTheDocument()
    expect(screen.getByText('10.7951153, 106.7221002')).toBeInTheDocument()
    // Shown so the editor can tell two branches of a chain apart. Google
    // requires its attribution to travel with anything it supplied.
    expect(screen.getByText('4.4★ Google · 88 đánh giá')).toBeInTheDocument()
    expect(screen.getByText('Dữ liệu bản đồ ©2026 Google')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dùng dữ liệu này' }))

    expect(screen.getByLabelText(/Tên hiển thị/)).toHaveValue('Cà Phê Bên Đường')
    expect(screen.getByLabelText(/Vĩ độ/)).toHaveValue(10.7951153)
    expect(screen.getByLabelText(/Kinh độ/)).toHaveValue(106.7221002)
  })

  it('sends the Google id and every field left as Google filled it', async () => {
    signInAs('editor')
    resolvesTo(RESOLVED)
    const bodies = createdWith()
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user)
    await user.click(await screen.findByRole('button', { name: 'Dùng dữ liệu này' }))
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({
      googlePlaceId: 'ChIJcafe',
      googleDerivedFields: ['name', 'addressText', 'lat', 'lng'],
    })
  })

  it('drops a field the editor rewrote — copying does not transfer ownership', async () => {
    signInAs('editor')
    resolvesTo(RESOLVED)
    const bodies = createdWith()
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user)
    await user.click(await screen.findByRole('button', { name: 'Dùng dữ liệu này' }))

    const name = screen.getByLabelText(/Tên hiển thị/)
    await user.clear(name)
    await user.type(name, 'Cà Phê Bên Đường (cơ sở 2)')
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    // The position is still Google's; the name is now the editor's own claim.
    expect(bodies[0]!.googleDerivedFields).toEqual(['addressText', 'lat', 'lng'])
  })

  it('opens the place that already holds the link rather than duplicating it', async () => {
    signInAs('editor')
    resolvesTo({
      status: 'ALREADY_EXISTS',
      existingPlaceId: '11111111-2222-3333-4444-555555555555',
      reasonCodes: ['PLACE_ALREADY_LINKED'],
      candidates: [],
    })
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user)

    expect(await screen.findByText('GoGo đã có địa điểm này')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mở địa điểm đã có' }))

    expect(navigate).toHaveBeenCalledWith('/places/11111111-2222-3333-4444-555555555555')
  })

  it('lets the editor pick the branch, and resolves that one', async () => {
    signInAs('editor')
    const asked: unknown[] = []
    server.use(
      http.post('*/cms/places/resolve-link', async ({ request }) => {
        const body = (await request.json()) as { googlePlaceId?: string }
        asked.push(body)
        if (body.googlePlaceId === 'ChIJb') {
          return HttpResponse.json(
            {
              ...RESOLVED,
              candidate: {
                ...RESOLVED.candidate,
                googlePlaceId: 'ChIJb',
                name: 'Highlands Hai Bà Trưng',
              },
            },
            { status: 201 },
          )
        }
        return HttpResponse.json(AMBIGUOUS, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user, 'https://www.google.com/maps/place/Highlands+Coffee')
    expect(await screen.findByText('Link khớp với nhiều chi nhánh')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /88 Hai Bà Trưng/ }))

    // The branch that was picked is the one that comes back — not the first in
    // the list, and not the generic fixture.
    expect(await screen.findByText('Highlands Hai Bà Trưng')).toBeInTheDocument()
    expect(asked[1]).toEqual({ googlePlaceId: 'ChIJb' })

    await user.click(screen.getByRole('button', { name: 'Dùng dữ liệu này' }))
    expect(screen.getByLabelText(/Tên hiển thị/)).toHaveValue('Highlands Hai Bà Trưng')
  })

  it('keeps the other branches on screen when a pick cannot be resolved', async () => {
    signInAs('editor')
    let calls = 0
    server.use(
      http.post('*/cms/places/resolve-link', async () => {
        calls += 1
        if (calls === 1) return HttpResponse.json(AMBIGUOUS, { status: 201 })
        return HttpResponse.json(
          {
            code: 'PLACE_PROVIDER_UNAVAILABLE',
            message: 'Chưa kiểm tra được địa điểm lúc này, thử lại sau.',
            field_errors: [],
            request_id: 'req-pick-503',
            retryable: true,
          },
          { status: 503 },
        )
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user, 'https://www.google.com/maps/place/Highlands+Coffee')
    await user.click(await screen.findByRole('button', { name: /1 Lê Lợi/ }))

    expect(await screen.findByText('Chưa tra được link')).toBeInTheDocument()
    // One bad pick must not empty the panel — the other branch is still there
    // to try, without pasting the link again.
    expect(screen.getByRole('button', { name: /88 Hai Bà Trưng/ })).toBeInTheDocument()
  })

  it('names the branches and offers each as a choice', async () => {
    signInAs('editor')
    resolvesTo({
      status: 'CANDIDATE_SELECTION',
      reasonCodes: ['AMBIGUOUS'],
      candidates: [
        { googlePlaceId: 'ChIJa', name: 'Highlands Coffee', address: '1 Lê Lợi', confidence: 0.62 },
        {
          googlePlaceId: 'ChIJb',
          name: 'Highlands Coffee',
          address: '88 Hai Bà Trưng',
          confidence: 0.6,
        },
      ],
    })
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user, 'https://www.google.com/maps/place/Highlands+Coffee')

    expect(await screen.findByText('Link khớp với nhiều chi nhánh')).toBeInTheDocument()
    // Each branch is a control, named well enough to tell them apart.
    expect(screen.getByRole('button', { name: /1 Lê Lợi/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /88 Hai Bà Trưng/ })).toBeInTheDocument()
    // Nothing to apply yet: no branch has been chosen.
    expect(screen.queryByRole('button', { name: 'Dùng dữ liệu này' })).not.toBeInTheDocument()
  })

  it('does not call one candidate several branches', async () => {
    signInAs('editor')
    resolvesTo({
      status: 'CANDIDATE_SELECTION',
      reasonCodes: [],
      matchConfidence: 0.78,
      candidates: [
        {
          googlePlaceId: 'ChIJ4ps',
          name: "Pizza 4P's Aeon Mall Hà Đông",
          address: 'Dương Nội, Hà Đông, Hà Nội',
          confidence: 0.78,
        },
      ],
    })
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user, 'https://maps.app.goo.gl/18TH9Y8rkdAbsrQs7')

    // The heading has to match what came back. One result under "matches
    // several branches" is a small lie the editor can see.
    expect(await screen.findByText('Có thể là chỗ này')).toBeInTheDocument()
    expect(screen.queryByText('Link khớp với nhiều chi nhánh')).not.toBeInTheDocument()
    // Still a choice, because the server was not confident enough to take it.
    expect(screen.getByRole('button', { name: /Dương Nội/ })).toBeInTheDocument()
  })

  it('refuses to ask the provider about a host that only looks like Google', async () => {
    signInAs('editor')
    const calls = resolvesTo(RESOLVED)
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await user.type(
      screen.getByLabelText('Link Google Maps'),
      'https://maps.google.com.evil.example/?place_id=x',
    )

    expect(
      await screen.findByText('Không phải tên miền Google Maps (maps.google.com.evil.example)'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tìm địa điểm' })).toBeDisabled()
    expect(calls).toHaveLength(0)
  })

  it('keeps the link in the box when the provider is unreachable', async () => {
    signInAs('editor')
    resolvesTo(
      {
        code: 'PLACE_PROVIDER_UNAVAILABLE',
        message: 'Chưa kiểm tra được địa điểm lúc này, thử lại sau.',
        field_errors: [],
        request_id: 'req-503',
        retryable: true,
      },
      503,
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await pasteAndResolve(user)

    // A provider GoGo cannot reach says nothing about the link (GoGo-BE#279):
    // the message must not read as "this place does not exist".
    expect(await screen.findByText('Chưa tra được link')).toBeInTheDocument()
    expect(
      screen.getByText('Chưa kiểm tra được địa điểm lúc này, thử lại sau.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Link Google Maps')).toHaveValue(LINK)
  })

  it('still creates a place typed entirely by hand', async () => {
    signInAs('editor')
    const bodies = createdWith()
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await user.type(screen.getByLabelText(/Tên hiển thị/), 'Quán Không Có Trên Google')
    await user.type(screen.getByLabelText(/Vĩ độ/), '10.7769')
    await user.type(screen.getByLabelText(/Kinh độ/), '106.7009')
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    // No link, no Google keys at all — not an empty array, no key.
    expect(bodies[0]).toEqual({
      name: 'Quán Không Có Trên Google',
      lat: 10.7769,
      lng: 106.7009,
    })
  })
})

/**
 * GoGo-CMS#157, found by clicking it on cms-dev rather than by any test here.
 *
 * The resolve endpoint answered `10.795115299999999` for Landmark 81 — the
 * double nearest to the `10.7951153` Google publishes — and the latitude box
 * rendered all sixteen digits. Nothing was wrong with the value; it just read
 * as broken, which for a coordinate an editor is being asked to trust is the
 * same thing.
 */
describe('coordinate precision', () => {
  it('puts the number back where Google had it', () => {
    expect(roundCoordinate(10.795115299999999)).toBe(10.7951153)
    expect(roundCoordinate(106.72210020000001)).toBe(106.7221002)
    // A whole degree stays whole rather than growing a decimal point.
    expect(roundCoordinate(10)).toBe(10)
    // Seven decimals is roughly a centimetre; an eighth is noise, not precision.
    expect(roundCoordinate(10.12345678)).toBe(10.1234568)
  })
})
