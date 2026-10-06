import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { privacyRequests } from '@/shared/test/fixtures'
import type { PrivacyRequest } from '@/shared/api/contracts'
import UserListScreen from '@/features/users/userList.view'
import { exportAppUser } from '@/features/users/api'
import PrivacyListScreen from './privacyList.view'
import { markPrivacyDelivered } from './api'

/*
 * GoGo-BE#256 / ADR-0033 (contract alpha.69): a CMS export is issued for the
 * account holder to redeem from their own session. Staff get `202` metadata,
 * never the data — so the console must never download or render a payload,
 * and must show the export's state facts instead.
 *
 * Every response here is a test-local override shaped as the contract says,
 * plus a stray `data` key a buggy or old server might add: whatever arrives,
 * the console must not turn it into a file or text.
 */

const LEAK = 'leak.subject@example.com'
const NOW = '2026-10-06T08:00:00.000Z'

const pendingExport = {
  id: '77777777-0000-4000-8000-000000000001',
  status: 'pending',
  initiatedBy: 'support',
  createdAt: NOW,
}

const readyExport = {
  ...pendingExport,
  status: 'ready',
  readyAt: '2026-10-06T08:05:00.000Z',
  expiresAt: '2026-10-07T08:05:00.000Z',
}

const legacy = privacyRequests.find(
  (row) => row.type === 'export' && row.executedAt && !row.deliveredAt,
)!

const executable: PrivacyRequest = {
  ...privacyRequests[0]!,
  id: '66666666-0000-4000-8000-000000000901',
  status: 'acknowledged',
  subject: {
    subjectType: 'user',
    userId: '11111111-0000-4000-8000-000000000001',
    contactEmail: null,
    externalReference: null,
    identityStatus: 'matched',
  },
  ticketReference: 'SUP-2001',
  operatorNote: null,
}

let objectUrl: ReturnType<typeof vi.fn>

