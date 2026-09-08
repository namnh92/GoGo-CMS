import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import PlaceEditorScreen from './placeEditor.view'
import PlaceCreateScreen from './placeCreate.view'
import PlaceListScreen from './placeList.view'

/**
 * ADM-108 — legacy Area is not a second way to say where a place is.
 *
 * Every Area value GoGo holds is a geographic address grouping, and the audit
 * that settled it is worth writing down because the rule depends on it:
 *
 *   `hcm_q1`       → "Quận 1, TP.HCM"
 *   `hcm_q3`       → "Quận 3, TP.HCM"
 *   `hcm_thuduc`   → "TP. Thủ Đức"
 *   `hn_hoankiem`  → "Hoàn Kiếm, Hà Nội"
 *
 * Three of the four name **districts** — a tier dissolved on 2025-07-01 — and
 * the fourth names a city. `service_areas` itself stores `center_lat`,
 * `center_lng`, `radius_m` and a parent `city`: a circle on a map under an
 * administrative parent, which is what an address grouping is. Nothing in it is
 * a curated product collection, so there is nothing here to rename and keep.
 *
 * Shown beside `province_code` / `commune_code` it is a second answer to "where
 * is this place", it disagrees with the first, and it is out of date by a
 * reorganisation. So no current workflow offers it. `places.area_key` and
 * `service_areas` are untouched — rooms, plans and banners still read them, and
 * a stored value must survive a save that knows nothing about it.
 */

const PLACE = places.find((place) => place.id === 'pl-chao-ban')!

/** Anything an editor could read as "which area is this place in". */
const AREA_WORDING = /khu vực|discovery area|hcm_q1|hcm_q3|hcm_thuduc|hn_hoankiem/i
/** The tier that no longer exists. It is never a level, anywhere. */
const DISTRICT_LEVEL = /quận\/huyện|\bdistrict\b/i

describe('Add place offers one address vocabulary', () => {
  it('has the two canonical selectors and no Area control', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceCreateScreen />)

    expect(await screen.findByLabelText(/Tỉnh \/ thành phố/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Phường \/ xã/)).toBeInTheDocument()
    // Not "hidden", not "relabelled" — absent. A control an editor cannot use
    // to say something true has no business being on the form.
    expect(screen.queryByText(AREA_WORDING)).not.toBeInTheDocument()
    expect(screen.queryByText(DISTRICT_LEVEL)).not.toBeInTheDocument()
  })

  it('never sends an area key for a place created now', async () => {
    signInAs('editor')
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post('*/cms/places', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ ...PLACE }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceCreateScreen />)

    await user.type(screen.getByLabelText(/Tên hiển thị/), 'Quán Mới')
    await user.type(screen.getByLabelText(/Vĩ độ/), '10.77')
    await user.type(screen.getByLabelText(/Kinh độ/), '106.7')
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).not.toHaveProperty('areaKey')
  })
})

describe('Edit place shows one address, and does not disturb the stored area', () => {
  function open() {
    signInAs('editor')
    const sent: Record<string, unknown>[] = []
    server.use(
      // A place that really does carry a legacy area key.
      http.get('/v1/cms/places/:id', () => HttpResponse.json({ ...PLACE, areaKey: 'hcm_q3' })),
      http.patch('/v1/cms/places/:id', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ ...PLACE, areaKey: 'hcm_q3' })
      }),
    )
    renderWithProviders(
      <Routes>
        <Route path="/places/:id" element={<PlaceEditorScreen />} />
      </Routes>,
      { route: `/places/${PLACE.id}` },
    )
    return sent
  }

  it('offers no Area control even for a place that has an area key', async () => {
    open()

    expect(await screen.findByLabelText(/Tỉnh \/ thành phố/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: AREA_WORDING })).not.toBeInTheDocument()
    // The value is not rendered as an address anywhere on the screen either.
    expect(screen.queryByText('hcm_q3')).not.toBeInTheDocument()
  })

  it('leaves the stored value alone on save — absent, never null', async () => {
    const sent = open()
    const user = userEvent.setup()

    const name = await screen.findByLabelText(/Tên hiển thị/)
    await user.clear(name)
    await user.type(name, 'Tên Mới')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ name: 'Tên Mới' })
    /*
     * The distinction the whole compatibility promise rests on: `null` would be
     * an instruction to clear the column, and this form has no business issuing
     * one about a field it does not show. Absent leaves rooms, plans and banners
     * reading exactly what they read before.
     */
    expect(sent[0]).not.toHaveProperty('areaKey')
  })
})

describe('the place list groups by the canonical hierarchy and nothing else', () => {
  it('offers no Area filter and no Area column', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceListScreen />)

    await screen.findByText('Chào Bạn Cafe & Space')
    expect(screen.getByText('Địa chỉ hành chính')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: AREA_WORDING })).not.toBeInTheDocument()
    expect(screen.queryByText('Khu vực')).not.toBeInTheDocument()
    // The fixture place carries `hcm_q3`; the table must not print it.
    expect(screen.queryByText('hcm_q3')).not.toBeInTheDocument()
  })

  it('names exactly one hierarchy, two levels deep', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceListScreen />)

    const panel = await screen.findByRole('region', { name: 'Tỉnh/Thành phố → Phường/Xã' })
    expect(panel).toBeInTheDocument()
    // One grouping panel on the screen, and no district anywhere in it.
    expect(screen.getAllByRole('region', { name: /→/ })).toHaveLength(1)
    expect(screen.queryByText(DISTRICT_LEVEL)).not.toBeInTheDocument()
  })
})
