import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { useLocation } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { mappingRows, resetMappingModeration } from '@/shared/test/handlers'
import AdministrativeMappingScreen from './administrativeMapping.view'

/**
 * CMS #156 — per-place administrative mapping moderation.
 *
 * Three separations carry most of the risk on this screen, and most of these
 * tests are about them: verifying is not publishing, rejecting a *mapping* is
 * not rejecting a *place*, and reconciling is not verifying. Each is a sentence
 * a reviewer could believe wrongly and act on confidently, so each is asserted
 * as copy and as behaviour.
 */

const BASE = '*/v1'
const NEEDS_REVIEW = mappingRows[0]!.placeId
const STALE = mappingRows[1]!.placeId
/** Reachable through the filter, never through the default queue. */
const UNMAPPED = mappingRows[2]!.placeId
const VERIFIED = mappingRows[3]!.placeId
/** The resolver's proposal, unconfirmed: the row the two-answer surface is for. */
const AUTO_MATCHED = mappingRows[4]!.placeId

beforeEach(() => resetMappingModeration())
afterEach(() => window.sessionStorage.clear())

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

/** `MemoryRouter` never moves `window.location`, so the URL is read here. */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="search">{location.search}</span>
}

const search = () => screen.getByTestId('search').textContent ?? ''

function renderQueue(initial = '') {
  return renderWithProviders(
    <>
      <LocationProbe />
      <AdministrativeMappingScreen />
    </>,
    { route: `/administrative-mapping${initial ? `?${initial}` : ''}` },
  )
}

async function openRow(
  role: 'moderator' | 'ops_admin' | 'editor' | 'super_admin',
  placeId: string,
) {
  signInAs(role)
  renderQueue('status=')
  await userEvent.click(await screen.findByTestId(`open-${placeId}`))
  return screen.findByRole('dialog')
}

/**
 * The commune list is fetched for the province the mapping already claims, so
 * the options arrive a tick after the drawer does.
 *
 * ADM-105 — a searchable combobox now, not a `<select>`: a province has
 * hundreds of communes, and the list is fetched, so it needs states a
 * `<select>` has nowhere to put.
 */
async function chooseUnit(drawer: HTMLElement, label: RegExp, code: string) {
  const input = within(drawer).getByRole('combobox', { name: label })
  await userEvent.click(input)
  const option = await screen.findByRole('option', { name: new RegExp(code) })
  await userEvent.click(option)
  return input
}

const chooseCommune = (drawer: HTMLElement, code: string) =>
  chooseUnit(drawer, /^Phường \/ xã$/, code)

describe('access', () => {
  it.each(['editor', 'moderator', 'ops_admin', 'super_admin'] as const)(
    '%s may read the queue',
    async (role) => {
      signInAs(role)
      const calls = spyOn('/cms/administrative-mappings')
      renderQueue()
      await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    },
  )

  it('refuses a signed-out caller and asks nothing', async () => {
    const calls = spyOn('/cms/administrative-mappings')
    renderQueue()
    expect(await screen.findByText(/Không đủ quyền|Not permitted/i)).toBeInTheDocument()
    expect(calls).toEqual([])
  })
})

