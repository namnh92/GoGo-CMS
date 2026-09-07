import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import {
  administrativeDatasets,
  administrativeDiff,
  administrativeTransition,
  administrativeValidationReport,
} from '@/shared/test/handlers'
import AdministrativeDataScreen from './administrativeData.view'
import AdministrativeDatasetDetailScreen from './datasetDetail.view'

/**
 * CMS #154 — the dataset operations screen.
 *
 * Everything here runs against MSW. Nothing in this file may reach a deployed
 * environment, and nothing in it mutates a real dataset: the interesting
 * assertions are about what the screen *refuses* to offer, which is exactly the
 * class of behaviour that cannot be checked by trying it on DEV.
 */

const BASE = '*/v1'
/** Addressed by lifecycle rather than by index: the fixture list grows. */
const byStatus = (status: string) => administrativeDatasets.find((item) => item.status === status)!
const PUBLISHED = byStatus('PUBLISHED')
const VALIDATED = byStatus('VALIDATED')
const RESTORABLE = byStatus('ROLLED_BACK')
const FAILED = byStatus('STAGED')

afterEach(() => {
  window.sessionStorage.clear()
})

/** Records requests so "asked nothing" is provable rather than assumed. */
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

function renderDetail(datasetId: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/administrative-data/:datasetId"
        element={<AdministrativeDatasetDetailScreen />}
      />
    </Routes>,
    { route: `/administrative-data/${datasetId}` },
  )
}

describe('who may open the screen at all', () => {
  it.each([
    ['moderator', false],
    ['editor', false],
    ['ops_admin', true],
    ['super_admin', true],
  ] as const)('%s: reads the dataset = %s', async (role, permitted) => {
    signInAs(role)
    const calls = spyOn('/cms/administrative-datasets')
    renderWithProviders(<AdministrativeDataScreen />)

    if (permitted) {
      await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    } else {
      expect(await screen.findByText(/Không đủ quyền|Not permitted/i)).toBeInTheDocument()
      // Hiding the destination is a courtesy; not asking is the half the
      // screen owns, and the server owns the rest.
      expect(calls).toEqual([])
    }
  })

  it('refuses a signed-out caller and asks nothing', async () => {
    const calls = spyOn('/cms/administrative-datasets')
    renderWithProviders(<AdministrativeDataScreen />)
    expect(await screen.findByText(/Không đủ quyền|Not permitted/i)).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('refuses the detail route to a moderator reaching it directly', async () => {
    signInAs('moderator')
    const calls = spyOn('/cms/administrative-datasets')
    renderDetail(PUBLISHED.id)
    expect(await screen.findByText(/Không đủ quyền|Not permitted/i)).toBeInTheDocument()
    expect(calls).toEqual([])
  })
})

describe('read-only ops sees the data and the reason, not a stripped screen', () => {
  it.each(['ops_admin', 'super_admin'] as const)(
    '%s can act, and the control is live only once the version has loaded',
    async (role) => {
      signInAs(role)
      renderDetail(VALIDATED.id)
      // Inert and silent while loading: nothing is decidable yet, and "still
      // loading" is not a reason worth putting in a warning box.
      expect(screen.getByRole('button', { name: /^Publish$/ })).toBeDisabled()
      await waitFor(() => expect(screen.getByRole('button', { name: /^Publish$/ })).toBeEnabled())
    },
  )
})

describe('capability', () => {
  it('names the active dataset and boundary versions', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AdministrativeDataScreen />)
    // Named in the capability panel and again on its row in the list.
    expect((await screen.findAllByText('v5.0.0+v2.4.1+7fac8c45+none+r0')).length).toBeGreaterThan(1)
    expect(screen.getByText('v5.0.0')).toBeInTheDocument()
  })

  it('says a missing dataset blocks approval, without claiming the API is down', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/capability`, () =>
        HttpResponse.json({
          dataset: {
            state: 'MISSING',
            version: null,
            publishedAt: null,
            ageSeconds: null,
            counts: {},
            quarantined: 0,
            unresolved: 0,
            validation: null,
          },
          boundaries: {
            state: 'MISSING',
            version: null,
            loadedAt: null,
            ageSeconds: null,
            provinces: 0,
            communes: 0,
          },
          resolver: 'PARTIAL',
          publication: 'BLOCKED',
          mappings: {},
          remediation: {},
          observedAt: '2026-09-07T00:00:00.000Z',
        }),
      ),
    )
    renderWithProviders(<AdministrativeDataScreen />)

    expect(
      await screen.findByText(/Chưa có bộ dữ liệu hành chính nào được publish/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Duyệt đăng địa điểm đang bị chặn/i)).toBeInTheDocument()
    // Blocked publication is the condition publishing a dataset resolves. It
    // must never be the reason the import button is inert.
    expect(screen.getByRole('button', { name: /Nhập bản đã ghim/i })).toBeEnabled()
  })

  it('keeps the rest of the screen working when capability itself fails', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/capability`, () =>
        HttpResponse.json({ code: 'UNKNOWN', message: 'boom' }, { status: 500 }),
      ),
    )
    renderWithProviders(<AdministrativeDataScreen />)

    // The version list still renders: one degraded panel is not an outage.
    expect(await screen.findByText(VALIDATED.combinedDatasetVersion)).toBeInTheDocument()
  })
})

