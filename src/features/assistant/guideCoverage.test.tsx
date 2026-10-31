import { beforeEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
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

const COVERAGE = '/v1/cms/assistant/guide-coverage'
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

async function ask(question: string) {
  const user = userEvent.setup()
  renderWithProviders(<Routed />, { route: '/assistant/documents' })
  const panel = (await screen.findByRole('heading', { name: 'Kiểm tra độ phủ' })).closest(
    'section',
  )!
  await user.type(within(panel).getByLabelText('Câu hỏi'), question)
  await user.click(within(panel).getByRole('button', { name: 'Kiểm tra' }))
  return { user, panel }
}

beforeEach(() => resetMockDb())

describe('guide coverage check (GoGo-CMS#266, GoGo-BE#736)', () => {
  it.each<AdminRole>(['editor', 'moderator', 'ops_admin', 'super_admin'])(
    '%s can check a question',
    async (role) => {
      signInAs(role)
      renderWithProviders(<Routed />, { route: '/assistant/documents' })
      expect(await screen.findByRole('heading', { name: 'Kiểm tra độ phủ' })).toBeInTheDocument()
      expect(screen.getByText('Chưa kiểm tra câu nào.')).toBeInTheDocument()
    },
  )

  it('lists the sections a reply would cite, linked to their document', async () => {
    signInAs('editor')
    const { panel } = await ask('Bình chọn thế nào?')
    expect(await within(panel).findByText(/GoGo AI sẽ trích 1 phần/)).toBeInTheDocument()
    const link = within(panel).getByRole('link', { name: 'GoGo guide · Kế hoạch' })
    expect(link).toHaveAttribute('href', VOTING)
    expect(within(panel).getByText(/Bình chọn trong kế hoạch/)).toBeInTheDocument()
    expect(within(panel).getByText('binh, chon')).toBeInTheDocument()
  })

  it('says documents are live but none answers this wording', async () => {
    signInAs('editor')
    const { panel } = await ask('giá vé máy bay')
    expect(await within(panel).findByText(/không phần nào khớp câu hỏi này/)).toBeInTheDocument()
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
  })

  it('says nothing is published — a content gap, not a wording one', async () => {
    clearAssistantMock('documents')
    signInAs('editor')
    const { panel } = await ask('Cách tạo phòng trên GoGo?')
    expect(await within(panel).findByText(/Chưa có bài nào đang xuất bản/)).toBeInTheDocument()
  })

  it('does not send a one-character question', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/assistant/documents' })
    const input = await screen.findByLabelText('Câu hỏi')
    await user.type(input, 'a')
    expect(screen.getByText('Nhập ít nhất 2 ký tự.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kiểm tra' })).toBeDisabled()
  })

  it('shows the error with its request id', async () => {
    server.use(http.get(COVERAGE, () => envelope(500, 'INTERNAL')))
    signInAs('editor')
    const { panel } = await ask('Bình chọn thế nào?')
    expect(await within(panel).findByText('Không tải được dữ liệu')).toBeInTheDocument()
    expect(within(panel).getByText(/req-INTERNAL/)).toBeInTheDocument()
  })

  it('turns a mid-session 403 into permission-denied', async () => {
    server.use(http.get(COVERAGE, () => envelope(403, 'ROLE_DENIED')))
    signInAs('editor')
    const { panel } = await ask('Bình chọn thế nào?')
    expect(await within(panel).findByText('Không đủ quyền')).toBeInTheDocument()
  })
})

describe('publish carries the reviewed revision (GoGo-BE#736)', () => {
  it('sends the revision of the version the preview showed', async () => {
    let sent: unknown = null
    server.use(
      http.post('/v1/cms/assistant/documents/:id/publish', async ({ request }) => {
        sent = await request.json()
        return envelope(409, 'REVISION_CONFLICT')
      }),
    )
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })
    await user.click(await screen.findByRole('button', { name: 'Xuất bản bản nháp v3' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Xuất bản v3' }))
    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent).toMatchObject({ revision: expect.any(Number) })
  })

  it('refuses a draft a colleague edited after the preview, and explains', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: VOTING })
    await user.click(await screen.findByRole('button', { name: 'Xuất bản bản nháp v3' }))
    const dialog = await screen.findByRole('dialog')
    simulateColleagueEdit(assistantFixtureIds.voting, 'Bản đồng nghiệp sửa sau khi duyệt.')
    await user.click(within(dialog).getByRole('button', { name: 'Xuất bản v3' }))
    expect(await screen.findByText(/đã được sửa sau khi bạn xem/)).toBeInTheDocument()
    expect(screen.queryByText('Đã xuất bản v3.')).not.toBeInTheDocument()
  })
})
