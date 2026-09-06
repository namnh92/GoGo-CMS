import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import type { CmsPlace, PlaceStatus } from '@/shared/api/contracts'
import PlaceListScreen from './placeList.view'

/**
 * The `screen × role × state` matrix has to actually render — a selector that
 * swaps a query param without changing the output is a bug (quality-gates.md).
 *
 * Since GoGo-BE#144 reads are hierarchical: every staff role can open the
 * catalog, and the difference between them shows up in the actions.
 */
describe('place list, by role', () => {
  it('renders the catalog for an editor with writing enabled', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceListScreen />)

    expect(await screen.findByText('Chào Bạn Cafe & Space')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thêm địa điểm/ })).toBeEnabled()
  })

  it('lets a moderator read the catalog but not change it', async () => {
    signInAs('moderator')
    renderWithProviders(<PlaceListScreen />)

    // Reading is allowed now — this used to be a permission-denied screen.
    expect(await screen.findByText('Chào Bạn Cafe & Space')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thêm địa điểm/ })).toBeDisabled()
  })

  it('lets an ops admin read the catalog but not edit places', async () => {
    signInAs('ops_admin')
    renderWithProviders(<PlaceListScreen />)

    await waitFor(() => expect(screen.getByText('Chào Bạn Cafe & Space')).toBeInTheDocument())
    // ops_admin publishes imports that create places, and still cannot edit one.
    expect(screen.getByRole('button', { name: /Thêm địa điểm/ })).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: 'Sửa' })) {
      expect(button).toBeDisabled()
    }
  })

  it('applies the server-side filters the contract exposes', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceListScreen />)

    await screen.findByText('Chào Bạn Cafe & Space')
    expect(screen.getByLabelText('Mã khu vực')).toBeInTheDocument()
    expect(screen.getByLabelText('Khoá nhóm')).toBeInTheDocument()
    expect(screen.getByLabelText('Nguồn dữ liệu')).toBeInTheDocument()
    expect(screen.getByLabelText('Sắp xếp')).toBeInTheDocument()
  })
})

const ISO = '2026-01-01T00:00:00.000Z'

function row(id: string, name: string, status: PlaceStatus): CmsPlace {
  return {
    id,
    name,
    status,
    areaKey: 'hcm_q1',
    rating: 4.2,
    confidence: 0.8,
    freshnessCheckedAt: ISO,
    createdAt: ISO,
    updatedAt: ISO,
  }
}

function listing(...items: CmsPlace[]) {
  server.use(
    http.get('/v1/cms/places', () => HttpResponse.json({ items, nextCursor: null })),
    // The tabs re-query on mount; keep the stale/duplicate routes untouched.
  )
}

/** The bulk bar, so a label shared with a tab ("Chờ duyệt") cannot be picked up. */
function bulkBar() {
  return within(screen.getByRole('region', { name: 'Áp dụng thao tác cho các mục đã chọn' }))
}

/**
 * FR-CMS-002: the place state machine lives in GoGo-BE
 * (`cms-catalog.service.ts`). A bulk button that offers an illegal target only
 * finds out by firing N requests and collecting 409s, so every button is bound
 * to `PLACE_TRANSITIONS` for every selected row.
 */
describe('bulk place workflow', () => {
  it.each([
    ['draft' as const, false, true, false, true],
    ['review' as const, true, false, false, true],
    ['published' as const, false, false, true, true],
    ['archived' as const, false, false, false, false],
  ])(
    'from %s offers exactly the legal transitions',
    async (status, publish, review, suspend, archive) => {
      signInAs('super_admin')
      listing(row('pl-one', 'Một Địa Điểm', status))
      const user = userEvent.setup()
      renderWithProviders(<PlaceListScreen />)

      await user.click(await screen.findByLabelText('Một Địa Điểm'))

      const bar = bulkBar()
      expect(bar.getByRole('button', { name: 'Xuất bản' })).toHaveProperty('disabled', !publish)
      expect(bar.getByRole('button', { name: 'Chờ duyệt' })).toHaveProperty('disabled', !review)
      expect(bar.getByRole('button', { name: 'Tạm ngưng' })).toHaveProperty('disabled', !suspend)
      expect(bar.getByRole('button', { name: 'Lưu trữ' })).toHaveProperty('disabled', !archive)
    },
  )

  it('offers only what a mixed selection has in common', async () => {
    signInAs('super_admin')
    listing(row('pl-draft', 'Bản Nháp', 'draft'), row('pl-published', 'Đã Xuất Bản', 'published'))
    const user = userEvent.setup()
    renderWithProviders(<PlaceListScreen />)

    await user.click(await screen.findByLabelText('Bản Nháp'))
    await user.click(screen.getByLabelText('Đã Xuất Bản'))

    const bar = bulkBar()
    // `archived` is the only target both statuses accept.
    expect(bar.getByRole('button', { name: 'Lưu trữ' })).toBeEnabled()
    expect(bar.getByRole('button', { name: 'Chờ duyệt' })).toBeDisabled()
    expect(bar.getByRole('button', { name: 'Xuất bản' })).toBeDisabled()
    expect(bar.getByRole('button', { name: 'Tạm ngưng' })).toBeDisabled()
  })

  it('never claims success when only part of the selection moved', async () => {
    signInAs('super_admin')
    const items = [row('pl-ok', 'Chuyển Được', 'published'), row('pl-bad', 'Kẹt Lại', 'published')]
    let refetched = 0
    server.use(
      http.get('/v1/cms/places', () => {
        refetched += 1
        return HttpResponse.json({ items, nextCursor: null })
      }),
      http.patch('/v1/cms/places/:id/status', ({ params }) =>
        params.id === 'pl-bad'
          ? HttpResponse.json(
              {
                code: 'INVALID_PLACE_TRANSITION',
                message: 'published → archived is not allowed',
                field_errors: [],
                request_id: 'req-partial',
                retryable: false,
              },
              { status: 409 },
            )
          : HttpResponse.json({ ...items[0], status: 'archived' }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlaceListScreen />)

    await user.click(await screen.findByLabelText('Chuyển Được'))
    await user.click(screen.getByLabelText('Kẹt Lại'))
    const before = refetched
    await user.click(bulkBar().getByRole('button', { name: 'Lưu trữ' }))

    // The failure is stated as a partial result, never as "done".
    expect(await screen.findByText('Chỉ 1/2 địa điểm chuyển được sang Lưu trữ')).toBeInTheDocument()
    expect(screen.queryByText(/Đã chuyển 2 địa điểm/)).not.toBeInTheDocument()
    // And the table is refetched rather than left showing a guess.
    await waitFor(() => expect(refetched).toBeGreaterThan(before))
    // The row that did not move stays selected, so a retry is one click.
    expect(screen.getByLabelText('Kẹt Lại')).toBeChecked()
    expect(screen.getByLabelText('Chuyển Được')).not.toBeChecked()
  })
})
