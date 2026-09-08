import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import PlaceListScreen from './placeList.view'

/**
 * ADM-108 — the place list, organised the way the country is.
 *
 * The console offered one way to group places: `area_key`, a curated discovery
 * bucket that is not an address. The canonical province and commune codes
 * ADR-0019 introduced could not be filtered on at all, so an editor could not
 * ask "what do we have in Phường Bến Nghé" — the only question a catalogue of
 * places in Vietnam is actually browsed by.
 *
 * What these hold still is that a count is *clickable*: selecting a row filters
 * the table to precisely the places that row counted, using the same codes the
 * count was computed from. A panel whose numbers cannot be reached by the table
 * beside it is worse than no panel.
 */

const HCM = { code: '79', name: 'Thành phố Hồ Chí Minh' }
const BEN_NGHE = { code: '26734', name: 'Phường Bến Nghé' }
const BEN_THANH = { code: '26737', name: 'Phường Bến Thành' }

const PROVINCE_LEVEL = {
  datasetVersion: 'v5.0.0+v2.4.0+7fac8c45+bnd-1+r0',
  level: 'province',
  province: null,
  units: [
    { code: HCM.code, name: HCM.name, placeCount: 18, reviewCount: 3 },
    { code: '01', name: 'Thành phố Hà Nội', placeCount: 5, reviewCount: 0 },
  ],
  totals: { grouped: 23, review: 4 },
  review: {
    byStatus: { UNMAPPED: 1, NEEDS_REVIEW: 2, REJECTED: 0, STALE: 0, INVALID_HIERARCHY: 1 },
  },
}

const COMMUNE_LEVEL = {
  ...PROVINCE_LEVEL,
  level: 'commune',
  province: HCM,
  units: [
    { code: BEN_NGHE.code, name: BEN_NGHE.name, placeCount: 10, reviewCount: null },
    { code: BEN_THANH.code, name: BEN_THANH.name, placeCount: 8, reviewCount: null },
  ],
}

/** Records what the table actually asked for, which is the whole assertion. */
function wire() {
  const listQueries: URLSearchParams[] = []
  server.use(
    http.get('*/cms/places/administrative-summary', ({ request }) => {
      const url = new URL(request.url)
      return HttpResponse.json(
        url.searchParams.get('provinceCode') ? COMMUNE_LEVEL : PROVINCE_LEVEL,
      )
    }),
    http.get('*/cms/places', ({ request }) => {
      const url = new URL(request.url)
      listQueries.push(url.searchParams)
      return HttpResponse.json({
        items: [
          {
            id: 'pl-1',
            name: 'Cà Phê Bến Nghé',
            status: 'published',
            areaKey: 'hcm_q1',
            rating: 4.4,
            confidence: 0.8,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
            provinceCode: HCM.code,
            provinceName: HCM.name,
            communeCode: BEN_NGHE.code,
            communeName: BEN_NGHE.name,
            administrativeMappingStatus: 'AUTO_MATCHED',
          },
        ],
        nextCursor: null,
      })
    }),
  )
  return listQueries
}

const lastQuery = (queries: URLSearchParams[]) => queries[queries.length - 1]!

