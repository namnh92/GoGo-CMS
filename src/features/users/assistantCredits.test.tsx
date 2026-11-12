import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import {
  creditCursor,
  creditGrant,
  creditPage,
  creditSpend,
  creditUserId,
} from '@/shared/test/assistantCredits'
import { useOnline } from '@/shared/ui/useOnline'
import type { AdminRole } from '@/shared/api/contracts'
import { roleCan } from '@/shared/auth/permissions'
import { NAV_LEAVES, isLeafActive } from '@/app/nav'
import AssistantCreditsScreen from './assistantCredits.view'
import UserListScreen from './userList.view'

vi.mock('@/shared/ui/useOnline', () => ({ useOnline: vi.fn(() => true) }))
const endpoint = '/v1/cms/users/:id/assistant-credits'
function renderCredits() {
  return renderWithProviders(
    <Routes>
      <Route path="/users/:id/assistant-credits" element={<AssistantCreditsScreen />} />
    </Routes>,
    { route: `/users/${creditUserId}/assistant-credits` },
  )
}

beforeEach(() => {
  vi.mocked(useOnline).mockReturnValue(true)
  server.use(http.get(endpoint, () => HttpResponse.json(creditPage)))
})

describe('user assistant credits (#277)', () => {
  it.each<AdminRole>(['editor', 'moderator'])(
    'denies %s before requesting private credit facts',
    async (role) => {
      signInAs(role)
      let requests = 0
      server.use(
        http.get(endpoint, () => {
          requests++
          return HttpResponse.json(creditPage)
        }),
      )
      renderCredits()
      expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
      expect(requests).toBe(0)
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(roleCan(role, 'user.assistantCredits')).toBe(false)
    },
  )

  it.each<AdminRole>(['ops_admin', 'super_admin'])(
    'allows %s and renders signed facts without email',
    async (role) => {
      signInAs(role)
      renderCredits()
      const table = await screen.findByRole('table')
      expect(screen.getByText('149 credit')).toBeInTheDocument()
      expect(screen.getByText(creditPage.user.displayName)).toBeInTheDocument()
      expect(screen.queryByText(/@/)).not.toBeInTheDocument()
      expect(within(table).getByText('+50')).toBeInTheDocument()
      expect(within(table).getByText('Đóng góp địa điểm được duyệt')).toBeInTheDocument()
      expect(within(table).getByTitle(creditGrant.createdAt)).toHaveAttribute(
        'datetime',
        creditGrant.createdAt,
      )
      expect(within(table).getByRole('link', { name: /Đóng góp:/ })).toHaveAttribute(
        'href',
        `/submissions/${creditGrant.submissionId}`,
      )
      expect(roleCan(role, 'user.assistantCredits')).toBe(true)
    },
  )

  it('renders usage corrections and unknown reasons without failing the ledger', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({
          ...creditPage,
          items: [
            { ...creditGrant, delta: 2, reason: 'assistant_usage_adjustment' },
            { ...creditSpend, delta: -2, reason: 'future_reason' },
          ],
        }),
      ),
    )
    renderCredits()
    expect(await screen.findByText('Điều chỉnh sử dụng GoGo AI')).toBeInTheDocument()
    expect(screen.getByText('Lý do khác')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('-2')).toBeInTheDocument()
  })

  it('loads more with the unchanged user-scoped cursor, appends rows and uses the latest full balance', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    const cursors: (string | null)[] = []
    server.use(
      http.get(endpoint, async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        cursors.push(cursor)
        if (!cursor) return HttpResponse.json(creditPage)
        await delay(100)
        return HttpResponse.json({
          ...creditPage,
          balance: 148,
          items: [creditSpend],
          nextCursor: null,
        })
      }),
    )
    renderCredits()
    await user.click(await screen.findByRole('button', { name: 'Tải thêm' }))
    expect(screen.getByRole('button', { name: 'Tải thêm' })).toBeDisabled()
    await screen.findByText('Đã dùng cho tin nhắn GoGo AI')
    expect(cursors).toEqual([null, creditCursor])
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('148 credit')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument()
  })

  it('keeps rows on a load-more failure and retries the same cursor without duplicates', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    let fail = true
    const cursors: (string | null)[] = []
    server.use(
      http.get(endpoint, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        cursors.push(cursor)
        if (!cursor) return HttpResponse.json(creditPage)
        if (fail)
          return HttpResponse.json(
            { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' },
            { status: 500 },
          )
        return HttpResponse.json({ ...creditPage, items: [creditSpend], nextCursor: null })
      }),
    )
    renderCredits()
    await user.click(await screen.findByRole('button', { name: 'Tải thêm' }))
    await screen.findByText('Unavailable')
    expect(screen.getByText('+50')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    await screen.findByText('-1')
    expect(cursors).toEqual([null, creditCursor, creditCursor])
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  })

  it('accepts an exhausted empty page without dropping already loaded rows', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    server.use(
      http.get(endpoint, ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.has('cursor')
            ? { ...creditPage, balance: 150, items: [], nextCursor: null }
            : creditPage,
        ),
      ),
    )
    renderCredits()
    await user.click(await screen.findByRole('button', { name: 'Tải thêm' }))
    await screen.findByText('150 credit')
    expect(screen.getByText('+50')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có lịch sử credit')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument()
  })

  it('renders loading before the response', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(endpoint, async () => {
        await delay(100)
        return HttpResponse.json(creditPage)
      }),
    )
    renderCredits()
    expect(await screen.findByRole('status')).toBeInTheDocument()
    await screen.findByRole('table')
  })

  it('keeps zero balance visible with an empty ledger', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ ...creditPage, balance: 0, items: [], nextCursor: null }),
      ),
    )
    renderCredits()
    expect(await screen.findByText('Chưa có lịch sử credit')).toBeInTheDocument()
    expect(screen.getByText('0 credit')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders a request failure and retries', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' }, { status: 500 }),
      ),
    )
    renderCredits()
    expect(await screen.findByText('Unavailable')).toBeInTheDocument()
    server.use(http.get(endpoint, () => HttpResponse.json(creditPage)))
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    await screen.findByRole('table')
  })

  it('shows an unknown user as an error, not an empty balance', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ code: 'USER_NOT_FOUND', message: 'USER_NOT_FOUND' }, { status: 404 }),
      ),
    )
    renderCredits()
    expect(await screen.findByText('Không tìm thấy người dùng.')).toBeInTheDocument()
    expect(screen.queryByText('0 credit')).not.toBeInTheDocument()
  })

  it('hides previously loaded private rows after a mid-session 403 on load more', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    server.use(
      http.get(endpoint, ({ request }) =>
        new URL(request.url).searchParams.has('cursor')
          ? HttpResponse.json({ code: 'ROLE_DENIED', message: 'Denied' }, { status: 403 })
          : HttpResponse.json(creditPage),
      ),
    )
    renderCredits()
    await user.click(await screen.findByRole('button', { name: 'Tải thêm' }))
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('149 credit')).not.toBeInTheDocument()
  })

  it('renders offline without fetching or leaving a loading screen', async () => {
    signInAs('ops_admin')
    vi.mocked(useOnline).mockReturnValue(false)
    renderCredits()
    expect(await screen.findByText('Mất kết nối mạng')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders a failed network request as offline', async () => {
    signInAs('ops_admin')
    server.use(http.get(endpoint, () => HttpResponse.error()))
    renderCredits()
    expect(await screen.findByText('Mất kết nối mạng')).toBeInTheDocument()
  })

  it('opens from the existing user context and keeps Users active in navigation', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<UserListScreen />)
    await user.click(within(await screen.findByRole('table')).getByText('Nguyễn Lan Anh'))
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByRole('link', { name: 'Credit GoGo AI' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/users\/[^/]+\/assistant-credits$/),
    )
    expect(
      isLeafActive(
        NAV_LEAVES.find((leaf) => leaf.to === '/users')!,
        `/users/${creditUserId}/assistant-credits`,
      ),
    ).toBe(true)
  })
})
