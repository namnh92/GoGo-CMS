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
import { submissionCreditPreview } from './submissionCredits'

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
  server.use(http.get('/v1/cms/taxonomies', () => HttpResponse.json(taxonomies)))
})
function wizardDetail() {
  const data = mockDb.submissionDetails[ID] as Record<string, unknown>
  data.contribution = { enrichment: structuredClone(enrichment), verificationStatus: 'unverified' }
  data.photos = structuredClone(photos)
  data.fromRegisteredUser = true
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

  it('blocks wizard approval and merge with the contract gap while rejection remains usable', async () => {
    wizardDetail()
    const user = userEvent.setup()
    open()
    await screen.findByText('Hẹn hò')
    await user.type(screen.getByLabelText('Lý do quyết định'), 'Đã kiểm tra')
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Gộp' })).toBeDisabled()
    expect(screen.getByText(/Chưa thể duyệt hoặc gộp đóng góp wizard/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Lý do từ chối'), 'inappropriate_content')
    await user.click(screen.getByRole('button', { name: 'Từ chối' }))
    await waitFor(() =>
      expect(mockDb.decisions[0]).toMatchObject({
        decision: 'rejected',
        rejectionReason: 'inappropriate_content',
      }),
    )
  })

  it('updates the photo bonus only for kept menu/bill evidence and explains public placement', async () => {
    wizardDetail()
    const user = userEvent.setup()
    open()
    expect(await screen.findByText(/cơ bản 50 \+ thưởng ảnh 20 = 70/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Giữ ảnh 1' }))
    expect(screen.getByText(/cơ bản 50 \+ thưởng ảnh 20 = 70/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Giữ ảnh 2' }))
    expect(screen.getByText(/cơ bản 50 \+ thưởng ảnh 0 = 50/)).toBeInTheDocument()
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
    expect(screen.queryByRole('checkbox', { name: /Giữ ảnh/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
  })
})

describe('contract credit rates', () => {
  it('awards no guest credits and never counts non-evidence photos or decided photos', () => {
    expect(submissionCreditPreview(false, enrichment, photos, []).total).toBe(0)
    expect(submissionCreditPreview(true, undefined, photos, []).total).toBe(50)
    expect(
      submissionCreditPreview(
        true,
        enrichment,
        photos.map((photo) => ({ ...photo, status: 'approved' })),
        [],
      ).bonus,
    ).toBe(0)
    expect(
      submissionCreditPreview(true, enrichment, photos, ['menu-photo', 'bill-photo']).bonus,
    ).toBe(0)
    expect(submissionCreditPreview(true, enrichment, photos, ['bill-photo']).bonus).toBe(20)
  })
})
