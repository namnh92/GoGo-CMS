import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import { mockDb, resetMockDb } from '@/shared/test/handlers'
import type { CmsPlaceDetail } from '@/shared/api/contracts'
import SubmissionQueueScreen from '@/features/submissions/submissionQueue.view'
import PlaceEditorScreen from './placeEditor.view'
import { evidenceGroup, giveEvidence } from './contactEvidence.testkit'

/**
 * GoGo-BE#280 — address, phone and website are GoGo's own data, written only
 * with independent evidence. Before this change the console sent bare values
 * and every such save came back `400 provenance.<field> required`.
 */

const PLACE = places.find((place) => place.id === 'pl-chao-ban')!

function EditorRoute() {
  return (
    <Routes>
      <Route path="/places/:id" element={<PlaceEditorScreen />} />
    </Routes>
  )
}

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
  renderWithProviders(<EditorRoute />, { route: `/places/${PLACE.id}` })
  return sent
}

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole('button', { name: 'Lưu thông tin' }))

beforeEach(() => resetMockDb())

describe('contact evidence on the place editor (GoGo-BE#280)', () => {
  it('asks for a source only once a contact value is being changed', async () => {
    const user = userEvent.setup()
    openCaptured()
    const phone = await screen.findByLabelText('Điện thoại')
    expect(evidenceGroup('Điện thoại')).not.toBeInTheDocument()

    await user.clear(phone)
    await user.type(phone, '028 3822 9999')
    expect(evidenceGroup('Điện thoại')).toBeInTheDocument()
    // Undoing the change takes the question away again.
    await user.clear(phone)
    await user.type(phone, '+842839301234')
    expect(evidenceGroup('Điện thoại')).not.toBeInTheDocument()
  })

  it('refuses a changed value without its source, on the empty boxes, sending nothing', async () => {
    const user = userEvent.setup()
    const sent = openCaptured()
    const phone = await screen.findByLabelText('Điện thoại')
    await user.clear(phone)
    await user.type(phone, '028 3822 9999')
    await save(user)

    const group = within(evidenceGroup('Điện thoại')!)
    expect(await group.findAllByText('Bắt buộc khi lưu giá trị này')).toHaveLength(3)
    expect(group.getByLabelText('Loại nguồn')).toHaveAttribute('aria-invalid', 'true')
    expect(group.getByLabelText('Loại nguồn')).toHaveFocus()
    expect(sent).toHaveLength(0)
  })

  it('sends the value with its evidence and the loaded version', async () => {
    const user = userEvent.setup()
    const sent = openCaptured({ updatedAt: '2026-02-02T02:02:02.000Z' })
    const phone = await screen.findByLabelText('Điện thoại')
    await user.clear(phone)
    await user.type(phone, '028 3822 9999')
    await giveEvidence(user, 'Điện thoại', {
      sourceType: 'community',
      sourceReference: 'Chủ quán nhắn qua Zalo',
    })
    await save(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      phone: '028 3822 9999',
      expectedUpdatedAt: '2026-02-02T02:02:02.000Z',
      provenance: {
        phone: { sourceType: 'community', sourceReference: 'Chủ quán nhắn qua Zalo' },
      },
    })
    const collectedAt = (sent[0]!.provenance as { phone: { collectedAt: string } }).phone
      .collectedAt
    expect(collectedAt).toBe(new Date('2026-09-30T09:00').toISOString())
  })

  it('clears with null and no evidence', async () => {
    const user = userEvent.setup()
    const sent = openCaptured()
    await user.clear(await screen.findByLabelText('Website'))
    expect(evidenceGroup('Website')).not.toBeInTheDocument()
    await save(user)

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ website: null })
    expect(sent[0]).not.toHaveProperty('provenance')
  })

  it('puts a Google reference refusal from the server on the reference box', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    // The live mock, which mirrors GoGo-BE's evidence rule.
    renderWithProviders(<EditorRoute />, { route: `/places/${PLACE.id}` })
    const phone = await screen.findByLabelText('Điện thoại')
    await user.clear(phone)
    await user.type(phone, '028 3822 9999')
    const group = await giveEvidence(user, 'Điện thoại', {
      sourceReference: 'https://maps.google.com/?cid=123',
    })
    await save(user)

    expect(
      await group.findByText('Google không phải nguồn độc lập — ghi nguồn gốc thật'),
    ).toBeInTheDocument()
    expect(group.getByLabelText('Tham chiếu nguồn')).toHaveAttribute('aria-invalid', 'true')
  })

  it('saves against the live mock and reads the field back as GoGo-owned', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    renderWithProviders(<EditorRoute />, { route: `/places/${PLACE.id}` })
    const address = await screen.findByLabelText(/Địa chỉ \(dạng tự do\)/)
    await user.clear(address)
    await user.type(address, '1 Lê Duẩn, Bến Nghé')
    await giveEvidence(user, 'Địa chỉ (dạng tự do)', { sourceReference: 'Khảo sát tại quán' })
    await save(user)

    expect(await screen.findByText('Đã lưu thông tin định danh')).toBeInTheDocument()
    const box = within(
      (await screen.findByText(/Nguồn của từng trường/)).closest('section') as HTMLElement,
    )
    await waitFor(() =>
      expect(box.getByText('Dữ liệu GoGo (có nguồn độc lập)')).toBeInTheDocument(),
    )
    // The question goes away with the write it was for.
    expect(evidenceGroup('Địa chỉ (dạng tự do)')).not.toBeInTheDocument()
  })
})

