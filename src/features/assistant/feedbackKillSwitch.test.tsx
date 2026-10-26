import { beforeEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { resetMockDb } from '@/shared/test/handlers'
import { clearAssistantMock } from '@/shared/test/assistantMock'
import { featureFlagCatalog } from '@/shared/test/fixtures'
import type { AdminRole } from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/errors'
import { fetchFeedback } from './api'
import FeedbackQueueScreen from './feedbackQueue.view'
import KillSwitchScreen from './killSwitch.view'

const FEEDBACK = '/v1/cms/assistant/feedback'
const envelope = (status: number, code: string) =>
  HttpResponse.json(
    { code, message: code, field_errors: [], request_id: `req-${code}`, retryable: false },
    { status },
  )

beforeEach(() => resetMockDb())

describe('GoGo AI feedback queue — role × state (CMS#249)', () => {
  // GoGo-BE#713 Q8: declared on moderator + ops_admin with an explicit
  // exception to rank-read, so the rank-1 editor peer does not read it.
  it.each<AdminRole>(['moderator', 'ops_admin', 'super_admin'])(
    '%s reads the queue with reply, sources and reason only',
    async (role) => {
      signInAs(role)
      renderWithProviders(<FeedbackQueueScreen />)

      const list = await screen.findByRole('list', { name: 'Phản hồi câu trả lời GoGo AI' })
      const items = within(list)
        .getAllByRole('listitem')
        .filter((el) => el.parentElement === list)
      expect(items).toHaveLength(4)
      expect(within(list).getByText(/chỉ hiện sau khi chủ phòng chốt/)).toBeInTheDocument()
      expect(within(list).getByText('Đã cũ')).toBeInTheDocument()
      // A guide source links to the CMS document; place data says when it was checked.
      expect(within(list).getByRole('link', { name: 'GoGo guide · Kế hoạch' })).toHaveAttribute(
        'href',
        '/assistant/documents/0f6a1e2b-1111-4000-8000-000000000001',
      )
      expect(
        within(list).getByText(/Dữ liệu địa điểm GoGo · kiểm tra lần cuối/),
      ).toBeInTheDocument()
      expect(within(list).getByText(/Dự phòng · quá 15 giây/)).toBeInTheDocument()
      // Minimal PII: an opaque conversation token, never a person.
      expect(within(list).getByText(/Hội thoại #c9f1a2b3/)).toBeInTheDocument()
      expect(list.textContent).not.toMatch(/@|\d+\.\d{4,}/)
      expect(screen.getByText(/Không có người đánh giá, câu hỏi của họ/)).toBeInTheDocument()
      // Q3/Q10: the v1 limitation is said, not left for the reviewer to infer.
      expect(screen.getByText(/Câu hỏi của người dùng không hiển thị trong v1/)).toBeInTheDocument()
    },
  )

  it('editor gets permission-denied: the queue is outside rank-read', async () => {
    signInAs('editor')
    renderWithProviders(<FeedbackQueueScreen />)
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Phản hồi câu trả lời GoGo AI' }),
    ).not.toBeInTheDocument()
  })

  it('the API itself refuses an editor with 403 ROLE_DENIED', async () => {
    // RoleGate is not authorization: a hand-crafted request must fail too.
    signInAs('editor')
    const refused = await fetchFeedback({ limit: 20 }).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(ApiError)
    expect(refused).toMatchObject({ status: 403, code: 'ROLE_DENIED' })
  })

  it('labels a reply that hit the length ceiling as cut short', async () => {
    signInAs('moderator')
    renderWithProviders(<FeedbackQueueScreen />)
    const list = await screen.findByRole('list', { name: 'Phản hồi câu trả lời GoGo AI' })
    expect(within(list).getByText('Bị cắt ngắn')).toBeInTheDocument()
    expect(within(list).queryByText('truncated')).not.toBeInTheDocument()
  })

  it('labels it in English too', async () => {
    window.localStorage.setItem('gogo.cms.locale', 'en')
    signInAs('moderator')
    renderWithProviders(<FeedbackQueueScreen />)
    expect(await screen.findByText('Cut short')).toBeInTheDocument()
    expect(screen.getByText(/question is not shown in v1/)).toBeInTheDocument()
  })

  it('filters by rating on the server', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<FeedbackQueueScreen />)
    await screen.findByRole('list', { name: 'Phản hồi câu trả lời GoGo AI' })

    await user.selectOptions(screen.getByLabelText('Đánh giá'), 'up')
    await waitFor(() =>
      expect(screen.queryByText(/chỉ hiện sau khi chủ phòng chốt/)).not.toBeInTheDocument(),
    )
    expect(screen.getByText(/Quán này mở đến 22:00/)).toBeInTheDocument()
  })

  it('refuses an inverted date range before asking', async () => {
    signInAs('moderator')
    const user = userEvent.setup()
    renderWithProviders(<FeedbackQueueScreen />)
    await screen.findByRole('list', { name: 'Phản hồi câu trả lời GoGo AI' })
    await user.type(screen.getByLabelText('Từ ngày'), '2026-10-20')
    await user.type(screen.getByLabelText('Đến ngày'), '2026-10-10')
    expect(await screen.findByText('Ngày kết thúc phải sau ngày bắt đầu.')).toBeInTheDocument()
  })

  it('loading', async () => {
    signInAs('moderator')
    server.use(http.get(FEEDBACK, async () => await delay('infinite')))
    renderWithProviders(<FeedbackQueueScreen />)
    expect(await screen.findByRole('status')).toHaveTextContent('Đang tải…')
  })

  it('empty', async () => {
    signInAs('moderator')
    clearAssistantMock('feedback')
    renderWithProviders(<FeedbackQueueScreen />)
    expect(await screen.findByText('Chưa có phản hồi nào')).toBeInTheDocument()
  })

  it('error', async () => {
    signInAs('moderator')
    server.use(http.get(FEEDBACK, () => envelope(500, 'INTERNAL')))
    renderWithProviders(<FeedbackQueueScreen />)
    expect(await screen.findByText('Không tải được dữ liệu')).toBeInTheDocument()
  })

  it('permission denied mid-session', async () => {
    signInAs('moderator')
    server.use(http.get(FEEDBACK, () => envelope(403, 'FORBIDDEN')))
    renderWithProviders(<FeedbackQueueScreen />)
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })

  it('offline', async () => {
    signInAs('moderator')
    server.use(http.get(FEEDBACK, () => HttpResponse.error()))
    renderWithProviders(<FeedbackQueueScreen />)
    expect(await screen.findByText('Mất kết nối mạng')).toBeInTheDocument()
  })
})

