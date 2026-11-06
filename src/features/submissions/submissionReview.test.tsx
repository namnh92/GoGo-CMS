import { beforeEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { mockDb, resetMockDb } from '@/shared/test/handlers'
import { giveEvidence } from '@/features/places/contactEvidence.testkit'
import SubmissionQueueScreen from './submissionQueue.view'
import { SubmissionReviewDrawer } from './submissionReview.view'

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
    await user.type(within(dialog).getByLabelText(/^Điện thoại/), '024 3456 7890')
    await giveEvidence(user, 'Điện thoại', {}, dialog)
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

/*
 * Sol F-03 — before the stored draft has been seeded there is nothing the
 * reviewer could have changed. A drawer still loading, or one whose load
 * failed, closes without asking about "unsaved" work.
 */
describe('closing before the submission has loaded', () => {
  it.each([
    ['while loading', () => http.get('*/cms/place-submissions/:id', () => delay('infinite'))],
    [
      'after a failed load',
      () =>
        http.get('*/cms/place-submissions/:id', () =>
          HttpResponse.json(
            {
              code: 'INTERNAL',
              message: 'boom',
              field_errors: [],
              request_id: 'r',
              retryable: true,
            },
            { status: 500 },
          ),
        ),
    ],
  ])('asks nothing %s', async (_when, handler) => {
    signInAs('moderator')
    server.use(handler())
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await screen.findByRole('dialog', { name: /Kiểm duyệt đề xuất/ })
    if (_when === 'after a failed load') {
      await within(dialog).findByText('boom', undefined, { timeout: 4000 })
    }
    expect(within(dialog).queryByText('Có bổ sung chưa lưu')).not.toBeInTheDocument()
    const close = within(dialog).getAllByRole('button', { name: /Đóng/ })
    await user.click(close[close.length - 1]!)

    expect(screen.queryByRole('dialog', { name: /Rời trang/ })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Kiểm duyệt đề xuất/ })).not.toBeInTheDocument(),
    )
  })
})

/*
 * Sol F-04 — GoGo-BE's contact value codes (`credentials`, `no_country`, …)
 * come back with a Vietnamese `message`. An English console says them in
 * English, from its own vocabulary.
 */