describe('the version list', () => {
  it('shows lifecycle, provenance and the server’s own publishable verdict', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AdministrativeDataScreen />)

    expect((await screen.findAllByText(PUBLISHED.combinedDatasetVersion)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Publish được/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Đang hoạt động/i).length).toBeGreaterThan(0)
  })

  it('pages on the server, and never fetches the whole history to page locally', async () => {
    signInAs('ops_admin')
    const seen: string[] = []
    server.use(
      http.get(`${BASE}/cms/administrative-datasets`, ({ request }) => {
        const url = new URL(request.url)
        seen.push(`${url.searchParams.get('limit')}/${url.searchParams.get('offset')}`)
        return HttpResponse.json({
          items: [PUBLISHED],
          total: 60,
          limit: Number(url.searchParams.get('limit') ?? 25),
          offset: Number(url.searchParams.get('offset') ?? 0),
        })
      }),
    )
    renderWithProviders(<AdministrativeDataScreen />)

    await screen.findAllByText(PUBLISHED.combinedDatasetVersion)
    await userEvent.click(screen.getByRole('button', { name: /Sau|Next/i }))
    await waitFor(() => expect(seen).toContain('25/25'))
    expect(seen.every((call) => call.startsWith('25/'))).toBe(true)
  })

  it('has an empty state that says import publishes nothing', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets`, () =>
        HttpResponse.json({ items: [], total: 0, limit: 25, offset: 0 }),
      ),
    )
    renderWithProviders(<AdministrativeDataScreen />)
    expect(await screen.findByText(/Nhập không publish bất cứ thứ gì/i)).toBeInTheDocument()
  })
})

describe('import', () => {
  it('presents the pinned release rather than a file upload, and stages only', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AdministrativeDataScreen />)

    await userEvent.click(await screen.findByRole('button', { name: /Nhập bản đã ghim/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Không có tệp nào để tải lên/i)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/chỉ tạo một phiên bản ở trạng thái Đã nhập/i),
    ).toBeInTheDocument()
    // A file picker here would be a lie about where the data comes from.
    expect(dialog.querySelector('input[type="file"]')).toBeNull()
  })

  it('sends one Idempotency-Key per decision and reuses it on a retry', async () => {
    signInAs('ops_admin')
    const keys: string[] = []
    let attempt = 0
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/import`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '')
        attempt += 1
        if (attempt === 1) {
          return HttpResponse.json({ code: 'UNKNOWN', message: 'flaky' }, { status: 500 })
        }
        return HttpResponse.json(
          {
            datasetVersionId: VALIDATED.id,
            combinedDatasetVersion: VALIDATED.combinedDatasetVersion,
            combinedChecksum: VALIDATED.combinedChecksum,
            counts: {
              provinces: 34,
              communes: 3321,
              legacyDistricts: 705,
              legacyCommunes: 10598,
              canonicalChanges: 10598,
              quarantined: 1033,
            },
            classification: {},
            warnings: [],
          },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<AdministrativeDataScreen />)

    await userEvent.click(await screen.findByRole('button', { name: /Nhập bản đã ghim/i }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: /^Nhập$/ })
    await userEvent.click(confirm)
    await waitFor(() => expect(keys).toHaveLength(1))
    await userEvent.click(confirm)
    await waitFor(() => expect(keys).toHaveLength(2))

    // The same decision, retried — replaying the key is what stops a flaky
    // connection from importing twice.
    expect(keys[0]).toBe(keys[1])
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reports a duplicate import as the domain refusal it is', async () => {
    signInAs('ops_admin')
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/import`, () =>
        HttpResponse.json(
          { code: 'DATASET_ALREADY_IMPORTED', message: 'same sources, same revision' },
          { status: 409 },
        ),
      ),
    )
    renderWithProviders(<AdministrativeDataScreen />)

    await userEvent.click(await screen.findByRole('button', { name: /Nhập bản đã ghim/i }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /^Nhập$/ }),
    )
    expect(await screen.findByText(/đã được nhập rồi/i)).toBeInTheDocument()
  })
})

describe('validation presentation', () => {
  it('separates ERROR from WARNING and says which one blocks', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id`, () =>
        HttpResponse.json({
          ...VALIDATED,
          validation: { ...VALIDATED.validation, errors: 2, publishable: false },
          validationReport: {
            ...administrativeValidationReport(VALIDATED),
            errors: 2,
            publishable: false,
            findings: [
              {
                gate: 'orphan_commune',
                severity: 'ERROR',
                message: '2 communes have no province',
                count: 2,
                samples: ['00099'],
              },
              {
                gate: 'commune_code_reuse',
                severity: 'WARNING',
                message: '2212 codes changed meaning',
                count: 2212,
                samples: ['00001'],
              },
            ],
          },
          diffSummary: null,
        }),
      ),
    )
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Kiểm tra/i }))
    expect(await screen.findByText('orphan_commune')).toBeInTheDocument()
    expect(screen.getByText('commune_code_reuse')).toBeInTheDocument()
    // Said twice on purpose: beside the disabled control, and in the report.
    expect(screen.getAllByText(/không thể bỏ qua/i).length).toBeGreaterThan(0)
  })

  it('disables publish on an ERROR and names the count', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id`, () =>
        HttpResponse.json({
          ...VALIDATED,
          validation: { ...VALIDATED.validation, errors: 2, publishable: false },
          validationReport: null,
          diffSummary: null,
        }),
      ),
    )
    renderDetail(VALIDATED.id)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Publish$/ })).toBeDisabled())
    expect(await screen.findByText(/2 lỗi kiểm tra đang chặn publish/i)).toBeInTheDocument()
  })

  it('allows publish on warnings alone', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)
    await waitFor(() => expect(screen.getByRole('button', { name: /^Publish$/ })).toBeEnabled())
  })

  it('refuses publish when the stored validation describes another snapshot', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id`, () =>
        HttpResponse.json({
          ...VALIDATED,
          validationReport: {
            ...administrativeValidationReport(VALIDATED),
            boundTo: {
              ...administrativeValidationReport(VALIDATED).boundTo,
              combinedChecksum: 'a-different-checksum',
            },
          },
          diffSummary: null,
        }),
      ),
    )
    renderDetail(VALIDATED.id)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Publish$/ })).toBeDisabled())
    expect((await screen.findAllByText(/không còn mô tả phiên bản này/i)).length).toBeGreaterThan(0)
  })

  it('does not offer to validate the active version', async () => {
    // GoGo-BE's validate has no lifecycle guard and would demote it.
    signInAs('ops_admin')
    renderDetail(PUBLISHED.id)
    await waitFor(() => expect(screen.getByRole('button', { name: /^Kiểm tra$/ })).toBeDisabled())
  })
})

