import { beforeEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { resetMockDb } from '@/shared/test/handlers'
import {
  assistantFixtureIds,
  clearAssistantMock,
  simulateColleagueEdit,
} from '@/shared/test/assistantMock'
import type { AdminRole } from '@/shared/api/contracts'
import DocumentListScreen from './documentList.view'
import DocumentDetailScreen from './documentDetail.view'

const LIST = '/v1/cms/assistant/documents'
const VOTING = `/assistant/documents/${assistantFixtureIds.voting}`

function Routed() {
  return (
    <Routes>
      <Route path="/assistant/documents" element={<DocumentListScreen />} />
      <Route path="/assistant/documents/:id" element={<DocumentDetailScreen />} />
    </Routes>
  )
}

const envelope = (status: number, code: string) =>
  HttpResponse.json(
    { code, message: code, field_errors: [], request_id: `req-${code}`, retryable: false },
    { status },
  )

beforeEach(() => resetMockDb())

describe('GoGo AI documents list — role × state (CMS#249)', () => {
  it.each<[AdminRole, boolean]>([
    ['editor', true],
    ['moderator', false],
    ['ops_admin', true],
    ['super_admin', true],
  ])('%s reads the list; create offered: %s', async (role, canCreate) => {
    signInAs(role)
    renderWithProviders(<Routed />, { route: '/assistant/documents' })

    const table = await screen.findByRole('table')
    expect(within(table).getByText('GoGo guide · Kế hoạch')).toBeInTheDocument()
    expect(within(table).getByText('plans.voting')).toBeInTheDocument()
    // Status, live version and open draft are all in the row, in words.
    const row = within(table).getByText('plans.voting').closest('tr')!
    expect(within(row).getByText('Đang xuất bản')).toBeInTheDocument()
    expect(within(row).getByText('Đang dùng v2')).toBeInTheDocument()
    expect(within(row).getByText('Nháp v3')).toBeInTheDocument()
    expect(within(row).getByText('linh.editor')).toBeInTheDocument()

    const create = screen.queryByRole('button', { name: 'Tạo tài liệu' })
    if (canCreate) expect(create).toBeInTheDocument()
    else expect(create).not.toBeInTheDocument()
  })

  it('shows loading while the request is in flight', async () => {
    signInAs('editor')
    server.use(http.get(LIST, async () => await delay('infinite')))
    renderWithProviders(<Routed />, { route: '/assistant/documents' })
    expect(await screen.findByRole('status')).toHaveTextContent('Đang tải…')
  })

  it('shows the empty state when no document exists', async () => {
    signInAs('editor')
    clearAssistantMock('documents')
    renderWithProviders(<Routed />, { route: '/assistant/documents' })
    expect(await screen.findByText('Chưa có tài liệu nguồn')).toBeInTheDocument()
  })

  it('shows the error with its request id', async () => {
    signInAs('editor')
    server.use(http.get(LIST, () => envelope(500, 'INTERNAL')))
    renderWithProviders(<Routed />, { route: '/assistant/documents' })
    expect(await screen.findByText('Không tải được dữ liệu')).toBeInTheDocument()
    expect(screen.getByText(/req-INTERNAL/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })

  it('turns a mid-session 403 into permission-denied, not a blank page', async () => {
    signInAs('editor')
    server.use(http.get(LIST, () => envelope(403, 'FORBIDDEN')))
    renderWithProviders(<Routed />, { route: '/assistant/documents' })
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })

  it('says offline when the network fails', async () => {
    signInAs('editor')
    server.use(http.get(LIST, () => HttpResponse.error()))
    renderWithProviders(<Routed />, { route: '/assistant/documents' })
    expect(await screen.findByText('Mất kết nối mạng')).toBeInTheDocument()
  })

  it('filters by status on the server', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/assistant/documents' })
    await screen.findByRole('table')

    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'unpublished')
    await waitFor(() => expect(screen.queryByText('plans.voting')).not.toBeInTheDocument())
    expect(screen.getByText('places.freshness')).toBeInTheDocument()
  })

  it('does not send a one-character search the server would refuse', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    const seen: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/cms/assistant/documents')) seen.push(request.url)
    })
    renderWithProviders(<Routed />, { route: '/assistant/documents' })
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('Tìm theo slug hoặc tiêu đề'), 'p')
    expect(await screen.findByText('Nhập ít nhất 2 ký tự để tìm.')).toBeInTheDocument()
    expect(seen.some((url) => url.includes('q='))).toBe(false)

    await user.type(screen.getByLabelText('Tìm theo slug hoặc tiêu đề'), 'laces')
    await waitFor(() => expect(screen.queryByText('plans.voting')).not.toBeInTheDocument())
    expect(screen.getByText('places.freshness')).toBeInTheDocument()
    server.events.removeAllListeners()
  })

  it('refuses a bad slug before sending, and maps a taken one to the field', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/assistant/documents' })

    await user.click(await screen.findByRole('button', { name: 'Tạo tài liệu' }))
    const drawer = await screen.findByRole('dialog')
    await user.type(within(drawer).getByLabelText(/^Slug/), 'Plans Voting')
    await user.type(within(drawer).getByLabelText(/^Tiêu đề/), 'GoGo guide · Kế hoạch')
    await user.type(within(drawer).getByLabelText(/^Nội dung/), '# Kế hoạch')
    await user.click(within(drawer).getByRole('button', { name: 'Tạo bản nháp' }))
    expect(await within(drawer).findByText(/Slug chỉ gồm chữ thường/)).toBeInTheDocument()

    const slug = within(drawer).getByLabelText(/^Slug/)
    await user.clear(slug)
    await user.type(slug, 'plans.voting')
    await user.click(within(drawer).getByRole('button', { name: 'Tạo bản nháp' }))
    expect(
      await within(drawer).findByText('Đã có tài liệu với slug này cho ngôn ngữ đã chọn.'),
    ).toBeInTheDocument()
  })

  it('creates a draft and opens it', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/assistant/documents' })

    await user.click(await screen.findByRole('button', { name: 'Tạo tài liệu' }))
    const drawer = await screen.findByRole('dialog')
    await user.type(within(drawer).getByLabelText(/^Slug/), 'rooms.guests')
    await user.type(within(drawer).getByLabelText(/^Tiêu đề/), 'GoGo guide · Khách')
    await user.type(within(drawer).getByLabelText(/^Nội dung/), 'Khách chỉ xem.')
    await user.click(within(drawer).getByRole('button', { name: 'Tạo bản nháp' }))

    expect(await screen.findByText('Bản nháp v1 · lần sửa 1')).toBeInTheDocument()
    expect(screen.getAllByText('Bản nháp').length).toBeGreaterThan(0)
  })
})