describe('contact value refusals in the UI language', () => {
  it('says a website credentials refusal in English', async () => {
    window.localStorage.setItem('gogo.cms.locale', 'en')
    signInAs('moderator')
    server.use(
      http.put('*/cms/place-submissions/:id/review', () =>
        HttpResponse.json(
          {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
            field_errors: [
              {
                field: 'website',
                code: 'credentials',
                message: 'Website không được chứa tài khoản',
              },
            ],
            request_id: 'req-credentials',
            retryable: false,
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })

    const dialog = await screen.findByRole('dialog', { name: /Review submission|Kiểm duyệt/ })
    const website = await within(dialog).findByLabelText(/^Website/)
    await user.type(website, 'https://user:pw@quan.vn')
    const group = within(await within(dialog).findByRole('group', { name: /Website/ }))
    await user.selectOptions(group.getByLabelText('Source type'), 'editorial')
    await user.type(group.getByLabelText('Source reference'), 'Gọi chủ quán ngày 30/09')
    fireEvent.change(group.getByLabelText('Collected at'), {
      target: { value: '2026-09-30T09:00' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Save supplement' }))

    expect(
      await within(dialog).findByText('The website must not contain a username or password'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('Website không được chứa tài khoản')).not.toBeInTheDocument()
  })
})

it('requires a rejection key even when an internal note is written', async () => {
  signInAs('moderator')
  const user = userEvent.setup()
  renderWithProviders(<SubmissionRoutes />, { route: FRESH })
  const dialog = await openDrawer()
  await user.type(within(dialog).getByLabelText(/^Lý do quyết định/), 'Ghi chú nội bộ')
  expect(within(dialog).getByRole('button', { name: 'Từ chối' })).toBeDisabled()
  const select = within(dialog).getByRole('combobox', { name: /Lý do từ chối/ })
  await user.selectOptions(select, 'incorrect_location')
  await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }))
  await waitFor(() => expect(mockDb.decisions).toHaveLength(1))
  expect(mockDb.decisions[0]).toMatchObject({
    decision: 'rejected',
    rejectionReason: 'incorrect_location',
  })
})

const REASONS = [
  ['duplicate_place', 'Trùng địa điểm', 'Duplicate place'],
  ['incorrect_location', 'Sai vị trí', 'Incorrect location'],
  ['permanently_closed', 'Đã đóng cửa vĩnh viễn', 'Permanently closed'],
  ['not_public_place', 'Không phải địa điểm công cộng', 'Not a public place'],
  ['inappropriate_content', 'Nội dung không phù hợp', 'Inappropriate content'],
  ['other', 'Khác', 'Other'],
] as const

it.each(['vi', 'en'] as const)(
  'labels every rejection key in %s and rejects without a note',
  async (locale) => {
    window.localStorage.setItem('gogo.cms.locale', locale)
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<SubmissionRoutes />, { route: FRESH })
    const dialog = await screen.findByRole('dialog', { name: /Review submission|Kiểm duyệt/ })
    const select = await within(dialog).findByRole('combobox', {
      name: /Rejection reason|Lý do từ chối/,
    })
    for (const [key, vi, en] of REASONS) {
      expect(within(select).getByRole('option', { name: locale === 'vi' ? vi : en })).toHaveValue(
        key,
      )
    }
    await user.selectOptions(select, 'other')
    // Approving/merging still require an internal note.
    expect(within(dialog).getByRole('button', { name: /^(Approve|Duyệt)$/ })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: /^(Reject|Từ chối)$/ }))
    await waitFor(() => expect(mockDb.decisions).toHaveLength(1))
    expect(mockDb.decisions[0]).toEqual({
      id: FRESH.split('/').at(-1),
      decision: 'rejected',
      rejectionReason: 'other',
    })
    // The refetched detail and audit history both retain the public key.
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', { name: /^(Reject|Từ chối)$/ }),
      ).not.toBeInTheDocument(),
    )
    expect(within(dialog).getByText(locale === 'vi' ? 'Khác' : 'Other')).toBeInTheDocument()
    expect(
      within(dialog).getByText(locale === 'vi' ? 'Lý do từ chối: Khác' : 'Rejection reason: Other'),
    ).toBeInTheDocument()
  },
)

it.each(['ops_admin'] as const)('hides decisions for read-only %s', async (role) => {
  signInAs(role)
  renderWithProviders(<SubmissionRoutes />, { route: FRESH })
  const dialog = await openDrawer()
  expect(within(dialog).queryByRole('combobox', { name: /Lý do từ chối/ })).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument()
})

function refuseDecision(status: number, fieldErrors: unknown[] = []) {
  server.use(
    http.post('*/cms/place-submissions/:id/decide', () =>
      HttpResponse.json(
        {
          code: status === 403 ? 'FORBIDDEN' : status === 400 ? 'VALIDATION_FAILED' : 'INTERNAL',
          message: 'Request refused',
          field_errors: fieldErrors,
          request_id: 'req-reject-281',
          retryable: status === 500,
        },
        { status },
      ),
    ),
  )
}

it('associates a BE key validation error with the selector and keeps the selection', async () => {
  signInAs('moderator')
  refuseDecision(400, [{ field: 'rejectionReason', code: 'invalid_enum', message: 'Invalid key' }])
  const user = userEvent.setup()
  renderWithProviders(<SubmissionRoutes />, { route: FRESH })
  const dialog = await openDrawer()
  const select = within(dialog).getByRole('combobox', { name: /Lý do từ chối/ })
  await user.selectOptions(select, 'incorrect_location')
  await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }))
  expect(await within(dialog).findByText('Chọn một lý do từ chối hợp lệ.')).toBeInTheDocument()
  expect(select).toHaveAttribute('aria-invalid', 'true')
  expect(select).toHaveAccessibleDescription('Chọn một lý do từ chối hợp lệ.')
  expect(select).toHaveValue('incorrect_location')
  expect(await within(dialog).findByText(/req-reject-281/)).toBeInTheDocument()
  await user.selectOptions(select, 'other')
  expect(select).not.toHaveAttribute('aria-invalid', 'true')
  expect(mockDb.decisions).toHaveLength(0)
})