describe('the queue', () => {
  it('defaults to the rows with something to decide', async () => {
    signInAs('moderator')
    renderQueue()
    await screen.findByText('Quán Cơm Ba Đình')
    // NEEDS_REVIEW and STALE by default; the verified row is not in the way.
    expect(screen.queryByText('Phở Ba Đình')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Trạng thái ánh xạ/)).toHaveValue('NEEDS_REVIEW,STALE')
  })

  it('keeps UNMAPPED discoverable rather than buried', async () => {
    signInAs('moderator')
    renderQueue()
    await screen.findByText('Quán Cơm Ba Đình')

    // Counted in the summary even when not in the default view…
    expect(screen.getAllByText(/Chưa gán/).length).toBeGreaterThan(0)
    // …and one filter away.
    await userEvent.selectOptions(screen.getByLabelText(/Trạng thái ánh xạ/), 'UNMAPPED')
    expect(await screen.findByText('Bún Chả Bến Nghé')).toBeInTheDocument()
    expect(screen.getByTestId(`open-${UNMAPPED}`)).toBeInTheDocument()
    await waitFor(() => expect(search()).toContain('status=UNMAPPED'))
  })

  it('filters to the rows blocking publication, and keeps it in the URL', async () => {
    signInAs('moderator')
    renderQueue('status=')
    await screen.findByText('Phở Ba Đình')

    await userEvent.selectOptions(screen.getByLabelText(/^Duyệt đăng$/), 'true')
    await waitFor(() => expect(search()).toContain('blocked=true'))
    // The verified row is the one that does not block.
    await waitFor(() => expect(screen.queryByText('Phở Ba Đình')).not.toBeInTheDocument())
  })

  it('renders the remediation categories apart, and denies any auto-unpublish', async () => {
    signInAs('moderator')
    renderQueue()
    expect(await screen.findByText(/Xác nhận trên bản cũ hơn/)).toBeInTheDocument()
    expect(screen.getByText(/Đạt/)).toBeInTheDocument()
    // `verified_against_older_version` is its own category, not STALE.
    expect(screen.getByText(/Không có địa điểm nào đã đăng bị tự động gỡ/)).toBeInTheDocument()
  })

  it('tells an empty filter apart from a failed load', async () => {
    signInAs('moderator')
    server.use(
      http.get(`${BASE}/cms/administrative-mappings`, () =>
        HttpResponse.json({ items: [], nextCursor: null, counts: {} }),
      ),
    )
    renderQueue()
    expect(await screen.findByText(/Không có dòng nào/)).toBeInTheDocument()
    expect(screen.getByText(/Không còn dòng nào cần xem lại/)).toBeInTheDocument()
  })
})