describe('GoGo AI document editor (CMS#249)', () => {
  it('saves the draft with the revision it loaded', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })

    expect(await screen.findByText('Bản nháp v3 · lần sửa 2')).toBeInTheDocument()
    const title = screen.getByLabelText(/^Tiêu đề/)
    expect(title).toHaveValue('GoGo guide · Kế hoạch nhóm')
    await user.clear(title)
    await user.type(title, 'GoGo guide · Kế hoạch & bình chọn')
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))

    expect(await screen.findByText('Đã lưu bản nháp.')).toBeInTheDocument()
    expect(await screen.findByText('Bản nháp v3 · lần sửa 3')).toBeInTheDocument()
  })

  it('shows a colleague’s conflicting save as a diff instead of overwriting it', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })

    const body = await screen.findByLabelText(/^Nội dung/)
    simulateColleagueEdit(assistantFixtureIds.voting, 'Bản của đồng nghiệp.')
    await user.type(body, '\nDòng của tôi.')
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))

    const conflict = (await screen.findByText('Bản nháp đã thay đổi trong lúc bạn sửa')).closest(
      'section',
    )!
    expect(within(conflict).getByText(/quan\.ops đã lưu lần sửa 3/)).toBeInTheDocument()
    expect(within(conflict).getByText('Bản của đồng nghiệp.')).toBeInTheDocument()
    expect(within(conflict).getByText('Dòng của tôi.')).toBeInTheDocument()

    await user.click(within(conflict).getByRole('button', { name: 'Ghi đè bằng nội dung của tôi' }))
    expect(await screen.findByText('Bản nháp v3 · lần sửa 4')).toBeInTheDocument()
    expect(screen.queryByText('Bản nháp đã thay đổi trong lúc bạn sửa')).not.toBeInTheDocument()
  })

  it('renders the body preview as structure, never as HTML', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })

    const body = await screen.findByLabelText(/^Nội dung/)
    await user.clear(body)
    await user.type(body, '# Tiêu đề lớn\n\n<img src=x onerror=alert(1)>\n\n- một\n- hai')
    await user.click(screen.getByRole('tab', { name: 'Xem trước' }))

    const preview = screen.getByRole('region', { name: 'Xem trước' })
    expect(within(preview).getByRole('heading', { name: 'Tiêu đề lớn' })).toBeInTheDocument()
    expect(within(preview).getAllByRole('listitem')).toHaveLength(2)
    expect(within(preview).queryByRole('img')).not.toBeInTheDocument()
    expect(within(preview).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  })

  it('an editor edits but cannot publish', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: VOTING })
    expect(await screen.findByText(/Chỉ ops_admin xuất bản hoặc thu hồi/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Xuất bản bản nháp/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thu hồi khỏi trợ lý' })).not.toBeInTheDocument()
  })

  it('a moderator reads the document and writes nothing', async () => {
    signInAs('moderator')
    renderWithProviders(<Routed />, { route: VOTING })
    const title = await screen.findByLabelText(/^Tiêu đề/)
    expect(title).toHaveAttribute('readonly')
    expect(screen.getByText(/Vai trò của bạn chỉ được đọc tài liệu này/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu bản nháp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Xuất bản bản nháp/ })).not.toBeInTheDocument()
  })

  it('turns a mid-session 403 on the document into permission-denied', async () => {
    signInAs('editor')
    server.use(http.get(`${LIST}/:id`, () => envelope(403, 'FORBIDDEN')))
    renderWithProviders(<Routed />, { route: VOTING })
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })

  it('says offline when the document cannot be reached', async () => {
    signInAs('editor')
    server.use(http.get(`${LIST}/:id`, () => HttpResponse.error()))
    renderWithProviders(<Routed />, { route: VOTING })
    expect(await screen.findByText('Mất kết nối mạng')).toBeInTheDocument()
  })
})

