import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import { verifyPlaceMapping } from '@/features/administrative/api'
import { ApiError } from '@/shared/api/errors'
import { resetMappingModeration } from '@/shared/test/handlers'
import PlaceEditorScreen from './placeEditor.view'

/**
 * PI-CMS-033 — the way out of an `AUTO_MATCHED` blocker, from the screen that
 * shows it.
 *
 * Place Detail said a mapping was the resolver's answer and that the place
 * could not be published until a person confirmed it, and then offered nothing
 * to confirm it with. Every imported place resolved into that dead end.
 *
 * The fix reuses the moderation drawer rather than growing a second
 * verification model, so these tests are about the seam: who is offered the
 * decision, which endpoints it calls, what happens to the blocker afterwards,
 * and what a person who cannot decide is given instead.
 */

const PLACE = places.find((place) => place.id === 'pl-chao-ban')!

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="url">{`${location.pathname}${location.search}`}</span>
}

function openEditor(role: 'editor' | 'moderator' | 'ops_admin' | 'super_admin') {
  signInAs(role)
  return renderWithProviders(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/places/:id" element={<PlaceEditorScreen />} />
      </Routes>
    </>,
    { route: `/places/${PLACE.id}` },
  )
}

async function summary() {
  return (await screen.findByText('Đơn vị hành chính')).closest('section')!
}

/** Records every request to one path, and lets the real handler answer. */
function spyOn(method: 'get' | 'post', path: string) {
  const calls: { url: string; body: unknown }[] = []
  server.use(
    http[method](`*${path}`, async ({ request }) => {
      calls.push({
        url: request.url,
        body: method === 'post' ? await request.clone().json() : null,
      })
      return undefined
    }),
  )
  return calls
}

beforeEach(() => resetMappingModeration())
afterEach(() => window.sessionStorage.clear())

