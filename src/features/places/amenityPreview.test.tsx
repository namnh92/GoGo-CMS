import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import PlaceListScreen from './placeList.view'

const taxonomies = [
  {
    id: 'tax-a',
    kind: 'amenity',
    key: 'wifi',
    labels: { vi: 'Wi-Fi', en: 'Wireless' },
    isActive: true,
  },
  { id: 'tax-b', kind: 'amenity', key: 'parking', labels: { vi: 'Chỗ đỗ xe' }, isActive: true },
  { id: 'tax-off', kind: 'amenity', key: 'retired', labels: { vi: 'Đã tắt' }, isActive: false },
  { id: 'tax-category', kind: 'category', key: 'cafe', labels: { vi: 'Cà phê' }, isActive: true },
]
const row = (id: string, name: string) => ({
  id,
  name,
  status: 'published',
  confidence: 0.8,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})
const error = { code: 'FORBIDDEN', message: 'Denied', request_id: 'amenity-test', retryable: false }

function mount() {
  signInAs('editor')
  return renderWithProviders(<PlaceListScreen />)
}

function taxonomyHandler() {
  server.use(
    http.get('/v1/cms/taxonomies', ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('kind')).toBe('amenity')
      expect(url.searchParams.get('isActive')).toBe('true')
      return HttpResponse.json(taxonomies)
    }),
  )
}

