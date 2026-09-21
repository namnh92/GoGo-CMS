import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { quarantineRows, resetSourceDrift } from '@/shared/test/handlers'
import AdministrativeDatasetDetailScreen from './datasetDetail.view'

/**
 * CMS #155 — the source-drift review queue.
 *
 * The assertions that matter most are about what the screen refuses to say. A
 * decision here is a draft: it creates no canonical edge, changes nothing the
 * resolver answers, and only becomes real after a materialisation, a validation
 * and a publication. A queue that let a reviewer believe otherwise would be
 * worse than no queue, so the copy is asserted as carefully as the behaviour.
 */

const BASE = '*/v1'
const DATASET = '22222222-2222-4222-8222-222222222222'
const ROW_A = quarantineRows[0]!

beforeEach(() => resetSourceDrift())

afterEach(() => {
  window.sessionStorage.clear()
})

/** Counts requests, so "asked nothing" is provable rather than assumed. */
function spyOn(path: string) {
  const calls: string[] = []
  server.use(
    http.get(`*${path}`, ({ request }) => {
      calls.push(request.url)
      return undefined
    }),
  )
  return calls
}

/**
 * `renderWithProviders` mounts a `MemoryRouter`, so `window.location` never
 * moves — the URL state has to be read from the router itself.
 */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="search">{location.search}</span>
}

const search = () => screen.getByTestId('search').textContent ?? ''

function renderTab(initial = 'tab=sourceDrift') {
  return renderWithProviders(
    <>
      <LocationProbe />
      <Routes>
        <Route
          path="/administrative-data/:datasetId"
          element={<AdministrativeDatasetDetailScreen />}
        />
      </Routes>
    </>,
    { route: `/administrative-data/${DATASET}?${initial}` },
  )
}

async function openQueue(role: 'ops_admin' | 'super_admin' = 'ops_admin') {
  signInAs(role)
  renderTab()
  await screen.findByText(/Hàng đợi phân xử nguồn ánh xạ/i)
}

async function openRow(index = 0) {
  await openQueue()
  await userEvent.click((await screen.findAllByRole('button', { name: /^Mở$/ }))[index]!)
  const drawer = await screen.findByRole('dialog')
  await within(drawer).findByText(quarantineRows[index]!.oldName)
  return drawer
}

/** Closes the drawer without fighting its own close button for the same label. */
async function closeDrawer() {
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

describe('access', () => {
  it.each([
    ['ops_admin', true],
    ['super_admin', true],
    ['moderator', false],
    ['editor', false],
  ] as const)('%s reaches the queue = %s', async (role, permitted) => {
    signInAs(role)
    const calls = spyOn('/quarantine')
    renderTab()

    if (permitted) {
      await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    } else {
      expect(await screen.findByText(/Không đủ quyền|Not permitted/i)).toBeInTheDocument()
      // Hiding a tab is a courtesy; not asking is the half the screen owns.
      expect(calls).toEqual([])
    }
  })

  it('refuses a signed-out caller and asks nothing', async () => {
    const calls = spyOn('/quarantine')
    renderTab()
    expect(await screen.findByText(/Không đủ quyền|Not permitted/i)).toBeInTheDocument()
    expect(calls).toEqual([])
  })
})

describe('the queue keeps its three count groups apart', () => {
  it('shows canonical, backlog and decision counts as separate figures', async () => {
    await openQueue()
    // 9,569 canonical edges against 1,033 quarantined rows. Summed, the backlog
    // would read nine times too large — the specific mistake available here.
    expect(await screen.findByText(/Cạnh chuẩn của bộ dữ liệu/)).toBeInTheDocument()
    expect(screen.getByText(/Tồn đọng cần phân xử/)).toBeInTheDocument()
    // Said twice on purpose: the count card and the panel it belongs to.
    expect(screen.getAllByText(/Quyết định nháp/).length).toBeGreaterThan(0)
    expect(screen.getByText('9.432')).toBeInTheDocument()
    // 1,033 quarantined rows: one settled by an earlier round (GoGo-BE#619)
    // and its sibling settled by that decision (GoGo-BE#622) — the backlog is
    // what is still open, not what was ever quarantined.
    expect(screen.getAllByText('1.031').length).toBeGreaterThan(0)
  })

  it('says plainly that a draft decision changes nothing that is running', async () => {
    await openQueue()
    expect(
      (await screen.findAllByText(/KHÔNG đổi gì đang chạy|change nothing that is running/i)).length,
    ).toBeGreaterThan(0)
  })
})

describe('the queue list', () => {
  it('shows the source as an identity, not a bare code', async () => {
    await openQueue()
    expect((await screen.findAllByText(ROW_A.oldCode)).length).toBeGreaterThan(0)
    // Once: the second proposal of the same source does not repeat the identity.
    expect(screen.getAllByText(ROW_A.oldName)).toHaveLength(1)
  })

  it('defaults to the actionable rows and keeps the filter in the URL', async () => {
    await openQueue()
    // The default view is what a reviewer came to do.
    expect(search()).toContain('tab=sourceDrift')
    const select = screen.getByLabelText(/Trạng thái quyết định/)
    expect(select).toHaveValue('UNDECIDED')

    await userEvent.selectOptions(select, 'ACCEPTED_DRAFT')
    await waitFor(() => expect(search()).toContain('state=ACCEPTED_DRAFT'))
  })

  it('pages on the server cursor and drops it when a filter changes', async () => {
    const seen: string[] = []
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id/quarantine`, ({ request }) => {
        seen.push(new URL(request.url).search)
        return undefined
      }),
    )
    await openQueue()
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen[0]).toContain('limit=25')
    // 1,033 rows never reach the browser at once.
    expect(seen[0]).not.toContain('limit=1000')

    await userEvent.selectOptions(screen.getByLabelText(/Phân loại/), 'DIVIDED_REQUIRES_REVIEW')
    await waitFor(() => expect(search()).toContain('class=DIVIDED_REQUIRES_REVIEW'))
    expect(search()).not.toContain('cursor=')
  })

  it('tells an empty filter apart from a failed load', async () => {
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id/quarantine`, () =>
        HttpResponse.json({
          items: [],
          nextCursor: null,
          counts: { canonical: {}, backlog: {}, decisions: {} },
        }),
      ),
    )
    await openQueue()
    expect(await screen.findByText(/Không có dòng nào/)).toBeInTheDocument()
    expect(screen.getByText(/Không còn dòng nào chờ quyết định/)).toBeInTheDocument()
  })
})