describe('reviewing a place mapping from the editor', () => {
  it('offers the review to a moderator and opens the existing decision drawer', async () => {
    openEditor('moderator')

    const action = await within(await summary()).findByRole('button', {
      name: /Rà soát ánh xạ hành chính/,
    })
    await userEvent.click(action)

    const drawer = await screen.findByRole('dialog', { name: /Chào Bạn/ })
    // The moderation drawer itself — same title, same evidence, same buttons —
    // not a second confirmation model living on the editor's screen.
    expect(within(drawer).getByRole('button', { name: /^Xác nhận$/ })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Từ chối ánh xạ' })).toBeInTheDocument()
  })

  it('shows the reviewer both levels with codes, the source, the dataset and the blocker', async () => {
    openEditor('moderator')
    await userEvent.click(
      await within(await summary()).findByRole('button', { name: /Rà soát ánh xạ/ }),
    )
    const drawer = await screen.findByRole('dialog', { name: /Chào Bạn/ })

    expect(within(drawer).getByText('Thành phố Hồ Chí Minh (79)')).toBeInTheDocument()
    expect(within(drawer).getByText('Phường Bến Nghé (26734)')).toBeInTheDocument()
    expect(within(drawer).getAllByText('boundary_point_in_polygon').length).toBeGreaterThan(0)
    // The active dataset a decision will be validated against, and the state
    // that is blocking publication — both in words, not inferred.
    expect(within(drawer).getAllByText(/v5\.0\.0/).length).toBeGreaterThan(0)
    expect(within(drawer).getAllByText(/Máy khớp/).length).toBeGreaterThan(0)
  })

  it('offers an editor the queue instead of a decision they cannot take', async () => {
    openEditor('editor')
    const panel = await summary()

    // No decision, because the server would refuse one: `permittedActions` for
    // an editor is `view` alone.
    await waitFor(() =>
      expect(
        within(panel).queryByRole('button', { name: /Rà soát ánh xạ/ }),
      ).not.toBeInTheDocument(),
    )
    const link = within(panel).getByRole('link', { name: /hàng đợi duyệt ánh xạ/i })
    // Focused on this place: a blocker with no route out is what this issue was.
    expect(link).toHaveAttribute('href', `/administrative-mapping?status=&place=${PLACE.id}`)
  })

  it('does not offer a review where nothing is blocked', async () => {
    server.use(
      http.get('/v1/cms/places/:id', () =>
        HttpResponse.json({
          ...PLACE,
          administrative: { ...PLACE.administrative, status: 'VERIFIED', approvalBlock: null },
        }),
      ),
    )
    openEditor('moderator')
    const panel = await summary()

    expect(within(panel).getByText('Ánh xạ hành chính không chặn việc đăng.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Rà soát ánh xạ/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('link', { name: /hàng đợi/i })).not.toBeInTheDocument()
  })

  it('verifies through the existing endpoint and clears the blocker on the place', async () => {
    const verified = spyOn('post', '/cms/places/pl-chao-ban/administrative-mapping/verify')
    let mappingReads = 0
    server.use(
      http.get('*/cms/places/:id/administrative-mapping', () => {
        mappingReads += 1
        return undefined
      }),
    )
    openEditor('moderator')
    await userEvent.click(
      await within(await summary()).findByRole('button', { name: /Rà soát ánh xạ/ }),
    )
    const drawer = await screen.findByRole('dialog', { name: /Chào Bạn/ })
    await userEvent.click(within(drawer).getByRole('button', { name: /^Xác nhận$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: /Xác nhận ánh xạ hành chính/ })).getByRole(
        'button',
        { name: /^Xác nhận$/ },
      ),
    )

    await waitFor(() => expect(verified).toHaveLength(1))
    // The reviewer decided about the row they were shown: the place's own
    // `updatedAt` travels as `expectedUpdatedAt`, and the codes are the stored
    // pair rather than anything retyped.
    expect(verified[0]!.body).toMatchObject({
      provinceCode: '79',
      communeCode: '26734',
      expectedUpdatedAt: PLACE.updatedAt,
    })

    // Both queries are invalidated, so the editor's own view of the place stops
    // showing a blocker that is no longer there.
    const readsAfterDecision = mappingReads
    await waitFor(() => expect(mappingReads).toBeGreaterThan(readsAfterDecision - 1))
    await waitFor(() => expect(screen.getAllByText('Đã xác nhận').length).toBeGreaterThan(0))
  })

  it('refuses the decision to an editor even when the request is hand-crafted', async () => {
    // The console hiding a button is not authorization (`.claude/rules/core.md`
    // #5). An editor who calls the endpoint directly gets the server's answer.
    signInAs('editor')
    const error = await verifyPlaceMapping(PLACE.id, {
      provinceCode: '79',
      communeCode: '26734',
      expectedUpdatedAt: PLACE.updatedAt,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
  })

  it('says a rejection is about the mapping, never about the place', async () => {
    openEditor('moderator')
    await userEvent.click(
      await within(await summary()).findByRole('button', { name: /Rà soát ánh xạ/ }),
    )
    const drawer = await screen.findByRole('dialog', { name: /Chào Bạn/ })

    // The sentence a reviewer reads before rejecting has to separate the two:
    // the place keeps its own moderation state, its address and its geometry.
    expect(within(drawer).getByText(/không đăng địa điểm/i)).toBeInTheDocument()
    // And the hint on the editor's own screen says the same thing.
    expect(
      screen.getByText(/Từ chối ánh xạ không từ chối và không xoá địa điểm/),
    ).toBeInTheDocument()
  })

  it('refetches instead of silently retrying when the place moved underneath', async () => {
    const attempts: unknown[] = []
    server.use(
      http.post('*/cms/places/:id/administrative-mapping/verify', async ({ request }) => {
        attempts.push(await request.json())
        return HttpResponse.json(
          {
            code: 'PLACE_MODIFIED',
            message: 'the place changed since it was read',
            field_errors: [],
            request_id: 'req-conflict',
            retryable: false,
          },
          { status: 409 },
        )
      }),
    )
    openEditor('moderator')
    await userEvent.click(
      await within(await summary()).findByRole('button', { name: /Rà soát ánh xạ/ }),
    )
    const drawer = await screen.findByRole('dialog', { name: /Chào Bạn/ })
    await userEvent.click(within(drawer).getByRole('button', { name: /^Xác nhận$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: /Xác nhận ánh xạ hành chính/ })).getByRole(
        'button',
        { name: /^Xác nhận$/ },
      ),
    )

    // One attempt, one message. A retry would decide about a row the reviewer
    // never saw.
    await waitFor(() => expect(attempts).toHaveLength(1))
    expect(await screen.findByText(/đã thay đổi/i)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(attempts).toHaveLength(1)
  })
})
