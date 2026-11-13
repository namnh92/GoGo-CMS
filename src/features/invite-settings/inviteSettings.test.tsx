import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { useQueryClient } from '@tanstack/react-query'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { Sidebar } from '@/app/Sidebar'
import { isLeafActive, NAV_LEAVES } from '@/app/nav'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import type { InviteSettings } from './api'
import InviteSettingsScreen from './inviteSettings.view'

vi.mock('@/shared/ui/useOnline', () => ({ useOnline: vi.fn(() => true) }))
const URL = '*/v1/cms/settings/room-invites'
const setting: InviteSettings = {
  ttlSeconds: 86400,
  version: '1',
  etag: '"room-invite-ttl-v1-r1"',
  updatedAt: '2026-11-13T00:00:00.000Z',
  updatedByAdminId: null,
  minTtlSeconds: 1,
  maxTtlSeconds: 2147483647,
  codeMaxTtlSeconds: 172800,
}
const failure = (status: number, code: string, retryable = false) =>
  HttpResponse.json(
    {
      code,
      message: code,
      field_errors: [],
      request_id: 'request-test',
      retryable,
    },
    { status },
  )

function SessionControls() {
  const { logout, login } = useSession()
  const client = useQueryClient()
  return (
    <>
      <button onClick={() => void logout()}>Logout test</button>
      <button onClick={() => void login({ email: 'other@example.com', password: 'test-password' })}>
        Login B test
      </button>
      <button
        onClick={() => {
          expect(
            client
              .getQueriesData({ queryKey: ['inviteSettings'] })
              .every(([, data]) => data === undefined),
          ).toBe(true)
        }}
      >
        Check cache test
      </button>
    </>
  )
}
const render = (extra = false) =>
  renderWithProviders(
    <>
      {extra && (
        <>
          <Sidebar />
          <SessionControls />
        </>
      )}
      <InviteSettingsScreen />
    </>,
    { route: '/settings/room-invites', staleTime: 60000 },
  )
const input = () => screen.getByRole('textbox', { name: 'Thời lượng' })
async function edit(value = '5', unit = 'minutes') {
  await screen.findByTestId('invite-settings-current')
  await userEvent.clear(input())
  await userEvent.type(input(), value)
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Đơn vị' }), unit)
}
async function confirm() {
  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
}

beforeEach(() => {
  vi.mocked(useOnline).mockReturnValue(true)
  signInAs('super_admin')
  server.use(
    http.get(URL, () => HttpResponse.json(setting)),
    http.get('*/v1/cms/audit', () => HttpResponse.json({ items: [], nextCursor: null })),
  )
})