describe('the row detail', () => {
  it('renders every candidate as an identity with its effective period', async () => {
    const drawer = await openRow()
    for (const candidate of ROW_A.candidates) {
      expect(within(drawer).getByText(candidate.code)).toBeInTheDocument()
    }
    expect(within(drawer).getAllByText(/1 thg 7, 2025/).length).toBeGreaterThan(0)
  })

  it('pre-selects nothing, and says why a candidate cannot be chosen', async () => {
    const drawer = await openRow()
    for (const radio of within(drawer).getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-checked', 'false')
    }
    // The upstream's guess is labelled, never selected.
    expect(within(drawer).getByText(/Nguồn đề xuất/)).toBeInTheDocument()
    expect(within(drawer).getByText(/Không chọn được/)).toBeInTheDocument()
    const refused = within(drawer)
      .getAllByRole('radio')
      .find((r) => r.textContent?.includes('00170'))
    expect(refused).toBeDisabled()
  })

  it('bounds the raw evidence behind a disclosure rather than dumping it', async () => {
    const drawer = await openRow()
    expect(within(drawer).getByText(/Dữ liệu thô của nguồn/)).toBeInTheDocument()
    expect(within(drawer).getByText(/ví dụ địa điểm|Ví dụ địa điểm/i)).toBeInTheDocument()
  })

  it('refuses to accept without a target and a reason', async () => {
    const drawer = await openRow()
    const accept = within(drawer).getByRole('button', { name: /^Chấp nhận$/ })
    expect(accept).toBeDisabled()

    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    expect(accept).toBeDisabled()

    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát thực địa')
    expect(accept).toBeEnabled()
  })

  it('refuses to reject without a reason', async () => {
    const drawer = await openRow()
    expect(within(drawer).getByRole('button', { name: /^Từ chối$/ })).toBeDisabled()
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'nguồn sai')
    expect(within(drawer).getByRole('button', { name: /^Từ chối$/ })).toBeEnabled()
  })
})