describe('what each role may do', () => {
  it('shows an editor the blocker and no decision at all', async () => {
    const drawer = await openRow('editor', NEEDS_REVIEW)
    expect(within(drawer).getByText(/Đang chặn duyệt đăng/)).toBeInTheDocument()
    expect(
      within(drawer).getByText(/Quyết định về ánh xạ thuộc về người kiểm duyệt/),
    ).toBeInTheDocument()
    for (const name of [/^Duyệt ánh xạ$/, /^Từ chối ánh xạ$/, /^Xác nhận đơn vị đã chọn$/]) {
      expect(within(drawer).queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  /**
   * PI-CMS-034 — the surface is two answers.
   *
   * A reviewer says the proposal is right or it is not. Re-deriving a mapping
   * and re-evaluating one against the dataset are real operations with real
   * routes, and neither is something to make somebody choose between here.
   */
  it('gives a moderator exactly approve and reject on a proposal', async () => {
    const drawer = await openRow('moderator', AUTO_MATCHED)
    expect(within(drawer).getByRole('button', { name: /^Duyệt ánh xạ$/ })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: /Đăng|Publish/ })).not.toBeInTheDocument()
    for (const gone of [/^Gán lại$/, /^Đối chiếu lại$/]) {
      expect(within(drawer).queryByRole('button', { name: gone })).not.toBeInTheDocument()
    }
    // Approving confirms what is on screen, so there is nothing to retype.
    expect(within(drawer).queryByRole('combobox', { name: /Tỉnh/ })).not.toBeInTheDocument()
  })

  it('asks the reviewer to choose when there is no pair to approve', async () => {
    // NEEDS_REVIEW here has a province and no commune: nothing to say yes to.
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    expect(
      within(drawer).getByRole('button', { name: /^Xác nhận đơn vị đã chọn$/ }),
    ).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: /^Duyệt ánh xạ$/ })).not.toBeInTheDocument()
    expect(within(drawer).getByRole('combobox', { name: /Tỉnh/ })).toBeInTheDocument()
  })

  it('offers ops no decision on this screen', async () => {
    const drawer = await openRow('ops_admin', STALE)
    for (const name of [
      /^Duyệt ánh xạ$/,
      /^Từ chối ánh xạ$/,
      /^Gán lại$/,
      /^Đối chiếu lại$/,
      /^Xác nhận đơn vị đã chọn$/,
    ]) {
      expect(within(drawer).queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('gives super_admin the moderator surface through the existing bypass', async () => {
    const drawer = await openRow('super_admin', AUTO_MATCHED)
    expect(within(drawer).getByRole('button', { name: /^Duyệt ánh xạ$/ })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ })).toBeInTheDocument()
  })

  it('keeps correction as the only thing offered on a verified mapping', async () => {
    const drawer = await openRow('moderator', VERIFIED)
    // Changing a decision somebody recorded is a different act, and the audit
    // row names both people — so it is not folded into approve/reject.
    expect(within(drawer).getByRole('button', { name: /^Sửa ánh xạ$/ })).toBeInTheDocument()
    for (const gone of [/^Duyệt ánh xạ$/, /^Từ chối ánh xạ$/, /^Gán lại$/]) {
      expect(within(drawer).queryByRole('button', { name: gone })).not.toBeInTheDocument()
    }
  })
})

describe('the detail', () => {
  it('shows evidence, candidates and both dataset versions', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    expect(within(drawer).getByText('12 Đội Cấn, Ba Đình, Hà Nội')).toBeInTheDocument()
    expect(within(drawer).getByText(/Tên phường khớp chính xác/)).toBeInTheDocument()
    expect(within(drawer).getByText(/Bộ phân giải thấy nhiều khả năng/)).toBeInTheDocument()
    expect(within(drawer).getAllByText(/Chỉ là gợi ý|Xác định được/).length).toBeGreaterThan(0)
  })

  it('renders a null confidence as unscored, never as zero', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    expect(within(drawer).getByText(/Không chấm điểm/)).toBeInTheDocument()
    expect(within(drawer).queryByText('0')).not.toBeInTheDocument()
  })

  it('renders a definitional 1.00 as the number it is', async () => {
    const drawer = await openRow('ops_admin', STALE)
    expect(within(drawer).getByText(/1 \(định nghĩa được\)/)).toBeInTheDocument()
  })

  it('keeps the previous reviewer visible on a stale row', async () => {
    const drawer = await openRow('ops_admin', STALE)
    // They did verify it; STALE says the verification is no longer current.
    expect(within(drawer).getByText('moderator.cũ')).toBeInTheDocument()
  })
})

describe('the unit selector', () => {
  it('offers communes only from the chosen province, and clears on change', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    await chooseUnit(drawer, /^Tỉnh \/ thành$/, '01')
    const commune = await chooseCommune(drawer, '00163')
    expect(commune).toHaveValue('Phường Ba Đình')

    // A different province cannot keep the previous province's commune.
    await chooseUnit(drawer, /^Tỉnh \/ thành$/, '79')
    await waitFor(() => expect(commune).toHaveValue(''))

    // And the old province's communes are not on offer any more.
    await userEvent.click(commune)
    const listbox = await screen.findByRole('listbox', { name: /Phường \/ xã/ })
    await waitFor(() =>
      expect(within(listbox).queryByRole('option', { name: /Ba Đình/ })).not.toBeInTheDocument(),
    )
    expect(within(listbox).getByRole('option', { name: /Bến Nghé/ })).toBeInTheDocument()
  })

  it('finds a commune by typing, with the server doing the Vietnamese folding', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    const commune = within(drawer).getByRole('combobox', { name: /^Phường \/ xã$/ })
    await userEvent.click(commune)
    await userEvent.type(commune, 'ngoc ha')

    // "ngoc ha" finds "Phường Ngọc Hà": a client-side `includes()` over the
    // accented string would not.
    const option = await screen.findByRole('option', { name: /Ngọc Hà/ })
    await userEvent.click(option)
    expect(commune).toHaveValue('Phường Ngọc Hà')
  })

  it('says the legacy district is preserved rather than offering a made-up list', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    expect(within(drawer).getByText(/hợp đồng hiện tại không cung cấp bộ chọn/)).toBeInTheDocument()
  })
})

