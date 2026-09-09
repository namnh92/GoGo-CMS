import { beforeEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { mockDb, resetMockDb } from '@/shared/test/handlers'
import SubmissionQueueScreen from './submissionQueue.view'

/**
 * GoGo-CMS#194 / GoGo-BE#528 — the review surface.
 *
 * The screen these cases replace could approve, reject or merge a Google Place
 * ID. What is asserted here is the difference: that a reviewer can see the
 * place, that seeing it costs nothing until they ask Google, that supplementing
 * is separate from deciding, and that a merge target is chosen rather than
 * typed.
 */
function SubmissionRoutes() {
  return (
    <Routes>
      <Route path="/submissions" element={<SubmissionQueueScreen />} />
      <Route path="/submissions/:submissionId" element={<SubmissionQueueScreen />} />
    </Routes>
  )
}

const FRESH = '/submissions/9a1d0c00-0000-4000-8000-000000000001'
const REVIEWED = '/submissions/9a1d0c00-0000-4000-8000-000000000002'
const DECIDED = '/submissions/9a1d0c00-0000-4000-8000-000000000003'

/**
 * The drawer, once its data has arrived. `findByRole` alone resolves while the
 * panel is still a skeleton, and every assertion below is about content.
 */
async function openDrawer(): Promise<HTMLElement> {
  const dialog = await screen.findByRole('dialog', { name: /Kiểm duyệt đề xuất/ })
  await within(dialog).findByRole('heading', { name: 'Định danh' })
  return dialog
}

beforeEach(() => {
  resetMockDb()
  mockDb.providerPreviewCalls = 0
})

describe('what the drawer shows before anyone spends anything', () => {
  it('opens on stored facts and makes no provider request', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    expect(within(dialog).getByText('Quán mới mở, view đẹp')).toBeInTheDocument()
    expect(within(dialog).getByText('cafe')).toBeInTheDocument()
    // The contributor's estimate, shown as theirs and with its unit.
    expect(within(dialog).getByText(/60.000–120.000 \/ per_person/)).toBeInTheDocument()
    expect(mockDb.providerPreviewCalls).toBe(0)
  })

  it('offers the canonical Google link built from the id GoGo stores', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    expect(within(dialog).getByRole('link', { name: 'Xem trên bản đồ' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/place/?q=place_id:ChIJpopular',
    )
  })

  it('fetches Google only when asked, and says what that costs', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    expect(within(dialog).getByText(/một truy vấn Google Place Details/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Chưa tải dữ liệu Google/)).toBeInTheDocument()
    expect(mockDb.providerPreviewCalls).toBe(0)

    await user.click(within(dialog).getByRole('button', { name: 'Tải dữ liệu Google' }))

    expect(await within(dialog).findByText('Bảo tàng Hà Nội')).toBeInTheDocument()
    expect(within(dialog).getByText(/4.4 · 1.312 lượt/)).toBeInTheDocument()
    expect(within(dialog).getByText('2 ngày có giờ mở cửa')).toBeInTheDocument()
    // The administrative proposal and its status, so the reviewer sees what
    // approval will produce before it produces it.
    expect(within(dialog).getByText(/Thành phố Hà Nội · Phường Từ Liêm/)).toBeInTheDocument()
    expect(within(dialog).getByText(/AUTO_MATCHED/)).toBeInTheDocument()
    // Attribution travels with anything Google supplied.
    expect(within(dialog).getByText(/Nguồn: Google Maps/)).toBeInTheDocument()
    expect(mockDb.providerPreviewCalls).toBe(1)
  })

  it('keeps user-submitted, provider and reviewer values in separate sections', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    expect(within(dialog).getByRole('heading', { name: 'Người dùng gửi' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Dữ liệu Google' })).toBeInTheDocument()
    expect(
      within(dialog).getByRole('heading', { name: 'Bổ sung của kiểm duyệt viên' }),
    ).toBeInTheDocument()
  })

  it('shows what a reviewer already supplemented, and the history of it', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: REVIEWED })

    const dialog = await openDrawer()
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Tên hiển thị/)).toHaveValue('Cà phê Ngọc Hà'),
    )
    expect(within(dialog).getByText('place_submission.reviewed')).toBeInTheDocument()
    expect(within(dialog).getByText(/Mod A/)).toBeInTheDocument()
  })
})