describe('diff', () => {
  it('shows every category, including the ones at zero, with complete counts', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Thay đổi/i }))
    expect((await screen.findAllByText(/Đổi tên/)).length).toBeGreaterThan(0)
    // A category with nothing in it is a fact worth reading, not an omission.
    expect(screen.getByText(/Chia tách/)).toBeInTheDocument()
    expect(screen.getByText(/Sáp nhập/)).toBeInTheDocument()
  })

  it('carries the effective period beside every code, because a code is not an identity', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Thay đổi/i }))
    const rows = await screen.findAllByText('00001')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/2025|2026/).length).toBeGreaterThan(0)
  })

  it('reads a pure override bump as one SOURCE_DRIFT rather than thousands of migrations', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id/diff`, () =>
        HttpResponse.json({
          ...administrativeDiff,
          countsByCategory: { SOURCE_DRIFT: 1 },
          entries: [administrativeDiff.entries[2]],
          pagination: { offset: 0, limit: 100, totalEntries: 1, hasMore: false },
        }),
      ),
    )
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Thay đổi/i }))
    expect(await screen.findByText(/Chỉ có định danh nguồn thay đổi/i)).toBeInTheDocument()
  })

  it('names a first publication as a comparison against an empty baseline', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id/diff`, () =>
        HttpResponse.json({ ...administrativeDiff, fromVersion: null }),
      ),
    )
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Thay đổi/i }))
    expect(await screen.findByText(/Lần publish đầu tiên/i)).toBeInTheDocument()
  })

  it('keeps the affected-place total apart from the capped sample', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Thay đổi/i }))
    expect(await screen.findByText(/Hiển thị 1 ví dụ trong tổng số 12/i)).toBeInTheDocument()
  })

  it('pages entries on the server and keeps the total intact', async () => {
    signInAs('ops_admin')
    const seen: string[] = []
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id/diff`, ({ request }) => {
        const url = new URL(request.url)
        seen.push(url.searchParams.get('offset') ?? '')
        return HttpResponse.json({
          ...administrativeDiff,
          pagination: {
            offset: Number(url.searchParams.get('offset') ?? 0),
            limit: 100,
            totalEntries: 320,
            hasMore: true,
          },
        })
      }),
    )
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Thay đổi/i }))
    await screen.findByText(/Hiển thị 3 \/ 320 thay đổi/i)
    await userEvent.click(screen.getByRole('button', { name: /Sau|Next/i }))
    await waitFor(() => expect(seen).toContain('100'))
    // The complete count never shrinks to the size of the page.
    expect(await screen.findByText(/Hiển thị 3 \/ 320 thay đổi/i)).toBeInTheDocument()
  })
})

describe('publish', () => {
  it('states what changes before asking, and is keyboard operable', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('button', { name: /^Publish$/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Not "are you sure?": the version leaving, the version arriving, the
    // server's validation result and the size of the change.
    expect(within(dialog).getByText(PUBLISHED.combinedDatasetVersion)).toBeInTheDocument()
    expect(within(dialog).getByText(VALIDATED.combinedDatasetVersion)).toBeInTheDocument()
    expect(within(dialog).getByText(/địa điểm đang mang một khẳng định/i)).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('publishes once however many times the button is pressed', async () => {
    signInAs('ops_admin')
    const keys: string[] = []
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/publish`, async ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '')
        return HttpResponse.json(administrativeTransition(VALIDATED), { status: 201 })
      }),
    )
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('button', { name: /^Publish$/ }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getAllByRole('button', { name: /^Publish$/ })[0]!
    await userEvent.dblClick(confirm)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(keys).toHaveLength(1)
  })

  it('treats cacheWarmed:false as a bounded-consistency note, not a failure', async () => {
    signInAs('ops_admin')
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/publish`, () =>
        HttpResponse.json(
          { ...administrativeTransition(VALIDATED), cacheWarmed: false },
          { status: 201 },
        ),
      ),
    )
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('button', { name: /^Publish$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getAllByRole('button', { name: /^Publish$/ })[0]!,
    )
    expect(await screen.findByText(/Đã publish/i)).toBeInTheDocument()
    expect(await screen.findByText(/PostgreSQL mới là nguồn quyết định/i)).toBeInTheDocument()
  })

  it('reports stale mappings as a report rather than as writes', async () => {
    signInAs('ops_admin')
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/publish`, () =>
        HttpResponse.json(
          {
            ...administrativeTransition(VALIDATED),
            staleMappings: { total: 41, samples: [], truncated: false, sampleLimit: 20 },
          },
          { status: 201 },
        ),
      ),
    )
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('button', { name: /^Publish$/ }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getAllByRole('button', { name: /^Publish$/ })[0]!,
    )
    expect(await screen.findByText(/41 ánh xạ không còn khớp/i)).toBeInTheDocument()
    expect(await screen.findByText(/Được báo cáo, không bị ghi đè/i)).toBeInTheDocument()
  })

  it('refetches instead of retrying when another publication won the race', async () => {
    signInAs('ops_admin')
    let detailReads = 0
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id`, () => {
        detailReads += 1
        return HttpResponse.json({
          ...VALIDATED,
          validationReport: administrativeValidationReport(VALIDATED),
          diffSummary: null,
        })
      }),
      http.post(`${BASE}/cms/administrative-datasets/:id/publish`, () =>
        HttpResponse.json(
          { code: 'ACTIVE_VERSION_CHANGED', message: 'another publication won' },
          { status: 409 },
        ),
      ),
    )
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('button', { name: /^Publish$/ }))
    const before = detailReads
    await userEvent.click(
      within(await screen.findByRole('dialog')).getAllByRole('button', { name: /^Publish$/ })[0]!,
    )
    expect(await screen.findByText(/đã thắng trong lúc thao tác này/i)).toBeInTheDocument()
    // Refetched, not retried: the baseline it would decide against has moved.
    await waitFor(() => expect(detailReads).toBeGreaterThan(before))
  })
})

describe('rollback', () => {
  it('offers nothing outside the server’s restorable list', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)
    await waitFor(() => expect(screen.getByRole('button', { name: /Rollback/i })).toBeDisabled())
    expect(await screen.findByText(/chưa từng hoạt động/i)).toBeInTheDocument()
  })

  it('offers a restorable version, and says what rollback does not do', async () => {
    signInAs('ops_admin')
    renderDetail(RESTORABLE.id)

    await userEvent.click(await screen.findByRole('button', { name: /Rollback/i }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/không sửa địa chỉ đã lưu, không đảo migration/i),
    ).toBeInTheDocument()
  })

  it('restores and refreshes every administrative query', async () => {
    signInAs('ops_admin')
    let capabilityReads = 0
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/capability`, () => {
        capabilityReads += 1
        return undefined
      }),
      http.post(`${BASE}/cms/administrative-datasets/:id/rollback`, () =>
        HttpResponse.json(administrativeTransition(RESTORABLE), { status: 201 }),
      ),
    )
    renderDetail(RESTORABLE.id)

    await userEvent.click(await screen.findByRole('button', { name: /Rollback/i }))
    const before = capabilityReads
    await userEvent.click(
      within(await screen.findByRole('dialog')).getAllByRole('button', { name: /Rollback/i })[0]!,
    )
    expect(await screen.findByText(/Đã khôi phục/i)).toBeInTheDocument()
    await waitFor(() => expect(capabilityReads).toBeGreaterThan(before))
  })
})