describe('the place list, grouped by the canonical hierarchy', () => {
  it('lists provinces with their counts and the release they were read from', async () => {
    signInAs('editor')
    wire()
    renderWithProviders(<PlaceListScreen />)

    const panel = await screen.findByRole('region', { name: 'Tỉnh/Thành phố → Phường/Xã' })
    const province = await within(panel).findByRole('button', { name: /Thành phố Hồ Chí Minh/ })
    expect(province).toHaveTextContent('18')
    // Reported beside the province, never added to its total: a place under
    // review has no commune anyone should trust it under.
    expect(province).toHaveTextContent('3 cần xem xét')
    // 2,212 current commune codes named a different unit before 2025-07-01, so
    // a count without its dataset is not reproducible.
    expect(within(panel).getByText('v5.0.0+v2.4.0+7fac8c45+bnd-1+r0')).toBeInTheDocument()
  })

  it('opens a province onto its communes, and never onto a district', async () => {
    signInAs('editor')
    wire()
    const user = userEvent.setup()
    renderWithProviders(<PlaceListScreen />)

    const panel = await screen.findByRole('region', { name: 'Tỉnh/Thành phố → Phường/Xã' })
    await user.click(await within(panel).findByRole('button', { name: /Thành phố Hồ Chí Minh/ }))

    expect(await within(panel).findByRole('button', { name: /Phường Bến Nghé/ })).toHaveTextContent(
      '10',
    )
    expect(within(panel).getByRole('button', { name: /Phường Bến Thành/ })).toHaveTextContent('8')
    // Two levels, because Vietnam has two. Nothing offers a third.
    expect(within(panel).queryByText(/Quận|Huyện/)).not.toBeInTheDocument()
  })

  it('filters the table to exactly the places a row counted', async () => {
    signInAs('editor')
    const queries = wire()
    const user = userEvent.setup()
    renderWithProviders(<PlaceListScreen />)

    const panel = await screen.findByRole('region', { name: 'Tỉnh/Thành phố → Phường/Xã' })
    await user.click(await within(panel).findByRole('button', { name: /Thành phố Hồ Chí Minh/ }))
    expect(lastQuery(queries).get('provinceCode')).toBe(HCM.code)
    expect(lastQuery(queries).get('administrativeState')).toBe('grouped')
    expect(lastQuery(queries).get('communeCode')).toBeNull()

    await user.click(await within(panel).findByRole('button', { name: /Phường Bến Nghé/ }))
    expect(lastQuery(queries).get('provinceCode')).toBe(HCM.code)
    expect(lastQuery(queries).get('communeCode')).toBe(BEN_NGHE.code)
  })

  it('keeps the unresolved bucket apart, and says what is in it', async () => {
    signInAs('editor')
    const queries = wire()
    const user = userEvent.setup()
    renderWithProviders(<PlaceListScreen />)

    const panel = await screen.findByRole('region', { name: 'Tỉnh/Thành phố → Phường/Xã' })
    const bucket = await within(panel).findByRole('button', {
      name: /Chưa xác định \/ Cần xem xét/,
    })
    expect(bucket).toHaveTextContent('4')
    // Why, not just how many: NEEDS_REVIEW is the resolver unable to decide and
    // INVALID_HIERARCHY is two codes that do not belong together.
    expect(within(panel).getByText('Cần xem xét: 2')).toBeInTheDocument()
    expect(within(panel).getByText('Sai phân cấp: 1')).toBeInTheDocument()

    await user.click(bucket)
    expect(lastQuery(queries).get('administrativeState')).toBe('review')
    expect(lastQuery(queries).get('provinceCode')).toBeNull()
  })

  it('says which unit a row is in, beside the curated collection rather than instead of it', async () => {
    signInAs('editor')
    wire()
    renderWithProviders(<PlaceListScreen />)

    // Both headers, so no one has to guess which column is the address.
    expect(await screen.findByText('Địa chỉ hành chính')).toBeInTheDocument()
    expect(screen.getByText('Khu vực')).toBeInTheDocument()
    expect(screen.getByText(`${HCM.name} · ${BEN_NGHE.name}`)).toBeInTheDocument()
    // The curated key is still there, still its own thing.
    expect(screen.getByText('hcm_q1')).toBeInTheDocument()
  })

  it('lets the selection be undone without reloading the screen', async () => {
    signInAs('editor')
    const queries = wire()
    const user = userEvent.setup()
    renderWithProviders(<PlaceListScreen />)

    const panel = await screen.findByRole('region', { name: 'Tỉnh/Thành phố → Phường/Xã' })
    await user.click(await within(panel).findByRole('button', { name: /Thành phố Hồ Chí Minh/ }))
    await user.click(within(panel).getByRole('button', { name: 'Bỏ lọc theo địa giới' }))

    expect(lastQuery(queries).get('provinceCode')).toBeNull()
    expect(lastQuery(queries).get('administrativeState')).toBeNull()
  })
})
