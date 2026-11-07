import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { mockDb, resetMockDb } from '@/shared/test/handlers'
import { server } from '@/shared/test/server'
import type { Schemas } from '@/shared/api/generated'
import { contributionEnrichmentSchema } from '@/shared/api/contracts'
import { SubmissionReviewDrawer } from './submissionReview.view'
import { SubmissionEnrichment } from './submissionEnrichment.view'

const ID = '9a1d0c00-0000-4000-8000-000000000001'
const enrichment: Schemas['ContributionEnrichment'] = {
  price: { min: 50000, max: 150000, currency: 'VND', unit: 'per_group' },
  purposeKeys: ['date'],
  vibeKeys: ['calm'],
  amenities: { wifi: false, parking: true },
  photos: [
    { mediaId: 'menu-media', kind: 'menu' },
    { mediaId: 'bill-media', kind: 'bill' },
  ],
  billPhotoPublicConsent: true,
  recommendedDishes: 'Trà sen',
  visitTips: 'Đến trước 18h',
  service: { rating: 4, chipKeys: ['friendly'] },
  space: { rating: 3, chipKeys: [] },
}
const photos: Schemas['SubmissionPhoto'][] = [
  {
    id: 'menu-photo',
    mediaId: 'menu-media',
    width: 800,
    height: 600,
    status: 'pending',
    url: null,
  },
  {
    id: 'bill-photo',
    mediaId: 'bill-media',
    width: 800,
    height: 600,
    status: 'pending',
    url: null,
  },
  {
    id: 'other-photo',
    mediaId: 'other-media',
    width: 800,
    height: 600,
    status: 'pending',
    url: null,
  },
]

beforeEach(() => {
  resetMockDb()
  signInAs('moderator')
  const taxonomies = (
    [
      ['suitability', 'date', 'Hẹn hò', 'Date'],
      ['mood', 'calm', 'Yên tĩnh', 'Calm'],
      ['amenity', 'wifi', 'Mạng không dây', 'Wireless internet'],
      ['amenity', 'parking', 'Chỗ đỗ xe', 'Parking'],
      ['checkin_tag', 'friendly', 'Thân thiện', 'Friendly'],
    ] as const
  ).map(([kind, key, labelVi, en], index) => ({
    id: `taxonomy-${index}`,
    kind,
    key,
    labels: { vi: labelVi, en },
    sortOrder: index,
    isActive: true,
    usageCount: 0,
    synonyms: [],
  }))
  server.use(
    http.get('/v1/cms/taxonomies', () => HttpResponse.json(taxonomies)),
    http.post('/v1/cms/place-submissions/:id/credit-preview', async ({ request }) => {
      const body = (await request.json()) as { enrichmentSelection: Schemas['EnrichmentSelection'] }
      // Deliberately unlike historic rates: the client must display server facts.
      return HttpResponse.json(
        {
          expectedCredit: body.enrichmentSelection.keptPhotoMediaIds.length
            ? { base: 63, photoBonus: 17, total: 80 }
            : { base: 63, photoBonus: 0, total: 63 },
        },
        { status: 201 },
      )
    }),
  )
})
function wizardDetail() {
  const data = mockDb.submissionDetails[ID] as Record<string, unknown>
  data.contribution = { enrichment: structuredClone(enrichment), verificationStatus: 'unverified' }
  data.photos = structuredClone(photos)
  data.fromRegisteredUser = true
  data.enrichmentItems = {
    factKeys: [
      'price',
      'purposeKeys:date',
      'vibeKeys:calm',
      'amenities:wifi',
      'amenities:parking',
      'recommendedDishes',
      'visitTips',
      'service.rating',
      'service.chipKeys:friendly',
      'space.rating',
    ],
    photoMediaIds: ['menu-media', 'bill-media'],
  }
  data.expectedCredit = { base: 63, photoBonus: 17, total: 80 }
  return data
}
function open() {
  return renderWithProviders(<SubmissionReviewDrawer submissionId={ID} onClose={vi.fn()} />)
}

