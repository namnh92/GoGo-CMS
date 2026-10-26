import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders } from '@/shared/test/render'
import { CHANGE_PASSWORD_PATH, RequireAuth } from '@/app/RequireAuth'
import LoginScreen from './login.view'
import ChangePasswordScreen from './changePassword.view'
import { ssoRedirect } from './ssoRedirect'

// GoGo-BE#687 rev 6 — the button on /login is a real page load of /sso (where
// Access gates); jsdom cannot navigate, so the load is recorded instead.
vi.mock('./ssoRedirect', async (orig) => ({
  ...(await orig<typeof import('./ssoRedirect')>()),
  ssoRedirect: vi.fn(),
}))

/**
 * GoGo-BE#679 / ADR-0032 — the sign-in screen renders the doors the API says
 * are open (`GET /cms/auth/methods`), and single sign-on through Cloudflare
 * Access is a button, never automatic. Matrix: methods × exchange answer.
 */

const HINT_KEY = 'gogo.cms.session-hint'

function methods(body: { password: boolean; accessSso: boolean }) {
  server.use(http.get('/v1/cms/auth/methods', () => HttpResponse.json(body)))
}

function envelope(status: number, code: string) {
  return HttpResponse.json(
    { code, message: code, field_errors: [], request_id: 'test', retryable: status >= 500 },
    { status },
  )
}

/** Counts exchange calls, answering with `answer`. */
function exchange(answer: () => Response | Promise<Response>) {
  const calls = { count: 0 }
  server.use(
    http.post('/v1/cms/auth/access-exchange', () => {
      calls.count += 1
      return answer()
    }),
  )
  return calls
}

function session(mustChangePassword = false) {
  return HttpResponse.json(
    { accessToken: 'sso-token', role: 'super_admin', displayName: 'owner', mustChangePassword },
    { status: 201 },
  )
}

/** Where the console landed after sign-in: pathname + search, exactly. */
function Landing() {
  const location = useLocation()
  return <p data-testid="landing">{`${location.pathname}${location.search}`}</p>
}

/** As app(), with a probe that shows the exact landing location. */
function probedApp() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/sso" element={<LoginScreen />} />
      <Route
        path="*"
        element={
          <RequireAuth>
            <Landing />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

function app() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/sso" element={<LoginScreen />} />
      <Route
        path={CHANGE_PASSWORD_PATH}
        element={
          <RequireAuth>
            <ChangePasswordScreen />
          </RequireAuth>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <p>console</p>
          </RequireAuth>
        }
      />
    </Routes>
  )
}

afterEach(() => {
  window.localStorage.removeItem(HINT_KEY)
})

describe('sign-in doors (GoGo-BE#679)', () => {
  it('shows a skeleton while it asks which doors exist, and no form', async () => {
    server.use(
      http.get('/v1/cms/auth/methods', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderWithProviders(app(), { route: '/login' })

    expect(await screen.findByLabelText('Đang kiểm tra cách đăng nhập')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.queryByLabelText(/Mật khẩu/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cloudflare Access/ })).not.toBeInTheDocument()
  })

  it('renders only single sign-on where the password door is closed — no password field in the DOM', async () => {
    methods({ password: false, accessSso: true })
    renderWithProviders(app(), { route: '/login' })

    expect(
      await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/Mật khẩu/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Email công việc/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).not.toBeInTheDocument()
  })

  it('offers both where both are open, single sign-on first', async () => {
    methods({ password: true, accessSso: true })
    renderWithProviders(app(), { route: '/login' })

    const sso = await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' })
    const submit = screen.getByRole('button', { name: 'Tiếp tục' })
    expect(screen.getByLabelText(/Mật khẩu/)).toBeInTheDocument()
    expect(screen.getByText('Hoặc đăng nhập bằng mật khẩu')).toBeInTheDocument()
    // Single sign-on comes first in reading order.
    expect(sso.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps today’s form where only the password door is open', async () => {
    renderWithProviders(app(), { route: '/login' })

    expect(await screen.findByLabelText(/Mật khẩu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cloudflare Access/ })).not.toBeInTheDocument()
  })

  it('treats an API without the methods route as password-only', async () => {
    server.use(http.get('/v1/cms/auth/methods', () => envelope(404, 'NOT_FOUND')))
    renderWithProviders(app(), { route: '/login' })

    expect(await screen.findByLabelText(/Mật khẩu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cloudflare Access/ })).not.toBeInTheDocument()
  })

  it('says so and offers a retry when the doors cannot be read, guessing no form', async () => {
    let fail = true
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        fail ? envelope(500, 'INTERNAL') : HttpResponse.json({ password: false, accessSso: true }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/login' })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không lấy được danh sách cách đăng nhập',
    )
    expect(screen.queryByLabelText(/Mật khẩu/)).not.toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(
      await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }),
    ).toBeInTheDocument()
  })

  it('says no door is configured rather than rendering an empty card', async () => {
    methods({ password: false, accessSso: false })
    renderWithProviders(app(), { route: '/login' })

    expect(await screen.findByRole('alert')).toHaveTextContent('chưa cấu hình cách đăng nhập nào')
  })
})