describe('keyboard', () => {
  it('moves between tabs with the arrow keys and keeps one tab stop', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)

    const overview = await screen.findByRole('tab', { name: /Tổng quan/i })
    expect(overview).toHaveAttribute('aria-selected', 'true')
    overview.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Kiểm tra/i })).toHaveAttribute('aria-selected', 'true')
    // Roving tabindex: the strip is one stop, not four.
    expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toHaveLength(1)
  })

  it('gives the version table a caption and sortable-column semantics', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AdministrativeDataScreen />)

    const table = await screen.findByRole('table', { name: /Các phiên bản đã nhập/i })
    expect(within(table).getAllByRole('columnheader').length).toBeGreaterThan(5)
  })
})

describe('a version that failed its gates', () => {
  it('is offered no publish, and says how many errors are in the way', async () => {
    signInAs('ops_admin')
    renderDetail(FAILED.id)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Publish$/ })).toBeDisabled())
    expect(await screen.findByText(/2 lỗi kiểm tra đang chặn publish/i)).toBeInTheDocument()
    // It failed a check; nobody rejected it, so validating again is offered.
    expect(screen.getByRole('button', { name: /^Kiểm tra$/ })).toBeEnabled()
  })
})

describe('audit', () => {
  it('shows this version’s history, refused publications included', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Nhật ký/i }))
    // The selected tab and the panel below it agree.
    expect(screen.getByRole('tab', { name: /Nhật ký/i })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/administrative_dataset\.publish_rejected/)).toBeInTheDocument()
    expect(screen.getByText(/administrative_dataset\.import/)).toBeInTheDocument()
  })

  it('scopes the query to this dataset, not the whole log', async () => {
    signInAs('ops_admin')
    const urls: string[] = []
    server.use(
      http.get(`${BASE}/cms/audit`, ({ request }) => {
        urls.push(request.url)
        return undefined
      }),
    )
    renderDetail(VALIDATED.id)
    await userEvent.click(await screen.findByRole('tab', { name: /Nhật ký/i }))

    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    expect(urls[0]).toContain('resourceType=administrative_dataset')
    expect(urls[0]).toContain(`resourceId=${VALIDATED.id}`)
  })
})