describe('GoGo AI publish / unpublish (ops_admin, CMS#249)', () => {
  it('previews what goes live — version, title and body diff — before publishing', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })

    await user.click(await screen.findByRole('button', { name: 'Xuất bản bản nháp v3' }))
    const dialog = await screen.findByRole('dialog', { name: 'Xuất bản v3?' })
    // Not a bare "are you sure": which version replaces which, and how.
    expect(within(dialog).getByText('v2')).toBeInTheDocument()
    expect(within(dialog).getAllByText('v3').length).toBeGreaterThan(0)
    expect(within(dialog).getByText('GoGo guide · Kế hoạch nhóm')).toBeInTheDocument()
    expect(within(dialog).getByText('- Khách mời chỉ xem, không bình chọn.')).toBeInTheDocument()
    expect(within(dialog).getByText(/câu trả lời đang chạy giữ phiên bản/)).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Lý do/), 'Thêm quy tắc đổi phiếu')
    await user.click(within(dialog).getByRole('button', { name: 'Xuất bản v3' }))

    expect(await screen.findByText('Đã xuất bản v3.')).toBeInTheDocument()
    expect(await screen.findByText('Không có bản nháp mở')).toBeInTheDocument()
  })

  it('withdraws only with a reason, and says what users stop seeing', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })

    await user.click(await screen.findByRole('button', { name: 'Thu hồi khỏi trợ lý' }))
    const dialog = await screen.findByRole('dialog', { name: 'Thu hồi tài liệu khỏi trợ lý?' })
    expect(within(dialog).getByText(/trợ lý không trích dẫn tài liệu này/)).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: 'Thu hồi khỏi trợ lý' })
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/Lý do/), 'Nội dung sai')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(await screen.findByText('Đã thu hồi tài liệu khỏi trợ lý.')).toBeInTheDocument()
    expect((await screen.findAllByText('Đã thu hồi')).length).toBeGreaterThan(0)
  })

  it('explains a refusal from a state that moved, and reloads', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    server.use(http.post(`${LIST}/:id/publish`, () => envelope(409, 'VERSION_ALREADY_PUBLISHED')))
    renderWithProviders(<Routed />, { route: VOTING })

    await user.click(await screen.findByRole('button', { name: 'Xuất bản bản nháp v3' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Xuất bản v3' }))
    expect(await screen.findByText(/Phiên bản này đã được xuất bản/)).toBeInTheDocument()
  })

  it('holds publish while the draft has unsaved edits', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })
    await user.type(await screen.findByLabelText(/^Mô tả/), ' (sửa)')
    expect(screen.getByText(/Lưu bản nháp trước khi xuất bản/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xuất bản bản nháp v3' })).toBeDisabled()
  })
})