describe('deciding', () => {
  it('sends the full target identity, never the code alone', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(
        `${BASE}/cms/administrative-datasets/:id/quarantine/:rowId/accept`,
        async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>)
          return undefined
        },
      ),
    )
    const drawer = await openRow()
    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát thực địa')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({
      targetCode: ROW_A.candidates[0]!.code,
      targetEffectiveFrom: '2025-07-01',
      expectedRevision: 0,
    })
  })

  it('keeps two candidates with one code apart, and sends the period of the one chosen (#205)', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(
        `${BASE}/cms/administrative-datasets/:id/quarantine/:rowId/accept`,
        async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>)
          return undefined
        },
      ),
    )
    // Row 2 carries `00166` twice: Liễu Giai (1900, INACTIVE) and Ngọc Hà (2025, ACTIVE).
    const drawer = await openRow(2)
    const radios = within(drawer).getAllByRole('radio')
    const current = radios.find((r) => r.textContent?.includes('Ngọc Hà'))!
    const dead = radios.find((r) => r.textContent?.includes('Liễu Giai'))!
    expect(dead).toBeDisabled()

    await userEvent.click(current)

    // One identity chosen — not "everything called 00166".
    expect(current).toHaveAttribute('aria-checked', 'true')
    expect(dead).toHaveAttribute('aria-checked', 'false')

    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát thực địa')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ targetCode: '00166', targetEffectiveFrom: '2025-07-01' })
  })

  it('carries an Idempotency-Key and sends once on a double click', async () => {
    const keys: (string | null)[] = []
    server.use(
      http.post(
        `${BASE}/cms/administrative-datasets/:id/quarantine/:rowId/reject`,
        async ({ request }) => {
          keys.push(request.headers.get('Idempotency-Key'))
          return undefined
        },
      ),
    )
    const drawer = await openRow()
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'nguồn sai')
    await userEvent.dblClick(within(drawer).getByRole('button', { name: /^Từ chối$/ }))

    await waitFor(() => expect(keys.length).toBeGreaterThan(0))
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reports an accept as a draft and says what it has not done', async () => {
    const drawer = await openRow()
    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát thực địa')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))

    expect(await screen.findByText(/Đã ghi quyết định chấp nhận \(bản nháp\)/)).toBeInTheDocument()
    // The toast detail is the whole point: nothing has taken effect.
    expect((await screen.findAllByText(/KHÔNG đổi gì đang chạy/)).length).toBeGreaterThan(0)
  })

  it('never describes a rejected mapping as a rejected place', async () => {
    const drawer = await openRow()
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'nguồn sai')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối$/ }))

    expect(await screen.findByText(/sẽ không trở thành cạnh chuẩn/)).toBeInTheDocument()
    expect(screen.queryByText(/từ chối địa điểm|reject the place/i)).not.toBeInTheDocument()
  })

  it('keeps a superseded decision visible instead of replacing it', async () => {
    const drawer = await openRow()
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'nguồn sai')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối$/ }))
    await screen.findByText(/Đã ghi quyết định từ chối/)

    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát lại')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))

    // Both opinions, and the older one marked rather than removed.
    await waitFor(() =>
      expect(within(drawer).getAllByText(/Đã bị thay thế/).length).toBeGreaterThan(0),
    )
    expect(within(drawer).getByText('nguồn sai')).toBeInTheDocument()
    expect(within(drawer).getByText('khảo sát lại')).toBeInTheDocument()
  })
})