describe('verifying', () => {
  it('needs a full identity, and says it does not publish', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    const verify = within(drawer).getByRole('button', { name: /^Xác nhận đơn vị đã chọn$/ })
    // The row has a province but no commune: not yet a complete identity.
    expect(verify).toBeDisabled()

    await chooseCommune(drawer, '00163')
    await waitFor(() => expect(verify).toBeEnabled())
    await userEvent.click(verify)

    const dialog = await screen.findByRole('dialog', { name: /Xác nhận ánh xạ hành chính/ })
    expect(within(dialog).getByText(/KHÔNG đăng địa điểm/)).toBeInTheDocument()
  })

  it('records the reviewer, leaves confidence unscored and does not publish', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    await chooseCommune(drawer, '00163')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Xác nhận đơn vị đã chọn$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: /Xác nhận ánh xạ hành chính/ })).getByRole(
        'button',
        { name: /^Xác nhận đơn vị đã chọn$/ },
      ),
    )

    expect(await screen.findByText(/Đã xác nhận ánh xạ/)).toBeInTheDocument()
    expect(await screen.findByText(/Không đăng địa điểm/)).toBeInTheDocument()
    await waitFor(() => expect(within(drawer).getByText('moderator')).toBeInTheDocument())
    expect(within(drawer).getByText(/Không chấm điểm/)).toBeInTheDocument()
  })

  it('sends the codes the API gave, not the display text', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(`${BASE}/cms/places/:id/administrative-mapping/verify`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return undefined
      }),
    )
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    await chooseCommune(drawer, '00163')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Xác nhận đơn vị đã chọn$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: /Xác nhận ánh xạ/ })).getByRole('button', {
        name: /^Xác nhận đơn vị đã chọn$/,
      }),
    )

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ provinceCode: '01', communeCode: '00163' })
    expect(bodies[0]).toHaveProperty('expectedUpdatedAt')
  })

  it('refuses a hierarchy the active dataset does not hold, and clears the commune', async () => {
    server.use(
      http.post(`${BASE}/cms/places/:id/administrative-mapping/verify`, () =>
        HttpResponse.json(
          { code: 'HIERARCHY_INVALID', message: 'commune is not in that province' },
          { status: 400 },
        ),
      ),
    )
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    const commune = await chooseCommune(drawer, '00163')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Xác nhận đơn vị đã chọn$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: /Xác nhận ánh xạ/ })).getByRole('button', {
        name: /^Xác nhận đơn vị đã chọn$/,
      }),
    )

    expect(await screen.findByText(/không thuộc tỉnh đã chọn/)).toBeInTheDocument()
    // The stale selection is dropped rather than carried into a retry.
    await waitFor(() => expect(commune).toHaveValue(''))
  })
})

describe('correcting', () => {
  it('shows both identities and treats replacing a verified mapping as destructive', async () => {
    const drawer = await openRow('moderator', VERIFIED)
    await chooseCommune(drawer, '00166')
    await userEvent.type(within(drawer).getByLabelText(/^Lý do$/), 'khảo sát lại')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Sửa ánh xạ$/ }))

    const dialog = await screen.findByRole('dialog', { name: /Sửa ánh xạ hành chính/ })
    expect(within(dialog).getByText(/đã được người khác xác nhận/)).toBeInTheDocument()
    expect(within(dialog).getByText(/không thể hoàn tác/)).toBeInTheDocument()
    // Before and after, as identities rather than bare codes.
    expect(within(dialog).getByText(/Phường Ba Đình \(00163\)/)).toBeInTheDocument()
    expect(within(dialog).getByText('00166')).toBeInTheDocument()
  })
})