describe('wizard contribution detail (#284)', () => {
  it('preserves enrichment at the validation boundary, including false and optional ratings', () => {
    expect(contributionEnrichmentSchema.parse(enrichment)).toEqual(enrichment)
    const withoutRatings = { ...enrichment }
    delete withoutRatings.service
    delete withoutRatings.space
    expect(contributionEnrichmentSchema.parse(withoutRatings)).not.toHaveProperty('service')
    expect(
      contributionEnrichmentSchema.safeParse({
        ...enrichment,
        service: { rating: 0, chipKeys: [] },
      }).success,
    ).toBe(false)
  })

  it('shows all facts with CMS locale labels, explicit no, price unit, and optional ratings', async () => {
    wizardDetail()
    open()
    const panel = await screen.findByRole('region', { name: 'Dữ liệu bổ sung từ người đóng góp' })
    await within(panel).findByText('Hẹn hò')
    expect(within(panel).getByText('Yên tĩnh')).toBeInTheDocument()
    expect(within(panel).getByText('Mạng không dây')).toBeInTheDocument()
    expect(within(panel).getByText('Không')).toBeInTheDocument()
    expect(within(panel).getByText('Có')).toBeInTheDocument()
    expect(within(panel).getByText('50.000–150.000 VND / nhóm')).toBeInTheDocument()
    expect(within(panel).getByText('Trà sen')).toBeInTheDocument()
    expect(within(panel).getByText('Đến trước 18h')).toBeInTheDocument()
    expect(within(panel).getByText('Thân thiện')).toBeInTheDocument()
    expect(within(panel).getByText('Đánh giá không gian của người đóng góp')).toBeInTheDocument()
  })

  it('omits absent ratings and price rather than inventing values', async () => {
    renderWithProviders(
      <SubmissionEnrichment enrichment={{ purposeKeys: ['date'], vibeKeys: ['calm'] }} />,
    )
    await screen.findByText('Hẹn hò')
    expect(screen.queryByText('Đánh giá dịch vụ của người đóng góp')).not.toBeInTheDocument()
    expect(screen.queryByText('Đánh giá không gian của người đóng góp')).not.toBeInTheDocument()
    expect(screen.queryByText('Giá và đơn vị')).not.toBeInTheDocument()
  })

  it('shows empty legacy enrichment', async () => {
    renderWithProviders(<SubmissionEnrichment />)
    expect(await screen.findByText('Không có dữ liệu wizard')).toBeInTheDocument()
  })

  it('uses English CMS labels and public-photo copy', async () => {
    window.localStorage.setItem('gogo.cms.locale', 'en')
    wizardDetail()
    open()
    await screen.findByText('Wireless internet')
    expect(screen.getByText(/Users consented.*PUBLIC/)).toHaveTextContent(
      'no DLP or automatic personal-data masking',
    )
    expect(screen.getByText('Menu photo')).toBeInTheDocument()
    expect(screen.getByText('Bill photo')).toBeInTheDocument()
    expect(screen.getByText(/Users consented.*PUBLIC/)).toHaveTextContent(
      'USER photos in the review section',
    )
  })

  it('approves partial keep with stable keys and media IDs, separating ordinary photo IDs', async () => {
    wizardDetail()
    const user = userEvent.setup()
    open()
    await screen.findByText('Hẹn hò')
    await user.click(screen.getByRole('checkbox', { name: 'Giữ Mạng không dây: Không' }))
    await user.click(screen.getByRole('checkbox', { name: 'Giữ ảnh 1' }))
    await user.type(screen.getByLabelText('Lý do quyết định'), 'Đã kiểm tra')
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(mockDb.decisions).toHaveLength(1))
    expect(mockDb.decisions[0]).toMatchObject({
      decision: 'approved',
      approvedPhotoIds: ['other-photo'],
      enrichmentSelection: {
        keptFactKeys: [
          'price',
          'purposeKeys:date',
          'vibeKeys:calm',
          'amenities:parking',
          'recommendedDishes',
          'visitTips',
          'service.rating',
          'service.chipKeys:friendly',
          'space.rating',
        ],
        keptPhotoMediaIds: ['bill-media'],
      },
    })
  })

  it('sends explicit empty arrays when every fact and photo is dropped', async () => {
    wizardDetail()
    const user = userEvent.setup()
    open()
    await screen.findByText('Hẹn hò')
    for (const checkbox of screen.getAllByRole('checkbox', { name: /^Giữ / }))
      await user.click(checkbox)
    await user.type(screen.getByLabelText('Lý do quyết định'), 'Bỏ toàn bộ')
    await user.click(screen.getByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(mockDb.decisions).toHaveLength(1))
    expect(mockDb.decisions[0]).toMatchObject({
      decision: 'approved',
      approvedPhotoIds: [],
      enrichmentSelection: { keptFactKeys: [], keptPhotoMediaIds: [] },
    })
  })

  it('merges with the same explicit selection and a catalogue target', async () => {
    wizardDetail()
    const user = userEvent.setup()
    open()
    await screen.findByText('Hẹn hò')
    await user.click(screen.getByRole('checkbox', { name: 'Giữ Mạng không dây: Không' }))
    await user.click(screen.getByRole('checkbox', { name: 'Giữ ảnh 2' }))
    await user.type(screen.getByLabelText('Lý do quyết định'), 'Đã kiểm tra')
    await user.type(screen.getByLabelText(/Tìm địa điểm để gộp vào/), 'Chào')
    await user.click(await screen.findByRole('button', { name: /Chào Bạn/ }))
    await user.click(screen.getByRole('button', { name: 'Gộp' }))
    await waitFor(() => expect(mockDb.decisions).toHaveLength(1))
    expect(mockDb.decisions[0]).toMatchObject({
      decision: 'merged',
      approvedPhotoIds: ['other-photo'],
      enrichmentSelection: {
        keptFactKeys: [
          'price',
          'purposeKeys:date',
          'vibeKeys:calm',
          'amenities:parking',
          'recommendedDishes',
          'visitTips',
          'service.rating',
          'service.chipKeys:friendly',
          'space.rating',
        ],
        keptPhotoMediaIds: ['menu-media'],
      },
    })
    expect(mockDb.decisions[0]!['mergeIntoPlaceId']).toBeTruthy()
  })

  it('blocks while credit loads, shows a retryable error, then renders server facts', async () => {
    wizardDetail()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let attempts = 0
    server.use(
      http.post('/v1/cms/place-submissions/:id/credit-preview', async () => {
        attempts += 1
        if (attempts === 1) {
          await pending
          return HttpResponse.json(
            { code: 'UNAVAILABLE', message: 'Unavailable', retryable: true },
            { status: 503 },
          )
        }
        return HttpResponse.json(
          { expectedCredit: { base: 11, photoBonus: 9, total: 20 } },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    open()
    await screen.findByText('Hẹn hò')
    await user.type(screen.getByLabelText('Lý do quyết định'), 'Đã kiểm tra')
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()
    release()
    const retry = await screen.findByRole('button', { name: 'Thử lại' })
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled()
    await user.click(retry)
    expect(await screen.findByText(/cơ bản 11 \+ thưởng ảnh 9 = 20/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeEnabled()
  })

  it('keeps wizard approval blocked when moderation items are missing from detail', async () => {
    const data = wizardDetail()
    delete data.enrichmentItems
    const user = userEvent.setup()
    open()
    await screen.findByText('Hẹn hò')
    await user.type(screen.getByLabelText('Lý do quyết định'), 'Đã kiểm tra')
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled()
    expect(screen.getByText(/Chưa tải được danh sách thông tin/)).toBeInTheDocument()
  })

  it('blocks approval and hides selections when credit preview denies permission', async () => {
    wizardDetail()
    server.use(
      http.post('/v1/cms/place-submissions/:id/credit-preview', () =>
        HttpResponse.json({ code: 'FORBIDDEN', message: 'Denied' }, { status: 403 }),
      ),
    )
    const user = userEvent.setup()
    open()
    await screen.findByText('Không đủ quyền')
    await user.type(screen.getByLabelText('Lý do quyết định'), 'Đã kiểm tra')
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled()
    expect(screen.queryByRole('checkbox', { name: /^Giữ / })).not.toBeInTheDocument()
    expect(mockDb.decisions).toHaveLength(0)
  })

  it('stops decision and selection controls after a mid-session 403', async () => {
    wizardDetail()
    let calls = 0
    server.use(
      http.post('/v1/cms/place-submissions/:id/decide', () => {
        calls += 1
        return HttpResponse.json({ code: 'FORBIDDEN', message: 'Denied' }, { status: 403 })
      }),
    )
    const user = userEvent.setup()
    open()
    await screen.findByText('Hẹn hò')
    await user.type(screen.getByLabelText('Lý do quyết định'), 'Đã kiểm tra')
    await user.click(screen.getByRole('button', { name: 'Duyệt' }))
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /^Giữ / })).not.toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('updates the photo bonus only for kept menu/bill evidence and explains public placement', async () => {
    wizardDetail()
    const user = userEvent.setup()
    open()
    expect(await screen.findByText(/cơ bản 63 \+ thưởng ảnh 17 = 80/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Giữ ảnh 1' }))
    expect(await screen.findByText(/cơ bản 63 \+ thưởng ảnh 17 = 80/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Giữ ảnh 2' }))
    expect(await screen.findByText(/cơ bản 63 \+ thưởng ảnh 0 = 63/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Giữ ảnh 3' })).toBeChecked()
    expect(screen.getByText(/Ảnh thực đơn\/hóa đơn đã được/)).toHaveTextContent(
      'không vào thư viện chính thức hay ảnh bìa',
    )
  })

  it('renders loading then a retryable taxonomy error', async () => {
    server.use(
      http.get('/v1/cms/taxonomies', async () => {
        await delay(100)
        return HttpResponse.json(
          { code: 'UNAVAILABLE', message: 'Unavailable', retryable: true },
          { status: 503 },
        )
      }),
    )
    renderWithProviders(<SubmissionEnrichment enrichment={enrichment} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })

  it('renders permission denied when taxonomy access is revoked', async () => {
    server.use(
      http.get('/v1/cms/taxonomies', () =>
        HttpResponse.json({ code: 'FORBIDDEN', message: 'Denied' }, { status: 403 }),
      ),
    )
    renderWithProviders(<SubmissionEnrichment enrichment={enrichment} />)
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })

  it('shows enrichment to read-only staff without decision controls', async () => {
    wizardDetail()
    signInAs('ops_admin')
    open()
    await screen.findByText('Hẹn hò')
    expect(screen.queryByRole('checkbox', { name: /^Giữ / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
  })
})