describe('catalog amenity preview', () => {
  it('limits selection to ten active keys and allows deselection at the limit', async () => {
    server.use(
      http.get('/v1/cms/taxonomies', () =>
        HttpResponse.json(
          Array.from({ length: 11 }, (_, index) => ({
            id: `tax-${index}`,
            kind: 'amenity',
            key: `key_${index}`,
            labels: { vi: `Tiện ích ${index}` },
            isActive: true,
          })),
        ),
      ),
    )
    const user = userEvent.setup()
    mount()
    const filter = within(await screen.findByRole('group', { name: 'Tiện ích' }))
    for (let index = 0; index < 10; index++) {
      await user.click(await filter.findByRole('checkbox', { name: `Tiện ích ${index}` }))
    }
    expect(filter.getByRole('checkbox', { name: 'Tiện ích 10' })).toBeDisabled()
    await user.click(filter.getByRole('checkbox', { name: 'Tiện ích 0' }))
    expect(filter.getByRole('checkbox', { name: 'Tiện ích 10' })).toBeEnabled()
  })

  it('resolves taxonomy labels in English with Vietnamese fallback', async () => {
    taxonomyHandler()
    window.localStorage.setItem('gogo.cms.locale', 'en')
    mount()
    expect(await screen.findByRole('checkbox', { name: 'Wireless' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Chỗ đỗ xe' })).toBeInTheDocument()
  })

  it('shows loading instead of the previous rows during a filtered request', async () => {
    taxonomyHandler()
    server.use(
      http.get('/v1/cms/places', async ({ request }) => {
        if (new URL(request.url).searchParams.has('amenities')) await delay('infinite')
        return HttpResponse.json({ items: [row('one', 'Kết quả trước')], nextCursor: null })
      }),
    )
    const user = userEvent.setup()
    mount()
    await screen.findByText('Kết quả trước')
    await user.click(await screen.findByRole('checkbox', { name: 'Wi-Fi' }))
    expect(screen.queryByText('Kết quả trước')).not.toBeInTheDocument()
    expect(await screen.findByText('Đang tải…')).toBeInTheDocument()
  })

  it('uses taxonomy keys, intersects filters, resets paging and selection, removes chips and clears', async () => {
    taxonomyHandler()
    const requests: URL[] = []
    server.use(
      http.get('/v1/cms/places/administrative-summary', () =>
        HttpResponse.json({
          datasetVersion: 'test',
          level: 'province',
          province: null,
          units: [{ code: '79', name: 'Hồ Chí Minh', placeCount: 1, reviewCount: 0 }],
          totals: { grouped: 1, review: 0 },
          review: {
            byStatus: { UNMAPPED: 0, NEEDS_REVIEW: 0, REJECTED: 0, STALE: 0, INVALID_HIERARCHY: 0 },
          },
        }),
      ),
      http.get('/v1/cms/places', ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        const amenities = url.searchParams.get('amenities')
        return HttpResponse.json({
          items: [
            row(
              'one',
              amenities === 'parking,wifi' ? 'Khớp cả hai' : amenities ? 'Có Wi-Fi' : 'Toàn bộ',
            ),
          ],
          nextCursor: url.searchParams.has('cursor') ? null : 'page-two',
        })
      }),
    )
    const user = userEvent.setup()
    mount()
    await screen.findByText('Toàn bộ')
    await user.selectOptions(screen.getByLabelText('Nguồn dữ liệu'), 'manual')
    await user.click(await screen.findByRole('button', { name: /Hồ Chí Minh/ }))
    await user.click(await screen.findByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('cursor')).toBe('page-two'))
    await user.click(await screen.findByRole('checkbox', { name: 'Toàn bộ' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Wi-Fi' }))
    expect(await screen.findByText('Có Wi-Fi')).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('cursor')).toBeNull()
    expect(requests.at(-1)?.searchParams.get('source')).toBe('manual')
    expect(requests.at(-1)?.searchParams.get('provinceCode')).toBe('79')
    expect(requests.at(-1)?.searchParams.get('administrativeState')).toBe('grouped')
    expect(screen.getByText(/Số lượng theo địa giới chưa áp dụng/)).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Áp dụng thao tác cho các mục đã chọn' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Đã tắt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Cà phê' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Chỗ đỗ xe' }))
    expect(await screen.findByText('Khớp cả hai')).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('amenities')).toBe('parking,wifi')
    await user.click(screen.getByRole('button', { name: 'Bỏ tiện ích Chỗ đỗ xe' }))
    await screen.findByText('Có Wi-Fi')
    expect(screen.getByRole('checkbox', { name: 'Chỗ đỗ xe' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Xoá lọc tiện ích' }))
    await screen.findByText('Toàn bộ')
    expect(requests.at(-1)?.searchParams.has('amenities')).toBe(false)
  })

  it.each([
    [200, 'Chưa có dữ liệu'],
    [403, 'Không đủ quyền'],
    [500, 'Không tải được dữ liệu'],
  ])('renders a filtered list response %s', async (status, message) => {
    taxonomyHandler()
    server.use(
      http.get('/v1/cms/places', ({ request }) => {
        if (!new URL(request.url).searchParams.has('amenities')) {
          return HttpResponse.json({ items: [row('one', 'Trước khi lọc')], nextCursor: null })
        }
        return HttpResponse.json(status === 200 ? { items: [], nextCursor: null } : error, {
          status,
        })
      }),
    )
    const user = userEvent.setup()
    mount()
    await screen.findByText('Trước khi lọc')
    await user.click(await screen.findByRole('checkbox', { name: 'Wi-Fi' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByText('Trước khi lọc')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xoá lọc tiện ích' })).toBeEnabled()
  })

  it.each([
    [200, 'Chưa có tiện ích đang hoạt động'],
    [403, 'Không đủ quyền'],
    [500, 'Không tải được dữ liệu'],
  ])('renders taxonomy response %s', async (status, message) => {
    server.use(
      http.get('/v1/cms/taxonomies', () =>
        HttpResponse.json(status === 200 ? [] : error, { status }),
      ),
    )
    mount()
    const filter = await screen.findByRole('group', { name: 'Tiện ích' })
    expect(await within(filter).findByText(message)).toBeInTheDocument()
  })

  it('renders loading while the taxonomy is pending', async () => {
    server.use(
      http.get('/v1/cms/taxonomies', async () => {
        await delay('infinite')
        return HttpResponse.json([])
      }),
    )
    mount()
    expect(
      within(await screen.findByRole('group', { name: 'Tiện ích' })).getByRole('status'),
    ).toBeInTheDocument()
  })
})