describe('single sign-on exchange (GoGo-BE#679)', () => {
  it('rev 6: the button on /login loads /sso for Access, carrying the return path', async () => {
    methods({ password: true, accessSso: true })
    const calls = exchange(() => session())
    const user = userEvent.setup()
    renderWithProviders(app(), {
      route: { pathname: '/login', state: { from: '/places?q=pho' } },
    })
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    expect(vi.mocked(ssoRedirect)).toHaveBeenLastCalledWith('/sso?start=1&from=%2Fplaces%3Fq%3Dpho')
    // No exchange from /login: it would carry no assertion once only /sso is gated.
    expect(calls.count).toBe(0)
  })

  it('rev 6: a valid from= is where the exchange lands', async () => {
    methods({ password: true, accessSso: true })
    exchange(() => session())
    renderWithProviders(probedApp(), { route: '/sso?start=1&from=%2Fplaces%3Fq%3Dpho' })
    expect((await screen.findByTestId('landing')).textContent).toBe('/places?q=pho')
  })

  it.each([
    '//evil.example/x',
    '/\\evil.example/x',
    '\\evil.example',
    'https://evil.example/x',
    'javascript:alert(1)',
  ])('rev 6: an unsafe from=%s lands on the role default instead', async (from) => {
    methods({ password: true, accessSso: true })
    exchange(() => session())
    renderWithProviders(probedApp(), {
      route: `/sso?start=1&from=${encodeURIComponent(from)}`,
    })
    // session() is a super_admin, whose default landing is '/'.
    const landing = await screen.findByTestId('landing')
    expect(landing.textContent).toBe('/')
  })

  it('rev 6: unsafe router state is dropped too', async () => {
    methods({ password: true, accessSso: true })
    const user = userEvent.setup()
    renderWithProviders(app(), {
      route: { pathname: '/login', state: { from: '//evil.example/x' } },
    })
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    expect(vi.mocked(ssoRedirect)).toHaveBeenLastCalledWith('/sso?start=1')
  })

  it('rev 6: a missing assertion on /sso offers the page load of /sso that fixes it', async () => {
    methods({ password: true, accessSso: true })
    exchange(() => envelope(401, 'ACCESS_ASSERTION_MISSING'))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso?start=1' })
    // DEV build in tests: the local variant of the message; the action is the same.
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Tải lại trang' }))
    expect(vi.mocked(ssoRedirect)).toHaveBeenLastCalledWith('/sso?start=1')
  })

  it('rev 6: /sso?start=1 exchanges once on arrival and opens the console', async () => {
    methods({ password: true, accessSso: true })
    const calls = exchange(() => session())
    renderWithProviders(app(), { route: '/sso?start=1' })
    expect(await screen.findByText('console')).toBeInTheDocument()
    expect(calls.count).toBe(1)
  })

  it('rev 6: /sso without start=1 never exchanges by itself', async () => {
    methods({ password: true, accessSso: true })
    const calls = exchange(() => session())
    renderWithProviders(app(), { route: '/sso' })
    await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls.count).toBe(0)
  })

  it('never exchanges on its own — only on a click', async () => {
    methods({ password: false, accessSso: true })
    const calls = exchange(() => session())
    renderWithProviders(app(), { route: '/login' })

    await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' })
    // Give an effect every chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls.count).toBe(0)
  })

  it('opens the console on a click', async () => {
    methods({ password: false, accessSso: true })
    const calls = exchange(() => session())
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    expect(await screen.findByText('console')).toBeInTheDocument()
    expect(calls.count).toBe(1)
  })

  /*
   * F-01 of the shape review. The login screen's own change step submits the
   * password typed into its form, and a single sign-on typed none. The account
   * goes to /account/password instead, which asks for the current password.
   */
  it('sends an account with a reset outstanding to the change screen, where the obligation can be cleared', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => session(true))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    const current = await screen.findByLabelText(/Mật khẩu hiện tại/)
    expect(screen.queryByText('console')).not.toBeInTheDocument()

    await user.type(current, 'temporary-password-1')
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'a-brand-new-password')
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu mới/), 'a-brand-new-password')
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(HINT_KEY) ?? '{}')).toMatchObject({
        mustChangePassword: false,
      }),
    )
  })

  it('explains a verified identity with no staff account, and offers another identity', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => envelope(403, 'ADMIN_ONLY'))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'không có tài khoản quản trị đang hoạt động',
    )
    expect(screen.getByRole('link', { name: 'Đăng nhập bằng danh tính khác' })).toHaveAttribute(
      'href',
      '/cdn-cgi/access/logout',
    )
  })

  it('reads a stale assertion as an Access matter, not an expired GoGo session', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => envelope(401, 'ACCESS_ASSERTION_INVALID'))
    let refreshes = 0
    server.use(
      http.post('/v1/cms/auth/refresh', () => {
        refreshes += 1
        return envelope(401, 'INVALID_REFRESH_TOKEN')
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên Cloudflare Access đã hết hạn')
    expect(refreshes).toBe(0)
  })

  it('says to come through Access when the request carried no assertion', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => envelope(401, 'ACCESS_ASSERTION_MISSING'))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    // Vitest runs with import.meta.env.DEV, so the local-dev hint is the one shown.
    expect(await screen.findByRole('alert')).toHaveTextContent('CF_ACCESS_TOKEN')
  })

  it('asks for a retry when the identity provider’s keys are unreachable', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => envelope(503, 'ACCESS_KEYS_UNAVAILABLE'))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tạm thời không kết nối được')
  })

  it('re-reads the doors when they changed under the screen', async () => {
    let sso = true
    server.use(
      http.get('/v1/cms/auth/methods', () => HttpResponse.json({ password: true, accessSso: sso })),
    )
    exchange(() => {
      sso = false
      return envelope(503, 'ACCESS_SSO_NOT_CONFIGURED')
    })
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Cloudflare Access/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText(/Mật khẩu/)).toBeInTheDocument()
  })

  it('drops the password form when the door closes under it', async () => {
    let password = true
    server.use(
      http.get('/v1/cms/auth/methods', () => HttpResponse.json({ password, accessSso: true })),
      http.post('/v1/cms/auth/login', () => {
        password = false
        return envelope(403, 'PASSWORD_LOGIN_DISABLED')
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/login' })

    await user.type(await screen.findByLabelText(/Email công việc/), 'ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    await waitFor(() => expect(screen.queryByLabelText(/Mật khẩu/)).not.toBeInTheDocument())
    expect(
      screen.getByRole('button', { name: 'Đăng nhập qua Cloudflare Access' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Đăng nhập bằng mật khẩu đã tắt')
  })
})

/** Review round 1 on GoGo-CMS#232: the rest of the matrix, cell by cell. */
describe('sign-in matrix, remaining cells (GoGo-CMS#232 review)', () => {
  const ssoButton = () => screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' })

  it('makes single sign-on the one filled CTA when both doors are open', async () => {
    methods({ password: true, accessSso: true })
    renderWithProviders(app(), { route: '/login' })

    expect(await ssoButton()).toHaveClass('bg-accent-primary')
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).not.toHaveClass('bg-accent-primary')
  })

  it('renders no sign-in control at all when no door is open', async () => {
    methods({ password: false, accessSso: false })
    renderWithProviders(app(), { route: '/login' })

    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: /Cloudflare Access/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Mật khẩu/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Email công việc/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).not.toBeInTheDocument()
  })

  // A retry puts the query back to pending: the card shows the busy skeleton
  // and the retry control is gone, so it cannot be pressed again meanwhile.
  it('shows the retry as busy while the doors are being re-read', async () => {
    let calls = 0
    server.use(
      http.get('/v1/cms/auth/methods', async () => {
        calls += 1
        if (calls === 1) return envelope(500, 'INTERNAL')
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/login' })

    const retry = await screen.findByRole('button', { name: 'Thử lại' })
    await user.click(retry)
    expect(await screen.findByLabelText('Đang kiểm tra cách đăng nhập')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.queryByRole('button', { name: /Thử lại/ })).not.toBeInTheDocument()
  })

  it('never exchanges on its own across a re-read of the doors or a remount', async () => {
    let fail = true
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        fail ? envelope(500, 'INTERNAL') : HttpResponse.json({ password: false, accessSso: true }),
      ),
    )
    const calls = exchange(() => session())
    const user = userEvent.setup()
    const first = renderWithProviders(app(), { route: '/login' })

    const retry = await screen.findByRole('button', { name: 'Thử lại' })
    fail = false
    await user.click(retry)
    await ssoButton()
    first.unmount()

    // Back on the sign-in screen, as after a logout.
    renderWithProviders(app(), { route: '/login' })
    await ssoButton()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls.count).toBe(0)
  })

  it('adopts an SSO session the same way as a password one: the hint is written', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => session())
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await ssoButton())
    await screen.findByText('console')
    expect(JSON.parse(window.localStorage.getItem(HINT_KEY) ?? 'null')).toEqual({
      role: 'super_admin',
      displayName: 'owner',
      mustChangePassword: false,
    })
  })

  it('offers a reload when the Access assertion is stale', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => envelope(401, 'ACCESS_ASSERTION_INVALID'))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await ssoButton())
    expect(await screen.findByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument()
  })

  it('reports a cross-site refusal as an error, without a session', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => envelope(403, 'CROSS_SITE_REQUEST'))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await ssoButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('CROSS_SITE_REQUEST')
    expect(window.localStorage.getItem(HINT_KEY)).toBeNull()
  })

  it('re-reads the doors when the exchange says the password door changed', async () => {
    let calls = 0
    server.use(
      http.get('/v1/cms/auth/methods', () => {
        calls += 1
        return HttpResponse.json({ password: false, accessSso: true })
      }),
    )
    exchange(() => envelope(403, 'PASSWORD_LOGIN_DISABLED'))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await ssoButton())
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.getByRole('alert')).toHaveTextContent('vừa thay đổi')
  })

  it('says to wait when the exchange is rate limited', async () => {
    methods({ password: false, accessSso: true })
    exchange(() => envelope(429, 'RATE_LIMITED'))
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/sso' })

    await user.click(await ssoButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã thử quá nhiều lần')
  })

  /*
   * The door closes under an open form: the submit answers
   * PASSWORD_LOGIN_DISABLED, the form goes, single sign-on stays.
   */
  it('drops the password form when the door closes under it', async () => {
    let password = true
    server.use(
      http.get('/v1/cms/auth/methods', () => HttpResponse.json({ password, accessSso: true })),
      http.post('/v1/cms/auth/login', () => {
        password = false
        return envelope(403, 'PASSWORD_LOGIN_DISABLED')
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/login' })

    await user.type(await screen.findByLabelText(/Email công việc/), 'ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    await waitFor(() => expect(screen.queryByLabelText(/Mật khẩu/)).not.toBeInTheDocument())
    expect(await ssoButton()).toBeInTheDocument()
  })
})

/** GoGo-BE#687 — the super admin signs in through Access only; other roles keep the form. */
describe('super admin through Access only (GoGo-BE#687)', () => {
  it('says so beside the single sign-on button when the API reports it, and keeps the form', async () => {
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        HttpResponse.json({ password: true, accessSso: true, superAdminSsoOnly: true }),
      ),
    )
    renderWithProviders(app(), { route: '/login' })
    expect(await screen.findByText(/Các vai trò khác vẫn dùng được mật khẩu/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Mật khẩu/)).toBeInTheDocument()
  })

  it('says nothing about it when the API does not report it', async () => {
    methods({ password: true, accessSso: true })
    renderWithProviders(app(), { route: '/login' })
    await screen.findByRole('button', { name: 'Đăng nhập qua Cloudflare Access' })
    expect(screen.queryByText(/Các vai trò khác vẫn dùng được mật khẩu/)).not.toBeInTheDocument()
  })

  it('points the super admin to single sign-on when the password is refused for that account', async () => {
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        HttpResponse.json({ password: true, accessSso: true, superAdminSsoOnly: true }),
      ),
      http.post('/v1/cms/auth/login', () => envelope(403, 'SUPER_ADMIN_SSO_ONLY')),
    )
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/login' })
    await user.type(await screen.findByLabelText(/Email công việc/), 'boss@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tài khoản quản trị tối cao chỉ đăng nhập qua Cloudflare Access',
    )
    // The form stays: other roles still use it.
    expect(screen.getByLabelText(/Mật khẩu/)).toBeInTheDocument()
  })
  it('drops the super admin warning when another account then signs in with a password (review F-05)', async () => {
    let refuse = true
    server.use(
      http.get('/v1/cms/auth/methods', () =>
        HttpResponse.json({ password: true, accessSso: true, superAdminSsoOnly: true }),
      ),
      http.post('/v1/cms/auth/login', () =>
        refuse ? envelope(403, 'SUPER_ADMIN_SSO_ONLY') : envelope(401, 'INVALID_CREDENTIALS'),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(app(), { route: '/login' })
    const email = await screen.findByLabelText(/Email công việc/)
    await user.type(email, 'boss@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await screen.findByText(/Tài khoản quản trị tối cao chỉ đăng nhập qua Cloudflare Access/)

    refuse = false
    await user.clear(email)
    await user.type(email, 'editor@gogo.vn')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(await screen.findByText('Email hoặc mật khẩu không đúng.')).toBeInTheDocument()
    expect(
      screen.queryByText(/Tài khoản quản trị tối cao chỉ đăng nhập qua Cloudflare Access/),
    ).not.toBeInTheDocument()
  })
})