describe('GoGo AI kill switch — role × state (CMS#249)', () => {
  it.each<AdminRole>(['editor', 'moderator'])(
    '%s gets permission-denied: the switch is an ops flag',
    async (role) => {
      signInAs(role)
      renderWithProviders(<KillSwitchScreen />)
      expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /trợ lý/ })).not.toBeInTheDocument()
    },
  )

  it.each<AdminRole>(['ops_admin', 'super_admin'])(
    '%s previews the effect, turns it on, and reads it back in the history',
    async (role) => {
      signInAs(role)
      const user = userEvent.setup()
      renderWithProviders(<KillSwitchScreen />)

      expect(await screen.findByText('Đang tắt')).toBeInTheDocument()
      expect(screen.getByText(/Chưa cấu hình — dùng mặc định/)).toBeInTheDocument()
      expect(await screen.findByText('2 tài liệu nguồn đang xuất bản.')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Bật trợ lý' }))
      const dialog = await screen.findByRole('dialog', { name: 'Bật GoGo AI?' })
      expect(within(dialog).getByText('assistant.enabled')).toBeInTheDocument()
      expect(within(dialog).getByText('2 tài liệu nguồn đang xuất bản.')).toBeInTheDocument()
      await user.type(within(dialog).getByLabelText(/Lý do thay đổi/), 'Ra mắt bản thử nghiệm')
      await user.click(within(dialog).getByRole('button', { name: 'Bật trợ lý' }))

      expect(await screen.findByText('Đã bật GoGo AI.')).toBeInTheDocument()
      expect(await screen.findByText('Đang bật')).toBeInTheDocument()
      expect(await screen.findByText('feature_flag.set')).toBeInTheDocument()
      // The reason the operator typed is the one the history reads back.
      expect(await screen.findByText(/Ra mắt bản thử nghiệm/)).toBeInTheDocument()
    },
  )

  it('requires a 3–500 character reason and sends it, trimmed, in the PUT body', async () => {
    signInAs('ops_admin')
    const bodies: unknown[] = []
    // Returns nothing, so the request falls through to the regular mock.
    server.use(
      http.put('/v1/cms/feature-flags/:key', async ({ request }) => {
        bodies.push(await request.clone().json())
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<KillSwitchScreen />)
    await user.click(await screen.findByRole('button', { name: 'Bật trợ lý' }))
    const dialog = await screen.findByRole('dialog', { name: 'Bật GoGo AI?' })
    const confirm = within(dialog).getByRole('button', { name: 'Bật trợ lý' })
    expect(confirm).toBeDisabled()
    const field = within(dialog).getByLabelText(/Lý do thay đổi/)
    await user.type(field, ' ab ')
    expect(confirm).toBeDisabled()
    expect(within(dialog).getByText('Lý do cần ít nhất 3 ký tự.')).toBeInTheDocument()
    await user.type(field, 'c')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(await screen.findByText('Đã bật GoGo AI.')).toBeInTheDocument()
    expect(bodies).toEqual([{ enabled: true, reason: 'ab c' }])
  })

  it('says what turning it off does before doing it', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<KillSwitchScreen />)
    await user.click(await screen.findByRole('button', { name: 'Bật trợ lý' }))
    const onDialog = await screen.findByRole('dialog')
    await user.type(within(onDialog).getByLabelText(/Lý do thay đổi/), 'Thử nghiệm')
    await user.click(within(onDialog).getByRole('button', { name: 'Bật trợ lý' }))
    await user.click(await screen.findByRole('button', { name: 'Tắt trợ lý' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tắt GoGo AI?' })
    expect(within(dialog).getByText(/503 ASSISTANT_DISABLED/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Lịch sử hội thoại không bị xoá/)).toBeInTheDocument()
  })

  it('warns when nothing is published yet', async () => {
    signInAs('ops_admin')
    clearAssistantMock('documents')
    const user = userEvent.setup()
    renderWithProviders(<KillSwitchScreen />)
    await screen.findByText('0 tài liệu nguồn đang xuất bản.')
    await user.click(screen.getByRole('button', { name: 'Bật trợ lý' }))
    expect(await screen.findByText(/mọi câu hỏi sản phẩm sẽ nhận/)).toBeInTheDocument()
  })

  it('shows "not registered" rather than a control while the backend lacks the key', async () => {
    signInAs('ops_admin')
    server.use(
      http.get('/v1/cms/feature-flags/catalog', () =>
        HttpResponse.json(featureFlagCatalog.filter((item) => item.key !== 'assistant.enabled')),
      ),
    )
    renderWithProviders(<KillSwitchScreen />)
    expect(
      await screen.findByText(/Backend chưa đăng ký khoá assistant.enabled/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bật trợ lý' })).not.toBeInTheDocument()
  })

  it('offline', async () => {
    signInAs('ops_admin')
    server.use(http.get('/v1/cms/feature-flags/catalog', () => HttpResponse.error()))
    renderWithProviders(<KillSwitchScreen />)
    expect(await screen.findByText('Mất kết nối mạng')).toBeInTheDocument()
  })

  it('error', async () => {
    signInAs('ops_admin')
    server.use(http.get('/v1/cms/feature-flags/catalog', () => envelope(500, 'INTERNAL')))
    renderWithProviders(<KillSwitchScreen />)
    expect(await screen.findByText('Không tải được dữ liệu')).toBeInTheDocument()
  })

  it('loading', async () => {
    signInAs('ops_admin')
    server.use(http.get('/v1/cms/feature-flags/catalog', async () => await delay('infinite')))
    renderWithProviders(<KillSwitchScreen />)
    expect((await screen.findAllByRole('status'))[0]).toHaveTextContent('Đang tải…')
  })
})