/**
 * CMS #167 — the two refusals GoGo-BE#482 added to the validate contract.
 *
 * Both mean the same thing to the screen: what it was showing is no longer what
 * the server holds. So both refetch, neither retries, and neither is presented
 * as anything other than a refusal — a failed request that reported itself as
 * an idempotent replay would be claiming the server had already done the work.
 */
describe('validate refusals from the alpha.9 contract', () => {
  const refuse = (code: string, message: string) =>
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/validate`, () =>
        HttpResponse.json({ code, message }, { status: 409 }),
      ),
    )

  it('sends an Idempotency-Key on every validation', async () => {
    signInAs('ops_admin')
    const keys: (string | null)[] = []
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/validate`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return undefined
      }),
    )
    renderDetail(VALIDATED.id)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Kiểm tra$/ })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /^Kiểm tra$/ }))
    await waitFor(() => expect(keys).toHaveLength(1))
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('explains a lifecycle that moved under the render, and refetches', async () => {
    signInAs('ops_admin')
    let detailReads = 0
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id`, () => {
        detailReads += 1
        return undefined
      }),
    )
    refuse('DATASET_STATE_NOT_VALIDATABLE', 'is PUBLISHED')
    renderDetail(VALIDATED.id)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Kiểm tra$/ })).toBeEnabled())
    const before = detailReads
    await userEvent.click(screen.getByRole('button', { name: /^Kiểm tra$/ }))

    expect(await screen.findByText(/Vòng đời của phiên bản này đã thay đổi/i)).toBeInTheDocument()
    await waitFor(() => expect(detailReads).toBeGreaterThan(before))
  })

  it('discards the validation it was about to show when the snapshot moved', async () => {
    signInAs('ops_admin')
    let diffReads = 0
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id/diff`, () => {
        diffReads += 1
        return undefined
      }),
    )
    refuse('DATASET_CHANGED_DURING_VALIDATION', 'staged rows changed')
    renderDetail(VALIDATED.id)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Kiểm tra$/ })).toBeEnabled())
    const before = diffReads
    await userEvent.click(screen.getByRole('button', { name: /^Kiểm tra$/ }))

    expect(await screen.findByText(/Ảnh chụp dữ liệu đã thay đổi/i)).toBeInTheDocument()
    expect(screen.getByText(/Không có gì được ghi/i)).toBeInTheDocument()
    // The diff on screen described the run that was discarded.
    await waitFor(() => expect(diffReads).toBeGreaterThan(before))
  })

  it('retries neither refusal on its own, and never calls one a replay', async () => {
    signInAs('ops_admin')
    let attempts = 0
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/validate`, () => {
        attempts += 1
        return HttpResponse.json(
          { code: 'DATASET_CHANGED_DURING_VALIDATION', message: 'moved' },
          { status: 409 },
        )
      }),
    )
    renderDetail(VALIDATED.id)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Kiểm tra$/ })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /^Kiểm tra$/ }))
    await screen.findByText(/Ảnh chụp dữ liệu đã thay đổi/i)

    // One request, one message. A refusal is a decision to read, not a
    // transient to retry through.
    expect(attempts).toBe(1)
    expect(screen.queryByText(/phát lại|replay/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Đã chạy kiểm tra/i)).not.toBeInTheDocument()
  })

  it('mints a new key for the manual retry after a refusal', async () => {
    signInAs('ops_admin')
    const keys: (string | null)[] = []
    server.use(
      http.post(`${BASE}/cms/administrative-datasets/:id/validate`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return HttpResponse.json(
          { code: 'DATASET_CHANGED_DURING_VALIDATION', message: 'moved' },
          { status: 409 },
        )
      }),
    )
    renderDetail(VALIDATED.id)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Kiểm tra$/ })).toBeEnabled())
    const button = screen.getByRole('button', { name: /^Kiểm tra$/ })
    await userEvent.click(button)
    await waitFor(() => expect(keys).toHaveLength(1))
    await userEvent.click(button)
    await waitFor(() => expect(keys).toHaveLength(2))

    /*
     * GoGo-BE releases the key behind a refused mutation, so the second press
     * is a new decision about state that has moved — not the retry of one the
     * server may already have applied. That case is a network failure, and the
     * key is kept for it.
     */
    expect(keys[0]).not.toBe(keys[1])
  })
})

describe('the audit fixture answers what the API actually writes', () => {
  it('has no successful-validation row, because GoGo-BE writes none', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Nhật ký/i }))
    await screen.findByText(/administrative_dataset\.import/)
    // A validation that runs leaves its evidence in the stored report, not in
    // the audit log. The action exists in the vocabulary and is never written.
    expect(screen.queryByText('administrative_dataset.validate')).not.toBeInTheDocument()
  })

  it('shows a refused validation under the action GoGo-BE#482 introduced', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)

    await userEvent.click(await screen.findByRole('tab', { name: /Nhật ký/i }))
    expect(await screen.findByText(/administrative_dataset\.validate_rejected/)).toBeInTheDocument()
  })
})

describe('the rest of the console is untouched', () => {
  it('adds one child route and leaves every existing destination in place', async () => {
    const { router } = await import('@/app/routes')
    const paths = router.routes
      .flatMap((route) => route.children ?? [])
      .flatMap((route) => [route, ...(route.children ?? [])])
      .map((route) => route.path)
      .filter((path): path is string => typeof path === 'string')

    expect(paths).toContain('administrative-data')
    expect(paths).toContain('administrative-data/:datasetId')
    // #154 is a screen, not an information architecture change.
    for (const existing of ['places', 'moderation', 'imports', 'administrative-mapping']) {
      expect(paths).toContain(existing)
    }
  })
})

describe('the detail screen itself', () => {
  it('renders a loading state and then the version', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)
    expect(screen.getByText(/Đang tải/i)).toBeInTheDocument()
    expect((await screen.findAllByText(VALIDATED.combinedDatasetVersion)).length).toBeGreaterThan(0)
  })

  it('renders a retryable error when the version cannot be read', async () => {
    signInAs('ops_admin')
    server.use(
      http.get(`${BASE}/cms/administrative-datasets/:id`, () =>
        HttpResponse.json({ code: 'DATASET_NOT_FOUND', message: 'gone' }, { status: 404 }),
      ),
    )
    renderDetail(VALIDATED.id)
    expect(await screen.findByText(/Không tìm thấy bộ dữ liệu hành chính/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument()
  })

  it('ships no moderation control from #155 or #156', async () => {
    signInAs('ops_admin')
    renderDetail(VALIDATED.id)
    await screen.findAllByText(VALIDATED.combinedDatasetVersion)
    for (const name of [
      /xác nhận ánh xạ|verify mapping/i,
      /gán lại|rematch/i,
      /quarantine|xử lý cách ly/i,
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})