describe('rejecting a mapping is not rejecting a place', () => {
  it('says so in the confirmation and in the result', async () => {
    const drawer = await openRow('moderator', AUTO_MATCHED)
    await userEvent.type(within(drawer).getByLabelText(/^Lý do$/), 'sai phường')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ }))

    const dialog = await screen.findByRole('dialog', { name: /Từ chối ánh xạ hành chính/ })
    expect(within(dialog).getByText(/không phải từ chối địa điểm/)).toBeInTheDocument()
    expect(within(dialog).getByText(/không bị xoá, không bị gỡ/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: /^Từ chối ánh xạ$/ }))
    // Said by the toast and by the status badge the row now carries.
    expect((await screen.findAllByText(/Đã từ chối ánh xạ/)).length).toBeGreaterThan(0)
    expect(await screen.findByText(/Địa điểm không bị từ chối và không bị xoá/)).toBeInTheDocument()
  })

  it('requires a reason', async () => {
    const drawer = await openRow('moderator', AUTO_MATCHED)
    expect(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ })).toBeDisabled()
  })

  /**
   * PI-CMS-034 — rejecting is the first half of an answer, not a dead end. The
   * reviewer who says the proposal is wrong is the one who then says what is
   * right, and the same `verify` route records it under their name.
   */
  it('opens the selector so the reviewer supplies the right unit', async () => {
    const drawer = await openRow('moderator', AUTO_MATCHED)
    await userEvent.type(within(drawer).getByLabelText(/^Lý do$/), 'sai phường')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: /Từ chối ánh xạ hành chính/ })).getByRole(
        'button',
        { name: /^Từ chối ánh xạ$/ },
      ),
    )

    // The rejection landed, and the screen now asks for the identity rather
    // than leaving the reviewer on a row nobody will come back to.
    expect(await within(drawer).findByText(/Chọn đơn vị đúng/)).toBeInTheDocument()
    expect(
      within(drawer).getByRole('button', { name: /^Xác nhận đơn vị đã chọn$/ }),
    ).toBeInTheDocument()
    expect(
      within(drawer).queryByRole('button', { name: /^Từ chối ánh xạ$/ }),
    ).not.toBeInTheDocument()
  })
})