describe('supplementing is not deciding', () => {
  it('saves the draft without approving anything', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    await user.type(within(dialog).getByLabelText(/Tên hiển thị/), 'Cà phê Ngọc Hà')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bổ sung' }))

    await waitFor(() => expect(mockDb.reviewSaves).toHaveLength(1))
    expect(mockDb.reviewSaves[0]!.draft).toMatchObject({ name: 'Cà phê Ngọc Hà' })
    // Saving decided nothing.
    expect(mockDb.decisions).toHaveLength(0)
  })

  it('cannot save until something changed', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    expect(within(dialog).getByRole('button', { name: 'Lưu bổ sung' })).toBeDisabled()
  })

  it('refuses to close over unsaved edits', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    await user.type(within(dialog).getByLabelText(/Mô tả/), 'Sân vườn')
    expect(within(dialog).getByText('Có bổ sung chưa lưu')).toBeInTheDocument()

    const footer = within(dialog).getAllByRole('button', { name: /^Đóng$/ })
    await user.click(footer[footer.length - 1]!)

    // The guard names the field, so "unsaved changes" is not an unexplained
    // refusal — and the drawer is still open behind it.
    const guard = await screen.findByRole('dialog', { name: /Rời trang/ })
    expect(within(guard).getByText(/Mô tả/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /Kiểm duyệt đề xuất/ })).toBeInTheDocument()
  })

  it('sends the concurrency token it loaded the form with', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: REVIEWED })

    const dialog = await openDrawer()
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Tên hiển thị/)).toHaveValue('Cà phê Ngọc Hà'),
    )
    await user.type(within(dialog).getByLabelText(/Điện thoại/), '024 3456 7890')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bổ sung' }))

    // The mock enforces the server's rule; a save that omitted or invented the
    // token would have come back 409 and never reached the list.
    await waitFor(() => expect(mockDb.reviewSaves).toHaveLength(1))
    expect(mockDb.reviewSaves[0]!.draft).toMatchObject({ phone: '024 3456 7890' })
  })
})

describe('the decisions', () => {
  const writeReason = async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
    await user.type(within(dialog).getByLabelText(/Lý do quyết định/), 'quán hợp lệ')
  }

  it('refuses to decide until a reason is written', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    const approve = within(dialog).getByRole('button', { name: 'Duyệt' })
    expect(approve).toBeDisabled()

    await writeReason(user, dialog)
    await waitFor(() => expect(approve).toBeEnabled())
  })

  it('merges into a place picked from the catalogue, never a typed id', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    await writeReason(user, dialog)

    const merge = within(dialog).getByRole('button', { name: 'Gộp' })
    // A reason alone is not enough: the server refuses a merge with no target,
    // so the button stays off until one is chosen.
    expect(merge).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/Tìm địa điểm để gộp vào/), 'Chào')
    const result = await within(dialog).findByRole('button', { name: /Chào Bạn/ })
    await user.click(result)

    // The identity is shown before the decision, not after it.
    expect(within(dialog).getByText(/Sẽ gộp vào: Chào Bạn/)).toBeInTheDocument()
    await waitFor(() => expect(merge).toBeEnabled())

    await user.click(merge)
    await waitFor(() => expect(mockDb.decisions).toHaveLength(1))
    expect(mockDb.decisions[0]).toMatchObject({ decision: 'merged' })
    expect(mockDb.decisions[0]!['mergeIntoPlaceId']).toBeTruthy()
  })

  it('says that approving is neither verification nor publication', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await openDrawer()
    expect(
      within(dialog).getByText(/không phải là xác minh hành chính, cũng không phải xuất bản/),
    ).toBeInTheDocument()
  })

  it('offers no decision on a submission that is already decided, and points at the place', async () => {
    signInAs('moderator')
    renderWithProviders(<SubmissionRoutes />, { route: DECIDED })

    const dialog = await openDrawer()
    // The decision is done; what is left to do lives on the place.
    expect(within(dialog).queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
    expect(within(dialog).getByText(/Đề xuất này đã được quyết định/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Mở để xác minh hành chính và xuất bản/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Mở địa điểm' })).toHaveAttribute(
      'href',
      '/places/pl-chao-ban',
    )
  })
})
