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
import { QUERY_STALE_TIME } from '@/app/Providers'
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

async function ask(question: string, options: { staleTime?: number } = {}) {
  const user = userEvent.setup()
  renderWithProviders(<Routed />, { route: '/assistant/documents', ...options })
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

  it('checks again on a second press, after the server moved on (#269 F-01)', async () => {
    let calls = 0
    let outcome: 'no_published' | 'hit' = 'no_published'
    server.use(
      http.get(COVERAGE, () => {
        calls += 1
        return HttpResponse.json(
          outcome === 'hit'
            ? {
                outcome,
                terms: ['binh', 'chon'],
                sections: [
                  {
                    documentId: assistantFixtureIds.voting,
                    versionId: 'v',
                    slug: 'plans.voting',
                    title: 'GoGo guide · Kế hoạch',
                    heading: 'Bình chọn trong kế hoạch',
                    excerpt: 'Mỗi thành viên bình chọn một lần.',
                    score: 2,
                  },
                ],
              }
            : { outcome, terms: ['binh', 'chon'], sections: [] },
        )
      }),
    )
    signInAs('editor')
    const { user, panel } = await ask('Bình chọn thế nào?', { staleTime: QUERY_STALE_TIME })
    expect(await within(panel).findByText(/Chưa có bài nào đang xuất bản/)).toBeInTheDocument()
    expect(calls).toBe(1)

    // A colleague publishes in another session; the same question, pressed again.
    outcome = 'hit'
    await user.click(within(panel).getByRole('button', { name: 'Kiểm tra' }))
    expect(await within(panel).findByText(/GoGo AI sẽ trích 1 phần/)).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it('A → B → A inside the cache window still reads the server (#269 F-01 round 2)', async () => {
    const asked: string[] = []
    let published = false
    server.use(
      http.get(COVERAGE, ({ request }) => {
        const question = new URL(request.url).searchParams.get('question') ?? ''
        asked.push(question)
        return HttpResponse.json({
          outcome: published ? 'no_match' : 'no_published',
          terms: [],
          sections: [],
        })
      }),
    )
    signInAs('editor')
    const { user, panel } = await ask('Câu A', { staleTime: QUERY_STALE_TIME })
    const input = within(panel).getByLabelText('Câu hỏi')
    const run = within(panel).getByRole('button', { name: 'Kiểm tra' })
    expect(await within(panel).findByText(/Chưa có bài nào đang xuất bản/)).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'Câu B')
    await user.click(run)
    await waitFor(() => expect(asked).toEqual(['Câu A', 'Câu B']))

    // A colleague publishes; back to A within 30 s of its first check.
    published = true
    await user.clear(input)
    await user.type(input, 'Câu A')
    await user.click(run)
    await waitFor(() => expect(asked).toEqual(['Câu A', 'Câu B', 'Câu A']))
    expect(await within(panel).findByText(/không phần nào khớp câu hỏi này/)).toBeInTheDocument()
    expect(within(panel).queryByText(/Chưa có bài nào đang xuất bản/)).not.toBeInTheDocument()
  })

  it('a different locale is a different check, and so is coming back to it', async () => {
    const seen: string[] = []
    server.use(
      http.get(COVERAGE, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('locale') ?? '')
        return HttpResponse.json({ outcome: 'no_match', terms: [], sections: [] })
      }),
    )
    signInAs('editor')
    const { user, panel } = await ask('Câu A', { staleTime: QUERY_STALE_TIME })
    await waitFor(() => expect(seen).toEqual(['vi']))
    const locale = within(panel).getByLabelText('Ngôn ngữ')
    const run = within(panel).getByRole('button', { name: 'Kiểm tra' })
    await user.selectOptions(locale, 'en')
    await user.click(run)
    await user.selectOptions(locale, 'vi')
    await user.click(run)
    await waitFor(() => expect(seen).toEqual(['vi', 'en', 'vi']))
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