describe('contact ownership on the place editor (GoGo-BE#280)', () => {
  const provenanceBox = async () =>
    within((await screen.findByText(/Nguồn của từng trường/)).closest('section') as HTMLElement)

  it('says Google for a legacy Google value and unknown for an unsourced one', async () => {
    openCaptured({
      provenance: {
        phone: {
          sourceType: 'google_derived',
          sourceReference: 'google:x',
          verifiedAt: null,
          ownership: 'google',
        },
        website: { sourceType: 'editorial', sourceReference: null, verifiedAt: null },
        addressText: {
          sourceType: 'editorial',
          sourceReference: 'Gọi chủ quán',
          verifiedAt: '2026-09-30T02:00:00.000Z',
          collectedAt: '2026-09-30T02:00:00.000Z',
          ownership: 'gogo',
        },
      },
    })
    const box = await provenanceBox()
    expect(box.getByText('Từ Google (dữ liệu cũ)')).toBeInTheDocument()
    expect(box.getByText('Dữ liệu GoGo (có nguồn độc lập)')).toBeInTheDocument()
    // A legacy "editorial" row with no evidence must not read as verified.
    expect(box.getByText('Chưa rõ nguồn — không phải GoGo xác minh')).toBeInTheDocument()
    expect(box.getByText(/thu thập/)).toBeInTheDocument()
  })

  it('reads an unrecognised verdict as unknown, never as GoGo', async () => {
    openCaptured({
      provenance: {
        phone: { sourceType: 'editorial', sourceReference: 'x', verifiedAt: null, ownership: 'x' },
      },
    })
    const box = await provenanceBox()
    expect(box.getByText('Chưa rõ nguồn — không phải GoGo xác minh')).toBeInTheDocument()
    expect(box.queryByText('Dữ liệu GoGo (có nguồn độc lập)')).not.toBeInTheDocument()
  })
})

function SubmissionRoutes() {
  return (
    <Routes>
      <Route path="/submissions/:submissionId" element={<SubmissionQueueScreen />} />
    </Routes>
  )
}

const REVIEWED_ID = '9a1d0c00-0000-4000-8000-000000000002'

async function openReview() {
  signInAs('moderator')
  renderWithProviders(<SubmissionRoutes />, { route: `/submissions/${REVIEWED_ID}` })
  const dialog = await screen.findByRole('dialog', { name: /Kiểm duyệt đề xuất/ })
  await within(dialog).findByRole('heading', { name: 'Định danh' })
  await waitFor(() =>
    expect(within(dialog).getByLabelText(/Tên hiển thị/)).toHaveValue('Cà phê Ngọc Hà'),
  )
  return dialog
}

describe('contact evidence on the submission review (GoGo-BE#280)', () => {
  it('saves a supplemented phone with its evidence', async () => {
    const user = userEvent.setup()
    const dialog = await openReview()
    await user.type(within(dialog).getByLabelText(/^Điện thoại/), '024 3456 7890')
    await giveEvidence(user, 'Điện thoại', {}, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bổ sung' }))

    await waitFor(() => expect(mockDb.reviewSaves).toHaveLength(1))
    expect(mockDb.reviewSaves[0]!.draft).toMatchObject({
      phone: '024 3456 7890',
      provenance: {
        phone: { sourceType: 'editorial', sourceReference: 'Gọi chủ quán ngày 30/09' },
      },
    })
  })

  it('refuses to save a contact value without a source', async () => {
    const user = userEvent.setup()
    const dialog = await openReview()
    await user.type(within(dialog).getByLabelText(/^Website/), 'ngocha.vn')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bổ sung' }))

    const group = within(evidenceGroup('Website', dialog)!)
    expect(await group.findAllByText('Bắt buộc khi lưu giá trị này')).toHaveLength(3)
    expect(mockDb.reviewSaves).toHaveLength(0)
  })

  it('re-sends stored evidence for an untouched value on the next save', async () => {
    const user = userEvent.setup()
    const id = REVIEWED_ID
    const detail = mockDb.submissionDetails[id] as { review: { draft: Record<string, unknown> } }
    detail.review.draft = {
      ...detail.review.draft,
      phone: '+842434567890',
      provenance: {
        phone: {
          sourceType: 'editorial',
          sourceReference: 'Gọi chủ quán',
          collectedAt: '2026-09-30T02:00:00.000Z',
        },
      },
    }
    const dialog = await openReview()
    expect(evidenceGroup('Điện thoại', dialog)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Mô tả/), ' Thêm chỗ đậu xe.')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bổ sung' }))

    await waitFor(() => expect(mockDb.reviewSaves).toHaveLength(1))
    expect(mockDb.reviewSaves[0]!.draft).toMatchObject({
      phone: '+842434567890',
      provenance: {
        phone: {
          sourceType: 'editorial',
          sourceReference: 'Gọi chủ quán',
          collectedAt: '2026-09-30T02:00:00.000Z',
        },
      },
    })
  })

  it('explains a pre-#280 draft refused at approval and marks its boxes', async () => {
    const user = userEvent.setup()
    const detail = mockDb.submissionDetails[REVIEWED_ID] as {
      review: { draft: Record<string, unknown> }
    }
    // Saved before evidence existed: a phone with no provenance.
    detail.review.draft = { ...detail.review.draft, phone: '+842434567890' }
    const dialog = await openReview()
    await user.type(within(dialog).getByLabelText(/Lý do quyết định/), 'quán hợp lệ')
    await user.click(within(dialog).getByRole('button', { name: 'Duyệt' }))

    expect(
      await screen.findByText(
        'Bản nháp có địa chỉ / điện thoại / website chưa kèm nguồn. Điền nguồn, lưu bổ sung rồi duyệt lại.',
      ),
    ).toBeInTheDocument()
    const group = within(evidenceGroup('Điện thoại', dialog)!)
    expect(group.getByLabelText('Loại nguồn')).toHaveAttribute('aria-invalid', 'true')
    expect(mockDb.decisions).toHaveLength(0)
  })
})