describe('invite lifetime settings CMS-C', () => {
  it.each(['editor', 'moderator', 'ops_admin'] as const)(
    'hides navigation and forbids direct access for %s without a request',
    async (role) => {
      const get = vi.fn(() => HttpResponse.json(setting))
      server.use(http.get(URL, get))
      signInAs(role)
      render(true)
      expect(screen.queryByRole('link', { name: 'Thời hạn lời mời' })).not.toBeInTheDocument()
      expect(screen.getByText('Không đủ quyền')).toBeInTheDocument()
      expect(get).not.toHaveBeenCalled()
    },
  )
  it('shows super-admin navigation without also activating ranking settings', async () => {
    render(true)
    expect(screen.getByRole('link', { name: 'Thời hạn lời mời' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      isLeafActive(
        NAV_LEAVES.find((leaf) => leaf.to === '/settings')!,
        '/settings/room-invites',
      ),
    ).toBe(false)
    expect(await screen.findByTestId('invite-settings-current')).toHaveTextContent('24 giờ')
    expect(input()).toHaveValue('24')
    expect(screen.getByText('Hệ thống (khởi tạo)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })
  it('renders a skeleton without a fake input until GET completes', async () => {
    server.use(
      http.get(URL, async () => {
        await delay(50)
        return HttpResponse.json(setting)
      }),
    )
    render()
    expect(screen.getByTestId('invite-settings-loading')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await screen.findByRole('textbox')
  })
  it('validates integers and overflow after unit conversion, then displays normalized seconds', async () => {
    render()
    await edit('0')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    await edit('1.5')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    await edit('24856', 'days')
    expect(screen.getByText(/không được vượt 2147483647/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    await edit('5')
    expect(screen.getByText('Thời lượng sau chuyển đổi: 300 giây')).toBeInTheDocument()
  })
  it('requires confirmation, sends generated-contract body and headers, refetches value and audit', async () => {
    const requests: Request[] = []
    const reads = vi.fn(() =>
      HttpResponse.json(
        requests.length
          ? { ...setting, ttlSeconds: 300, version: '2', etag: '"r2"', updatedByAdminId: 'admin-1' }
          : setting,
      ),
    )
    const audits = vi.fn(() => HttpResponse.json({ items: [], nextCursor: null }))
    server.use(
      http.get(URL, reads),
      http.get('*/v1/cms/audit', audits),
      http.put(URL, ({ request }) => {
        requests.push(request.clone())
        return HttpResponse.json({ ...setting, ttlSeconds: 300 })
      }),
    )
    render()
    await edit()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Lời mời đã tạo giữ nguyên/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Mã 6 số tối đa 48 giờ/)).toBeInTheDocument()
    expect(requests).toHaveLength(0)
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Đã lưu — áp dụng cho lời mời mới.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('invite-settings-current')).toHaveTextContent('5 phút'),
    )
    expect(await requests[0]!.json()).toEqual({ ttlSeconds: 300 })
    expect(requests[0]!.cache).toBe('no-store')
    expect(requests[0]!.headers.get('If-Match')).toBe(setting.etag)
    expect(requests[0]!.headers.get('Idempotency-Key')).toBeTruthy()
    expect(requests[0]!.headers.get('x-gogo-csrf')).toBe('mock-csrf-token')
    expect(reads.mock.calls.length).toBeGreaterThan(1)
    expect(audits.mock.calls.length).toBeGreaterThan(1)
    expect(screen.getByText('admin-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })
  it.each([412, 428])(
    'refetches on %i, preserves draft and requires a new confirmation/key',
    async (status) => {
      const puts: Request[] = []
      server.use(
        http.get(URL, () =>
          HttpResponse.json(puts.length ? { ...setting, ttlSeconds: 7200, etag: '"r2"' } : setting),
        ),
        http.put(URL, ({ request }) => {
          puts.push(request.clone())
          return puts.length === 1
            ? failure(status, 'PRECONDITION_FAILED')
            : HttpResponse.json(setting)
        }),
      )
      render()
      await edit()
      await confirm()
      await screen.findByText(/Phiên bản đã thay đổi/)
      await waitFor(() =>
        expect(screen.getByTestId('invite-settings-current')).toHaveTextContent('2 giờ'),
      )
      expect(input()).toHaveValue('5')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(puts).toHaveLength(1)
      await confirm()
      await waitFor(() => expect(puts).toHaveLength(2))
      expect(puts[1]!.headers.get('If-Match')).toBe('"r2"')
      expect(puts[1]!.headers.get('Idempotency-Key')).not.toBe(
        puts[0]!.headers.get('Idempotency-Key'),
      )
    },
  )
  it.each(['network', '503', '409'])(
    'retries an uncertain %s outcome with the same body/ETag/key',
    async (mode) => {
      const puts: Request[] = []
      server.use(
        http.put(URL, ({ request }) => {
          puts.push(request.clone())
          if (puts.length > 1) return HttpResponse.json(setting)
          return mode === 'network'
            ? HttpResponse.error()
            : failure(
                Number(mode),
                mode === '409' ? 'IDEMPOTENT_REQUEST_IN_FLIGHT' : 'INVITE_TTL_SETTING_UNAVAILABLE',
                true,
              )
        }),
      )
      render()
      await edit()
      await confirm()
      const retry = await screen.findByRole('button', { name: 'Thử lại' })
      expect(input()).toBeDisabled()
      await userEvent.click(retry)
      await screen.findByText('Đã lưu — áp dụng cho lời mời mới.')
      expect(puts).toHaveLength(2)
      expect(puts[1]!.headers.get('Idempotency-Key')).toBe(puts[0]!.headers.get('Idempotency-Key'))
      expect(puts[1]!.headers.get('If-Match')).toBe(puts[0]!.headers.get('If-Match'))
      expect(await puts[1]!.json()).toEqual(await puts[0]!.json())
    },
  )
  it('preserves an uncertain intent when closing and reopening its confirmation', async () => {
    const keys: (string | null)[] = []
    server.use(
      http.put(URL, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return keys.length === 1 ? HttpResponse.error() : HttpResponse.json(setting)
      }),
    )
    render()
    await edit()
    await confirm()
    await screen.findByRole('button', { name: 'Thử lại' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(input()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Thử lại' }),
    )
    await screen.findByText('Đã lưu — áp dụng cho lời mời mới.')
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
  })
  it('loads setting and audit without browser caching and scopes the history to the singleton', async () => {
    const caches: RequestCache[] = []
    let auditUrl = ''
    server.use(
      http.get(URL, ({ request }) => {
        caches.push(request.cache)
        return HttpResponse.json(setting)
      }),
      http.get('*/v1/cms/audit', ({ request }) => {
        caches.push(request.cache)
        auditUrl = request.url
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )
    render()
    await waitFor(() => expect(caches).toHaveLength(2))
    expect(caches).toEqual(['no-store', 'no-store'])
    const query = new globalThis.URL(auditUrl).searchParams
    expect(query.get('resourceType')).toBe('room_invite_ttl')
    expect(query.get('resourceId')).toBe('global')
    expect(query.get('limit')).toBe('10')
  })
  it('does not render a fake form when initially offline', () => {
    vi.mocked(useOnline).mockReturnValue(false)
    render()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByTestId('invite-settings-loading')).not.toBeInTheDocument()
  })
  it('does not PUT for an equivalent duration, and cancel restores focus', async () => {
    const put = vi.fn(() => HttpResponse.json(setting))
    server.use(http.put(URL, put))
    render()
    await edit('1', 'days')
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    await edit()
    const save = screen.getByRole('button', { name: 'Lưu' })
    await userEvent.click(save)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(save).toHaveFocus()
    expect(put).not.toHaveBeenCalled()
  })
  it.each([403, 503, 500])('handles a GET %i without displaying a fake value', async (status) => {
    server.use(
      http.get(URL, () =>
        failure(status, status === 403 ? 'SUPER_ADMIN_SSO_ONLY' : 'INVITE_TTL_SETTING_UNAVAILABLE'),
      ),
    )
    render()
    await screen.findByText(status === 403 ? 'Không đủ quyền' : 'Không tải được dữ liệu')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    if (status !== 403) {
      server.use(http.get(URL, () => HttpResponse.json(setting)))
      await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
      await screen.findByRole('textbox')
    }
  })
  it('clears the sensitive screen/cache when a save gets 403', async () => {
    server.use(http.put(URL, () => failure(403, 'SUPER_ADMIN_SSO_ONLY')))
    render(true)
    await edit()
    await confirm()
    await screen.findByText('Không đủ quyền')
    expect(screen.queryByTestId('invite-settings-current')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Check cache test'))
  })
  it('keeps draft offline without submitting on reconnect', async () => {
    const put = vi.fn(() => HttpResponse.json(setting))
    server.use(http.put(URL, put))
    const view = render()
    await edit()
    vi.mocked(useOnline).mockReturnValue(false)
    view.rerender(
      <>
        {false}
        <InviteSettingsScreen />
      </>,
    )
    expect(input()).toHaveValue('5')
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    vi.mocked(useOnline).mockReturnValue(true)
    view.rerender(
      <>
        {false}
        <InviteSettingsScreen />
      </>,
    )
    expect(put).not.toHaveBeenCalled()
  })
  it('drops an in-flight old-session save and draft after logout/login B', async () => {
    let resolve!: () => void
    const barrier = new Promise<void>((done) => {
      resolve = done
    })
    const started = vi.fn()
    server.use(
      http.put(URL, async () => {
        started()
        await barrier
        return HttpResponse.json({ ...setting, ttlSeconds: 300 })
      }),
      http.post('*/v1/cms/auth/login', () =>
        HttpResponse.json({ role: 'super_admin', displayName: 'B' }),
      ),
    )
    render(true)
    await edit()
    await confirm()
    await waitFor(() => expect(started).toHaveBeenCalled())
    await userEvent.click(screen.getByText('Logout test'))
    await userEvent.click(screen.getByText('Login B test'))
    await waitFor(() => expect(input()).toHaveValue('24'))
    await act(async () => {
      resolve()
      await barrier
    })
    expect(screen.queryByText('Đã lưu — áp dụng cho lời mời mới.')).not.toBeInTheDocument()
    expect(input()).toHaveValue('24')
  })
})