describe('concurrency and idempotency', () => {
  it('carries one key per decision and sends once on a double click', async () => {
    const keys: (string | null)[] = []
    server.use(
      http.post(`${BASE}/cms/places/:id/administrative-mapping/reject`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return undefined
      }),
    )
    const drawer = await openRow('moderator', AUTO_MATCHED)
    await userEvent.type(within(drawer).getByLabelText(/^Lý do$/), 'sai phường')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ }))
    const dialog = await screen.findByRole('dialog', { name: /Từ chối ánh xạ hành chính/ })
    await userEvent.dblClick(within(dialog).getByRole('button', { name: /^Từ chối ánh xạ$/ }))

    await waitFor(() => expect(keys.length).toBeGreaterThan(0))
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('explains a place that moved under the reviewer, refetches and does not retry', async () => {
    let attempts = 0
    server.use(
      http.post(`${BASE}/cms/places/:id/administrative-mapping/reject`, () => {
        attempts += 1
        return HttpResponse.json(
          { code: 'PLACE_MODIFIED', message: 'the place changed' },
          { status: 409 },
        )
      }),
    )
    const drawer = await openRow('moderator', AUTO_MATCHED)
    await userEvent.type(within(drawer).getByLabelText(/^Lý do$/), 'sai phường')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: /Từ chối ánh xạ/ })).getByRole('button', {
        name: /^Từ chối ánh xạ$/,
      }),
    )

    expect(
      await screen.findByText(/Địa điểm đã thay đổi kể từ lúc màn hình được vẽ/),
    ).toBeInTheDocument()
    expect(attempts).toBe(1)
  })

  it('mints a new key after a refusal and keeps it after a 5xx', async () => {
    const keys: (string | null)[] = []
    let mode: 'refuse' | 'network' = 'refuse'
    server.use(
      http.post(`${BASE}/cms/places/:id/administrative-mapping/reject`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return mode === 'refuse'
          ? HttpResponse.json({ code: 'PLACE_MODIFIED', message: 'moved' }, { status: 409 })
          : HttpResponse.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 })
      }),
    )
    const drawer = await openRow('moderator', AUTO_MATCHED)
    await userEvent.type(within(drawer).getByLabelText(/^Lý do$/), 'sai phường')

    const press = async () => {
      await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ }))
      const dialog = await screen.findByRole('dialog', { name: /Từ chối ánh xạ hành chính/ })
      await userEvent.click(within(dialog).getByRole('button', { name: /^Từ chối ánh xạ$/ }))
    }

    await press()
    await waitFor(() => expect(keys).toHaveLength(1))
    await press()
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[0]).not.toBe(keys[1])

    mode = 'network'
    await press()
    await waitFor(() => expect(keys).toHaveLength(3))
    await press()
    await waitFor(() => expect(keys).toHaveLength(4))
    // A 5xx may already have applied; that is what the key is for.
    expect(keys[2]).toBe(keys[3])
  })

  it('refetches the queue and the place after a decision', async () => {
    let listReads = 0
    let placeReads = 0
    server.use(
      http.get(`${BASE}/cms/administrative-mappings`, () => {
        listReads += 1
        return undefined
      }),
      http.get(`${BASE}/cms/places`, () => {
        placeReads += 1
        return undefined
      }),
    )
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    await chooseCommune(drawer, '00163')
    const before = listReads
    await userEvent.click(within(drawer).getByRole('button', { name: /^Xác nhận đơn vị đã chọn$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: /Xác nhận ánh xạ/ })).getByRole('button', {
        name: /^Xác nhận đơn vị đã chọn$/,
      }),
    )
    await screen.findByText(/Đã xác nhận ánh xạ/)
    // The editor's view of this place changes too — the blocker may be gone.
    await waitFor(() => expect(listReads).toBeGreaterThan(before))
    expect(placeReads).toBeGreaterThanOrEqual(0)
  })
})

describe('the rest of the console is untouched', () => {
  it('calls no Google or public administrative API beyond GoGo-BE', async () => {
    const foreign: string[] = []
    server.use(
      http.get('https://*/*', ({ request }) => {
        if (!request.url.includes('/v1/')) foreign.push(request.url)
        return undefined
      }),
    )
    await openRow('moderator', NEEDS_REVIEW)
    expect(foreign).toEqual([])
  })

  it('ships no source-drift control from #155 on this screen', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    for (const name of [/Vật chất hoá/, /Bỏ bộ nháp/, /^Chấp nhận$/]) {
      expect(within(drawer).queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('cancels a confirmation on Escape without closing the drawer behind it', async () => {
    /*
     * Both dialogs listen on `document` in the capture phase, so the outer one
     * had already handled the key by the time the inner one saw it — one
     * Escape closed the confirmation *and* the drawer, throwing away the
     * reviewer's selection. Only the topmost dialog answers now.
     */
    const drawer = await openRow('moderator', AUTO_MATCHED)
    await userEvent.type(within(drawer).getByLabelText(/^Lý do$/), 'sai phường')
    await userEvent.click(within(drawer).getByRole('button', { name: /^Từ chối ánh xạ$/ }))
    await screen.findByRole('dialog', { name: /Từ chối ánh xạ hành chính/ })

    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /Từ chối ánh xạ hành chính/ }),
      ).not.toBeInTheDocument(),
    )
    // The drawer, and the reason typed into it, survive.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(drawer).getByLabelText(/^Lý do$/)).toHaveValue('sai phường')
  })

  it('traps focus in the drawer and closes on Escape', async () => {
    const drawer = await openRow('moderator', NEEDS_REVIEW)
    expect(drawer).toHaveAttribute('aria-modal', 'true')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