describe('two reviewers', () => {
  it('explains a revision conflict, refetches and does not retry', async () => {
    let attempts = 0
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/quarantine/:rowId/reject`, () => {
        attempts += 1
        return HttpResponse.json(
          { code: 'OVERRIDE_SET_REVISION_CONFLICT', message: 'moved' },
          { status: 409 },
        )
      }),
    )
    const drawer = await openRow()
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'nguồn sai')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối$/ }))

    expect(await screen.findByText(/Người khác vừa quyết định một dòng/)).toBeInTheDocument()
    expect(attempts).toBe(1)
  })

  it('mints a new key after a domain refusal and keeps it after a network failure', async () => {
    const keys: (string | null)[] = []
    let mode: 'refuse' | 'network' = 'refuse'
    server.use(
      http.post(
        `${BASE}/cms/administrative-datasets/:id/quarantine/:rowId/reject`,
        ({ request }) => {
          keys.push(request.headers.get('Idempotency-Key'))
          return mode === 'refuse'
            ? HttpResponse.json(
                { code: 'OVERRIDE_SET_REVISION_CONFLICT', message: 'moved' },
                { status: 409 },
              )
            : HttpResponse.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 })
        },
      ),
    )
    const drawer = await openRow()
    const reject = within(drawer).getByRole('button', { name: /^Từ chối$/ })
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'nguồn sai')

    await userEvent.click(reject)
    await waitFor(() => expect(keys).toHaveLength(1))
    await userEvent.click(reject)
    await waitFor(() => expect(keys).toHaveLength(2))
    // A refusal is a decision about state; the next press is a new decision.
    expect(keys[0]).not.toBe(keys[1])

    mode = 'network'
    await userEvent.click(reject)
    await waitFor(() => expect(keys).toHaveLength(3))
    await userEvent.click(reject)
    await waitFor(() => expect(keys).toHaveLength(4))
    // A 5xx may already have applied; that is what the key is for.
    expect(keys[2]).toBe(keys[3])
  })
})

describe('the override set', () => {
  it('refuses to materialise an empty draft, and says why', async () => {
    await openQueue()
    const materialize = await screen.findByRole('button', { name: /^Vật chất hoá$/ })
    expect(materialize).toBeDisabled()
    expect(screen.getByText(/Chưa có quyết định nào có hiệu lực/)).toBeInTheDocument()
  })

  it('states what materialisation does and does not do before confirming', async () => {
    const drawer = await openRow()
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'nguồn sai')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối$/ }))
    await screen.findByText(/Đã ghi quyết định từ chối/)
    await closeDrawer()

    await userEvent.click(await screen.findByRole('button', { name: /^Vật chất hoá$/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Chỉ tạo một phiên bản Đã nhập/)).toBeInTheDocument()
    expect(within(dialog).getByText(/KHÔNG tự chạy kiểm tra, KHÔNG tự publish/)).toBeInTheDocument()
    expect(within(dialog).getByText(/không tạo cạnh nào/)).toBeInTheDocument()
  })

  it('asks for a reason before it will materialise, because the server does (#207)', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(
        `${BASE}/cms/administrative-datasets/:id/override-set/materialize`,
        async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>)
          return undefined
        },
      ),
    )
    const drawer = await openRow()
    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát thực địa')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))
    await screen.findByText(/Đã ghi quyết định chấp nhận/)
    await closeDrawer()

    await userEvent.click(await screen.findByRole('button', { name: /^Vật chất hoá$/ }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: /^Vật chất hoá$/ })
    // No reason, no request: the old dialog had no field and sent '' every time.
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(/Lý do quyết định/), 'gộp quyết định đợt 1')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ reason: 'gộp quyết định đợt 1', expectedRevision: 1 })
  })

  it('links the derived version and names the sequence that is left', async () => {
    const drawer = await openRow()
    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát thực địa')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))
    await screen.findByText(/Đã ghi quyết định chấp nhận/)
    await closeDrawer()

    await userEvent.click(await screen.findByRole('button', { name: /^Vật chất hoá$/ }))
    const confirm = await screen.findByRole('dialog')
    await userEvent.type(within(confirm).getByLabelText(/Lý do quyết định/), 'gộp quyết định đợt 1')
    await userEvent.click(within(confirm).getByRole('button', { name: /^Vật chất hoá$/ }))

    const result = await screen.findByRole('dialog')
    expect(within(result).getByText(/Đã tạo phiên bản dẫn xuất/)).toBeInTheDocument()
    expect(within(result).getByText('v5.0.0+v2.4.1+7fac8c45+none+r1')).toBeInTheDocument()
    // Not "done": validate, read the diff, publish.
    expect(within(result).getByText(/Kiểm tra → Đọc phần Thay đổi → Publish/)).toBeInTheDocument()
    expect(within(result).getByRole('link', { name: /Mở phiên bản dẫn xuất/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/administrative-data/'),
    )
  })

  it('stops taking decisions once the set is materialised', async () => {
    const drawer = await openRow()
    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát thực địa')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))
    await screen.findByText(/Đã ghi quyết định chấp nhận/)
    await closeDrawer()

    await userEvent.click(await screen.findByRole('button', { name: /^Vật chất hoá$/ }))
    const confirm = await screen.findByRole('dialog')
    await userEvent.type(within(confirm).getByLabelText(/Lý do quyết định/), 'gộp quyết định đợt 1')
    await userEvent.click(within(confirm).getByRole('button', { name: /^Vật chất hoá$/ }))
    await screen.findByText(/Đã tạo phiên bản dẫn xuất/)
    await userEvent.keyboard('{Escape}')

    // The panel now reports a materialised set, and offers no more decisions.
    await waitFor(() => expect(screen.getByText(/Đã vật chất hoá thành/)).toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Vật chất hoá$/ })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: /Bỏ bộ nháp/ })).toBeDisabled()
  })

  it('abandons a draft with a reason, and says the decisions survive', async () => {
    await openQueue()
    await userEvent.click(await screen.findByRole('button', { name: /Bỏ bộ nháp/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/vẫn được giữ nguyên/)).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: /Bỏ bộ nháp/ })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(/Lý do quyết định/), 'sai bộ dữ liệu')
    await userEvent.click(confirm)

    expect(await screen.findByText(/Đã bỏ bộ nháp/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /Bỏ bộ nháp/ })).toBeDisabled())
  })
})

describe('a decision an earlier round materialised (GoGo-BE#619)', () => {
  const SETTLED = quarantineRows[3]!

  it('is out of the default queue, out of the backlog, and counted on its own', async () => {
    await openQueue()
    expect(screen.queryByText(SETTLED.oldName)).not.toBeInTheDocument()
    // 1,033 quarantined rows, one of them settled by the previous round: the
    // backlog is 1,032. Before #619 it read 1,033 after every round, so a
    // published review looked like nobody had reviewed anything.
    expect(await screen.findByText(/Đã vật chất hoá trên phiên bản này/)).toBeInTheDocument()
    expect(screen.getByText(/1 chấp nhận · 0 từ chối/)).toBeInTheDocument()
    expect(screen.getAllByText('1.031').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Đã vật chất hoá: chấp nhận/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Nguồn đã chốt/).length).toBeGreaterThan(0)
  })

  it('appears under its own filter, badged as settled rather than undecided', async () => {
    await openQueue()
    const select = screen.getByLabelText(/Trạng thái quyết định/)
    await userEvent.selectOptions(select, 'MATERIALIZED_ACCEPT')
    await waitFor(() => expect(search()).toContain('state=MATERIALIZED_ACCEPT'))
    const table = await screen.findByRole('table')
    expect(await within(table).findByText(SETTLED.oldName)).toBeInTheDocument()
    expect(within(table).getByText('Đã vật chất hoá: chấp nhận')).toBeInTheDocument()
    expect(within(table).queryByText('Chưa quyết định')).not.toBeInTheDocument()
  })

  it('names the carried decision, its target and its reason, apart from the draft history', async () => {
    await openQueue()
    await userEvent.selectOptions(
      screen.getByLabelText(/Trạng thái quyết định/),
      'MATERIALIZED_ACCEPT',
    )
    await userEvent.click(await screen.findByRole('button', { name: /^Mở$/ }))
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByText(SETTLED.oldName)

    const settled = within(drawer).getByRole('region', { name: /Quyết định đã vật chất hoá/ })
    expect(within(settled).getByText('Chấp nhận')).toBeInTheDocument()
    expect(within(settled).getByText(SETTLED.materialized!.targetCode!)).toBeInTheDocument()
    expect(within(settled).getByText(SETTLED.materialized!.reason)).toBeInTheDocument()
    expect(within(settled).getByText(/không sửa quyết định này/)).toBeInTheDocument()
    // The draft history is a different thing and stays empty: nothing was drafted here.
    expect(within(drawer).getByText(/Chưa ai quyết định dòng này/)).toBeInTheDocument()
  })
})

describe('one source, one decision (GoGo-CMS#213)', () => {
  const SETTLED = quarantineRows[3]!
  const SIBLING = quarantineRows[4]!
  const SECOND_PROPOSAL = quarantineRows[5]!

  it('groups the proposals of one source instead of listing them as separate questions', async () => {
    await openQueue()
    const table = await screen.findByRole('table')
    // The first row of the source carries the identity and the count.
    expect(within(table).getByText(/2 đề xuất · một quyết định cho nguồn/)).toBeInTheDocument()
    // The second says it is the same source, and which proposal it is.
    expect(within(table).getByText(/cùng nguồn · đề xuất 2\/2/)).toBeInTheDocument()
    expect(within(table).getAllByText(new RegExp(SECOND_PROPOSAL.newName)).length).toBeGreaterThan(
      0,
    )
    expect(within(table).getAllByText(ROW_A.oldName)).toHaveLength(1)
  })

  it('refuses a second successor for the same source in the draft, and says why', async () => {
    const drawer = await openRow()
    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))
    await screen.findByText(/Đã ghi quyết định chấp nhận/)
    await closeDrawer()

    // The sibling row, onto the other candidate: the draft already decided the
    // source. Found by its proposal — the accepted row has left the default view.
    // With the accepted row gone from the default view, the second proposal is
    // the only row of the source left, so it carries the identity again.
    const sourceCell = (await screen.findAllByText(ROW_A.oldName))[0]!
    await userEvent.click(within(sourceCell.closest('tr')!).getByRole('button', { name: /^Mở$/ }))
    const sibling = await screen.findByRole('dialog')
    await within(sibling).findByText(SECOND_PROPOSAL.oldName)
    await userEvent.click(within(sibling).getAllByRole('radio')[1]!)
    await userEvent.type(within(sibling).getByLabelText(/Lý do quyết định/), 'nửa còn lại')
    await userEvent.click(within(sibling).getByRole('button', { name: /^Chấp nhận$/ }))
    expect(
      await screen.findByText(/đã chấp nhận nguồn này sang một đích khác trên dòng anh em/),
    ).toBeInTheDocument()
  })

  it('locks a row its sibling settled, and points at the decision that settled it', async () => {
    await openQueue()
    await userEvent.selectOptions(screen.getByLabelText(/Trạng thái quyết định/), 'SOURCE_SETTLED')
    const table = await screen.findByRole('table')
    expect((await within(table).findAllByText(new RegExp(SIBLING.newName))).length).toBeGreaterThan(
      0,
    )
    expect(within(table).getByText('Nguồn đã chốt')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: /^Mở$/ }))
    const drawer = await screen.findByRole('dialog')
    const settled = within(drawer).getByRole('region', { name: /Nguồn đã chốt/ })
    expect(within(settled).getByText(/00007 đã có đích 00025 \(override:r1\)/)).toBeInTheDocument()

    // Even with a target and a reason, accepting stays unavailable — and says so.
    await userEvent.click(within(drawer).getAllByRole('radio')[0]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'đổi ý')
    expect(within(drawer).getByRole('button', { name: /^Chấp nhận$/ })).toBeDisabled()
    expect(within(drawer).getByText(/Không chấp nhận được: nguồn đã có đích/)).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /^Từ chối$/ })).toBeEnabled()
  })

  it('offers a retraction on the decided row, and reports it as one', async () => {
    await openQueue()
    await userEvent.selectOptions(
      screen.getByLabelText(/Trạng thái quyết định/),
      'MATERIALIZED_ACCEPT',
    )
    await userEvent.click(await screen.findByRole('button', { name: /^Mở$/ }))
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByText(SETTLED.oldName)

    const retract = within(drawer).getByRole('button', { name: /^Rút lại quyết định$/ })
    expect(within(drawer).getByText(/sẽ rút lại đích 00025 khi vật chất hoá/)).toBeInTheDocument()
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'khảo sát sai')
    await userEvent.click(retract)
    expect(await screen.findByText(/Đã ghi rút lại quyết định/)).toBeInTheDocument()
    expect(screen.getByText(/Đích 00025 sẽ bị rút khi vật chất hoá/)).toBeInTheDocument()
  })

  it('explains a source already resolved in an earlier round when the server refuses', async () => {
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/quarantine/:rowId/accept`, () =>
        HttpResponse.json(
          {
            code: 'OVERRIDE_SOURCE_ALREADY_RESOLVED',
            message: '00160 already resolves to 00163 through a reviewer override (override:r1)',
          },
          { status: 409 },
        ),
      ),
    )
    const drawer = await openRow()
    await userEvent.click(within(drawer).getAllByRole('radio')[1]!)
    await userEvent.type(within(drawer).getByLabelText(/Lý do quyết định/), 'thử lại')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Chấp nhận$/ }))
    expect(
      await screen.findByText(/đã có đích qua quyết định của người duyệt ở vòng trước/),
    ).toBeInTheDocument()
  })
})

describe('the rest of the console is untouched', () => {
  it('keeps the #154 tabs and adds one, without a second navigation surface', async () => {
    signInAs('ops_admin')
    renderTab('tab=overview')
    for (const name of [/Tổng quan/, /Kiểm tra/, /Thay đổi/, /Nguồn ánh xạ/, /Nhật ký/]) {
      expect(await screen.findByRole('tab', { name })).toBeInTheDocument()
    }
    const { NAV_ENTRIES } = await import('@/app/nav')
    expect(NAV_ENTRIES.filter((entry) => entry.kind === 'group').map((e) => e.id)).toEqual([
      'catalog',
      'review',
      'operations',
      'users',
      'administration',
    ])
  })

  it('ships no per-place moderation control from #156', async () => {
    await openRow()
    for (const name of [
      /xác nhận ánh xạ|verify mapping/i,
      /gán lại|rematch/i,
      /đối chiếu lại|reconcile/i,
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('is keyboard operable: the drawer traps focus and Escape closes it', async () => {
    const drawer = await openRow(1)
    expect(drawer).toHaveAttribute('aria-modal', 'true')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