it('shows permission denied and removes decision controls after a mid-session 403', async () => {
  signInAs('moderator')
  refuseDecision(403)
  const user = userEvent.setup()
  renderWithProviders(<SubmissionRoutes />, { route: FRESH })
  const dialog = await openDrawer()
  await user.selectOptions(
    within(dialog).getByRole('combobox', { name: /Lý do từ chối/ }),
    'duplicate_place',
  )
  await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }))
  expect(await within(dialog).findByText('Không đủ quyền')).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument()
  expect(mockDb.decisions).toHaveLength(0)
})

it.each(['server', 'network'])('keeps the reason for retry after a %s error', async (failure) => {
  signInAs('moderator')
  if (failure === 'server') refuseDecision(500)
  else server.use(http.post('*/cms/place-submissions/:id/decide', () => HttpResponse.error()))
  const user = userEvent.setup()
  renderWithProviders(<SubmissionRoutes />, { route: FRESH })
  const dialog = await openDrawer()
  const select = within(dialog).getByRole('combobox', { name: /Lý do từ chối/ })
  await user.selectOptions(select, 'permanently_closed')
  await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }))
  await screen.findByText('Không lưu được quyết định.')
  expect(select).toHaveValue('permanently_closed')
  expect(within(dialog).getByRole('button', { name: 'Từ chối' })).toBeEnabled()
  expect(mockDb.decisions).toHaveLength(0)
})

it('blocks a second reject while the first is pending', async () => {
  signInAs('moderator')
  let calls = 0
  server.use(
    http.post('*/cms/place-submissions/:id/decide', async () => {
      calls++
      await delay('infinite')
    }),
  )
  const user = userEvent.setup()
  renderWithProviders(<SubmissionRoutes />, { route: FRESH })
  const dialog = await openDrawer()
  const select = within(dialog).getByRole('combobox', { name: /Lý do từ chối/ })
  await user.selectOptions(select, 'other')
  const reject = within(dialog).getByRole('button', { name: 'Từ chối' })
  await user.dblClick(reject)
  await waitFor(() => expect(calls).toBe(1))
  expect(reject).toBeDisabled()
  expect(select).toBeDisabled()
})

it('clears the chosen reason when switching to another submission', async () => {
  signInAs('moderator')
  const user = userEvent.setup()
  const { rerender } = renderWithProviders(
    <SubmissionReviewDrawer submissionId={FRESH.split('/').at(-1)!} onClose={() => {}} />,
  )
  let dialog = await openDrawer()
  await user.selectOptions(within(dialog).getByRole('combobox', { name: /Lý do từ chối/ }), 'other')
  rerender(<SubmissionReviewDrawer submissionId={REVIEWED.split('/').at(-1)!} onClose={() => {}} />)
  dialog = await openDrawer()
  expect(within(dialog).getByRole('combobox', { name: /Lý do từ chối/ })).toHaveValue('')
  expect(within(dialog).getByRole('button', { name: 'Từ chối' })).toBeDisabled()
})

it('requires three characters if an optional rejection note is entered', async () => {
  signInAs('super_admin')
  const user = userEvent.setup()
  renderWithProviders(<SubmissionRoutes />, { route: FRESH })
  const dialog = await openDrawer()
  await user.selectOptions(within(dialog).getByRole('combobox', { name: /Lý do từ chối/ }), 'other')
  const reject = within(dialog).getByRole('button', { name: 'Từ chối' })
  const note = within(dialog).getByLabelText(/^Lý do quyết định/)
  expect(reject).toBeEnabled()
  await user.type(note, 'ab')
  expect(reject).toBeDisabled()
  await user.type(note, 'c')
  expect(reject).toBeEnabled()
})