beforeEach(() => {
  objectUrl = vi.fn(() => 'blob:mock')
  Object.defineProperty(URL, 'createObjectURL', { value: objectUrl, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Ledger rows the list and detail answer, overriding the default fixtures. */
function serveLedger(rows: () => PrivacyRequest[]) {
  server.use(
    http.get('*/cms/privacy-requests', () =>
      HttpResponse.json({ items: rows(), nextCursor: null, totalCount: rows().length }),
    ),
    http.get('*/cms/privacy-requests/:id', ({ params }) => {
      const row = rows().find((item) => item.id === params.id)
      return row
        ? HttpResponse.json(row)
        : HttpResponse.json({ code: 'NOT_FOUND', message: 'nope' }, { status: 404 })
    }),
  )
}

async function openUserExport() {
  const user = userEvent.setup()
  renderWithProviders(<UserListScreen />)
  const table = await screen.findByRole('table')
  await user.click(within(table).getByText('Nguyễn Lan Anh'))
  const drawer = await screen.findByRole('dialog')
  await user.click(await within(drawer).findByRole('button', { name: 'Xuất dữ liệu (GDPR)' }))
  const dialogs = await screen.findAllByRole('dialog')
  const modal = dialogs[dialogs.length - 1]!
  await user.type(within(modal).getByLabelText(/Lý do/), 'SUP-2001 yêu cầu bản sao')
  await user.click(within(modal).getAllByRole('button', { name: 'Xuất dữ liệu (GDPR)' }).at(-1)!)
  return { user, modal }
}

describe('secure export — direct user export (GoGo-BE#256)', () => {
  it('shows the 202 export facts and never downloads or renders a payload', async () => {
    signInAs('ops_admin')
    server.use(
      http.post('*/cms/users/:id/export', () =>
        HttpResponse.json(
          {
            privacyRequestId: '66666666-0000-4000-8000-000000000902',
            export: pendingExport,
            data: { profile: { email: LEAK } },
          },
          { status: 202 },
        ),
      ),
    )
    const { modal } = await openUserExport()

    // Settled either way: the old console builds a file, the new one shows facts.
    await waitFor(() =>
      expect(objectUrl.mock.calls.length > 0 || screen.queryByText('Đang chờ tạo') !== null).toBe(
        true,
      ),
    )
    expect(objectUrl).not.toHaveBeenCalled()
    expect(within(modal).getByText('Đang chờ tạo')).toBeInTheDocument()
    expect(within(modal).getByText(/Nhân viên không nhận và không chuyển tiếp/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(LEAK)
  })

  it('explains 503 EXPORT_UNAVAILABLE in the console language', async () => {
    signInAs('ops_admin')
    server.use(
      http.post('*/cms/users/:id/export', () =>
        HttpResponse.json(
          {
            code: 'EXPORT_UNAVAILABLE',
            message: 'secure export is not configured',
            field_errors: [],
            request_id: 'r-1',
            retryable: false,
          },
          { status: 503 },
        ),
      ),
    )
    const { modal } = await openUserExport()

    expect(await within(modal).findByText(/chưa cấu hình xuất dữ liệu bảo mật/)).toBeInTheDocument()
    expect(objectUrl).not.toHaveBeenCalled()
  })

  it('explains 409 SUBJECT_CANNOT_SIGN_IN — account recovery first', async () => {
    signInAs('ops_admin')
    server.use(
      http.post('*/cms/users/:id/export', () =>
        HttpResponse.json(
          { code: 'SUBJECT_CANNOT_SIGN_IN', message: 'x', field_errors: [], retryable: false },
          { status: 409 },
        ),
      ),
    )
    const { modal } = await openUserExport()

    expect(await within(modal).findByText(/khôi phục tài khoản/)).toBeInTheDocument()
  })
})

describe('secure export — privacy request execute (GoGo-BE#256)', () => {
  it('executes an export to 202 metadata: facts shown, no file, no data', async () => {
    signInAs('ops_admin')
    let current: PrivacyRequest = executable
    serveLedger(() => [current, legacy])
    server.use(
      http.post('*/cms/privacy-requests/:id/execute', () => {
        current = {
          ...executable,
          status: 'in_progress',
          executedAt: NOW,
          secureExport: pendingExport,
        } as PrivacyRequest
        return HttpResponse.json(
          {
            request: { ...current, secureExport: undefined },
            export: pendingExport,
            data: { profile: { email: LEAK } },
          },
          { status: 202 },
        )
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(executable.subject.userId!))
    const drawer = await screen.findByRole('dialog')
    // Matched by verb so the pre-alpha.69 console is exercised too.
    await user.click(await within(drawer).findByRole('button', { name: /xuất/ }))

    await waitFor(() =>
      expect(
        objectUrl.mock.calls.length > 0 || within(drawer).queryByText('Đang chờ tạo') !== null,
      ).toBe(true),
    )
    expect(objectUrl).not.toHaveBeenCalled()
    expect(within(drawer).getByText('Đang chờ tạo')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(LEAK)
    // Delivery of a secure export is the server's: no manual record offered,
    // and an active export is not issued twice.
    await waitFor(() =>
      expect(
        within(drawer).queryByRole('button', { name: 'Ghi nhận đã bàn giao' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      within(drawer).queryByRole('button', { name: 'Phát hành bản xuất bảo mật' }),
    ).not.toBeInTheDocument()
  })

  it('renders a ready export with its expiry from the detail facts', async () => {
    signInAs('ops_admin')
    const ready = {
      ...executable,
      status: 'closed',
      outcome: 'completed',
      executedAt: NOW,
      completedAt: NOW,
      closedAt: NOW,
      sla: 'COMPLETED',
      secureExport: readyExport,
    } as PrivacyRequest
    serveLedger(() => [ready])
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(executable.subject.userId!))
    const drawer = await screen.findByRole('dialog')

    expect(await within(drawer).findByText('Sẵn sàng để chủ tài khoản tải')).toBeInTheDocument()
    expect(within(drawer).getByText('Hết hạn lúc')).toBeInTheDocument()
    expect(
      within(drawer).queryByRole('button', { name: 'Ghi nhận đã bàn giao' }),
    ).not.toBeInTheDocument()
  })

  it('explains 503 EXPORT_UNAVAILABLE on execute', async () => {
    signInAs('ops_admin')
    serveLedger(() => [executable])
    server.use(
      http.post('*/cms/privacy-requests/:id/execute', () =>
        HttpResponse.json(
          { code: 'EXPORT_UNAVAILABLE', message: 'x', field_errors: [], retryable: false },
          { status: 503 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(executable.subject.userId!))
    const drawer = await screen.findByRole('dialog')
    await user.click(await within(drawer).findByRole('button', { name: /xuất/ }))

    expect(
      await within(drawer).findByText(/chưa cấu hình xuất dữ liệu bảo mật/),
    ).toBeInTheDocument()
  })

  it('never offers secure_download as a manual delivery, and explains DELIVERY_SERVER_OWNED', async () => {
    signInAs('ops_admin')
    serveLedger(() => [legacy])
    server.use(
      http.post('*/cms/privacy-requests/:id/delivered', () =>
        HttpResponse.json(
          { code: 'DELIVERY_SERVER_OWNED', message: 'x', field_errors: [], retryable: false },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(legacy.subject.userId!))
    const drawer = await screen.findByRole('dialog')
    await user.click(await within(drawer).findByRole('button', { name: 'Ghi nhận đã bàn giao' }))

    const dialogs = await screen.findAllByRole('dialog')
    const modal = dialogs[dialogs.length - 1]!
    const select = within(modal).getByLabelText('Cách bàn giao')
    expect(within(select).queryByRole('option', { name: 'Link tải bảo mật' })).toBeNull()

    await user.click(within(modal).getAllByRole('button', { name: 'Ghi nhận bàn giao' }).at(-1)!)
    expect(await within(modal).findByText(/do server ghi/)).toBeInTheDocument()
  })
})

describe('the default mock mirrors alpha.69 (dev server parity)', () => {
  it('direct export: 202 metadata, then EXPORT_ALREADY_ACTIVE for the same account', async () => {
    signInAs('ops_admin')
    const first = await exportAppUser('11111111-0000-4000-8000-000000000001', 'SUP-2001 lý do')
    expect(Object.keys(first).sort()).toEqual(['export', 'privacyRequestId'])
    expect(first.export.status).toBe('pending')
    await expect(
      exportAppUser('11111111-0000-4000-8000-000000000001', 'SUP-2001 lý do'),
    ).rejects.toMatchObject({ code: 'EXPORT_ALREADY_ACTIVE' })
  })

  it('manual delivery: secure_download is refused, a legacy export records in_app', async () => {
    signInAs('ops_admin')
    await expect(markPrivacyDelivered(legacy.id, 'secure_download')).rejects.toMatchObject({
      code: 'SECURE_DELIVERY_NOT_ASSERTABLE',
    })
    const recorded = await markPrivacyDelivered(legacy.id, 'in_app')
    expect(recorded.deliveryMethod).toBe('in_app')
  })
})

/*
 * Sol F-01 @b75da0c — the list DTO carries no `secureExport`, so actions drawn
 * from the list row would offer execute / manual delivery the server refuses.
 * Actions render only from the loaded detail.
 */
describe('actions come from the loaded detail, never the list row (F-01)', () => {
  const listRow = {
    ...executable,
    status: 'in_progress',
    executedAt: NOW,
  } as PrivacyRequest
  const detailRow = { ...listRow, secureExport: readyExport } as PrivacyRequest

  function serveSlowDetail(detail: PrivacyRequest) {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/cms/privacy-requests', () =>
        HttpResponse.json({ items: [listRow], nextCursor: null, totalCount: 1 }),
      ),
      http.get('*/cms/privacy-requests/:id', async () => {
        await gate
        return HttpResponse.json(detail)
      }),
    )
    return () => release()
  }

  it('offers neither execute nor manual delivery before the detail has loaded', async () => {
    signInAs('ops_admin')
    const release = serveSlowDetail(detailRow)
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(executable.subject.userId!))
    const drawer = await screen.findByRole('dialog')

    expect(within(drawer).queryByRole('button', { name: /xuất/ })).not.toBeInTheDocument()
    expect(
      within(drawer).queryByRole('button', { name: 'Ghi nhận đã bàn giao' }),
    ).not.toBeInTheDocument()

    release()
    expect(await within(drawer).findByText('Sẵn sàng để chủ tài khoản tải')).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: /xuất/ })).not.toBeInTheDocument()
    expect(
      within(drawer).queryByRole('button', { name: 'Ghi nhận đã bàn giao' }),
    ).not.toBeInTheDocument()
  })

  it('an executed export with no secure export in its detail is not executed again', async () => {
    signInAs('ops_admin')
    const release = serveSlowDetail(listRow)
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(executable.subject.userId!))
    const drawer = await screen.findByRole('dialog')
    release()

    // Loaded: close is offered, so the action list rendered from the detail.
    expect(
      await within(drawer).findByRole('button', { name: 'Đóng không thực thi' }),
    ).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: /xuất/ })).not.toBeInTheDocument()
  })
})

describe('an export answer without metadata is a contract mismatch (F-02)', () => {
  it('shows the mismatch instead of reporting success', async () => {
    signInAs('ops_admin')
    serveLedger(() => [executable])
    server.use(
      http.post('*/cms/privacy-requests/:id/execute', () =>
        HttpResponse.json(
          { request: { ...executable, status: 'in_progress', executedAt: NOW } },
          { status: 202 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<PrivacyListScreen />)

    const table = await screen.findByRole('table')
    await user.click(within(table).getByText(executable.subject.userId!))
    const drawer = await screen.findByRole('dialog')
    await user.click(await within(drawer).findByRole('button', { name: /xuất/ }))

    expect(await within(drawer).findByText(/did not match the expected shape/)).toBeInTheDocument()
    expect(screen.queryByText(/Đã phát hành bản xuất bảo mật/)).not.toBeInTheDocument()
  })
})