describe('GoGo AI version history and audit (CMS#249)', () => {
  it('lists every version with who did what, and diffs live against draft', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })

    await user.click(await screen.findByRole('tab', { name: 'Lịch sử phiên bản' }))
    const list = await screen.findByRole('list', { name: 'Lịch sử phiên bản' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText(/Cập nhật quy tắc hiện kết quả/)).toBeInTheDocument()
    expect(within(list).getByText('Đã thay thế')).toBeInTheDocument()

    const diff = await screen.findByRole('region', { name: 'Khác biệt nội dung' })
    expect(within(diff).getByText('- Khách mời chỉ xem, không bình chọn.')).toBeInTheDocument()
    // An editor may not roll back: that is a publish.
    expect(screen.queryByRole('button', { name: /Xuất bản lại/ })).not.toBeInTheDocument()

    // Any two versions can be compared.
    await user.selectOptions(
      screen.getByLabelText('So sánh từ'),
      '0f6a1e2b-2222-4000-8000-000000000001',
    )
    expect(
      await within(await screen.findByRole('region', { name: 'Khác biệt nội dung' })).findByText(
        '- Kết quả hiện sau khi chốt.',
      ),
    ).toBeInTheDocument()
  })

  it('lets ops roll back to an earlier version through the same preview', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })

    await user.click(await screen.findByRole('tab', { name: 'Lịch sử phiên bản' }))
    await user.click(await screen.findByRole('button', { name: 'Xuất bản lại v1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Quay lại v1?' })
    expect(within(dialog).getByText('v2')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Xuất bản lại v1' }))
    expect(await screen.findByText('Đã xuất bản v1.')).toBeInTheDocument()
  })

  it('shows the audit trail as a readable before/after', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })

    await user.click(await screen.findByRole('button', { name: 'Thu hồi khỏi trợ lý' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Sai quy tắc')
    await user.click(within(dialog).getByRole('button', { name: 'Thu hồi khỏi trợ lý' }))
    await screen.findByText('Đã thu hồi tài liệu khỏi trợ lý.')

    await user.click(screen.getByRole('tab', { name: 'Nhật ký thay đổi' }))
    expect(await screen.findByText('assistant_document.unpublished')).toBeInTheDocument()
    expect(screen.getByText('Sai quy tắc')).toBeInTheDocument()
    expect(screen.getAllByText('assistant_document.published').length).toBeGreaterThan(0)
    expect(screen.getAllByText('unpublished').length).toBeGreaterThan(0)
  })
})
