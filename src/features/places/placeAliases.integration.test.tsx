import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import type { AdminRole } from '@/shared/api/contracts'
import { useOnline } from '@/shared/ui/useOnline'
import PlaceEditorScreen from './placeEditor.view'

vi.mock('@/shared/ui/useOnline', () => ({ useOnline: vi.fn(() => true) }))
const place = { ...places[0]!, aliases: ['CB'] }
const endpoint = '/v1/cms/places/:id'
function open(role: AdminRole = 'editor') {
  signInAs(role)
  return renderWithProviders(
    <Routes>
      <Route path="/places/:id" element={<PlaceEditorScreen />} />
    </Routes>,
    { route: `/places/${place.id}` },
  )
}
async function add(name = 'Chao Ban') {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Tên khác mới'), name)
  await user.click(screen.getByRole('button', { name: 'Thêm tên khác' }))
}
async function evidence() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nguồn tham chiếu tên khác'), 'Merchant interview')
  // datetime-local typing is inconsistently supported by jsdom/user-event.
  const { fireEvent } = await import('@testing-library/react')
  fireEvent.change(screen.getByLabelText('Ngày giờ thu thập tên khác'), {
    target: { value: '2026-08-01T10:00' },
  })
}
beforeEach(() => {
  vi.mocked(useOnline).mockReturnValue(true)
  server.use(http.get(endpoint, () => HttpResponse.json(place)))
})

describe('place aliases editor (#293)', () => {
  it('adds a chip and saves the replacement with independent evidence and the loaded version', async () => {
    let body: unknown
    server.use(
      http.patch(endpoint, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(place)
      }),
    )
    open()
    await add()
    expect(screen.getByRole('button', { name: 'Xoá tên khác Chao Ban' })).toBeEnabled()
    await evidence()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    await waitFor(() =>
      expect(body).toEqual({
        aliases: ['CB', 'Chao Ban'],
        aliasProvenance: {
          sourceType: 'editorial',
          sourceReference: 'Merchant interview',
          collectedAt: new Date('2026-08-01T10:00').toISOString(),
        },
        expectedUpdatedAt: place.updatedAt,
      }),
    )
  })

  it('removes the last chip and requires fresh evidence even for clearing the set', async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.patch(endpoint, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(place)
      }),
    )
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá tên khác CB' }))
    expect(screen.queryByRole('button', { name: 'Xoá tên khác CB' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    expect(body).toBeUndefined()
    expect(screen.getAllByText('Bắt buộc khi lưu giá trị này')).toHaveLength(2)
    await evidence()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    await waitFor(() => expect(body?.aliases).toEqual([]))
    expect(body?.expectedUpdatedAt).toBe(place.updatedAt)
    expect(body?.aliasProvenance).toBeDefined()
  })

  it('refuses overlong input and disables adding at twenty aliases', async () => {
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({
          ...place,
          aliases: Array.from({ length: 19 }, (_, i) => `Alias ${i}`),
        }),
      ),
    )
    open()
    await add('x'.repeat(121))
    expect(screen.getByText('Mỗi tên khác tối đa 120 ký tự.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Xoá tên khác/ })).toHaveLength(19)
    await userEvent.clear(screen.getByLabelText('Tên khác mới'))
    await add('Final alias')
    expect(screen.getAllByRole('button', { name: /^Xoá tên khác/ })).toHaveLength(20)
    expect(screen.getByRole('button', { name: 'Thêm tên khác' })).toBeDisabled()
  })

  it('maps BE indexed/list and evidence refusals onto their controls and preserves the draft', async () => {
    server.use(
      http.patch(endpoint, () =>
        HttpResponse.json(
          {
            code: 'VALIDATION_FAILED',
            message: 'Invalid',
            field_errors: [
              { field: 'aliases.1', code: 'custom', message: 'placeAliases.invalid' },
              {
                field: 'aliasProvenance.sourceReference',
                code: 'google_not_independent',
                message: 'Google is not independent',
              },
              { field: 'aliasProvenance.collectedAt', code: 'in_future', message: 'Future' },
            ],
            request_id: 'req-alias',
            retryable: false,
          },
          { status: 400 },
        ),
      ),
    )
    open()
    await add()
    await evidence()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Nguồn tham chiếu tên khác')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    )
    expect(screen.getByLabelText('Tên khác mới')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Ngày giờ thu thập tên khác')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Xoá tên khác Chao Ban' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nguồn tham chiếu tên khác')).toHaveValue('Merchant interview')
    expect(screen.getAllByText('req-alias').length).toBeGreaterThan(0)
  })

  it.each<AdminRole>(['moderator', 'ops_admin'])(
    'renders aliases read-only for %s, using the BE role permissions',
    async (role) => {
      open(role)
      const aliases = await screen.findByRole('group', { name: 'Tên khác (alias)' })
      expect(within(aliases).getByText('CB')).toBeInTheDocument()
      expect(within(aliases).getByText('Bạn chỉ có quyền xem tên khác.')).toBeInTheDocument()
      expect(within(aliases).queryByRole('button')).not.toBeInTheDocument()
      expect(within(aliases).queryByRole('textbox')).not.toBeInTheDocument()
    },
  )

  it('allows the existing super-admin override', async () => {
    open('super_admin')
    expect(await screen.findByRole('button', { name: 'Xoá tên khác CB' })).toBeEnabled()
  })

  it('disables alias controls while saving and offline', async () => {
    server.use(
      http.patch(endpoint, async () => {
        await delay(250)
        return HttpResponse.json(place)
      }),
    )
    const mounted = open()
    await add()
    await evidence()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    expect(screen.getByLabelText('Tên khác mới')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xoá tên khác CB' })).toBeDisabled()
    await screen.findByText('Đã lưu thông tin định danh')
    mounted.unmount()
    vi.mocked(useOnline).mockReturnValue(false)
    open()
    expect(await screen.findByLabelText('Tên khác mới')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xoá tên khác CB' })).toBeDisabled()
  })

  it('keeps chips on a version conflict and shows alias differences before reloading', async () => {
    server.use(
      http.patch(endpoint, () =>
        HttpResponse.json(
          {
            code: 'PLACE_MODIFIED',
            message: 'Changed',
            field_errors: [{ field: 'updatedAt', code: 'stale', message: '2026-08-03T00:00:00Z' }],
            request_id: 'req-conflict',
          },
          { status: 409 },
        ),
      ),
    )
    open()
    await add()
    await evidence()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    expect(await screen.findByText(/CB","Chao Ban/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xoá tên khác Chao Ban' })).toBeEnabled()
    expect(screen.getByLabelText('Nguồn tham chiếu tên khác')).toHaveValue('Merchant interview')
  })

  it('removes write controls after BE denies a mid-session save', async () => {
    server.use(
      http.patch(endpoint, () =>
        HttpResponse.json(
          { code: 'ROLE_DENIED', message: 'Forbidden', field_errors: [], request_id: 'req-denied' },
          { status: 403 },
        ),
      ),
    )
    open()
    await add()
    await evidence()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    expect(await screen.findByText('Bạn chỉ có quyền xem tên khác.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tên khác mới')).not.toBeInTheDocument()
  })

  it('rechecks evidence and uses the freshly read version when explicitly overwriting a conflict', async () => {
    let current = place
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.get(endpoint, () => HttpResponse.json(current)),
      http.patch(endpoint, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        if (bodies.length === 1) {
          current = { ...place, aliases: ['CB', 'Other'], updatedAt: '2026-08-03T00:00:00.000Z' }
          return HttpResponse.json(
            {
              code: 'PLACE_MODIFIED',
              message: 'Changed',
              field_errors: [{ field: 'updatedAt', code: 'stale', message: current.updatedAt }],
            },
            { status: 409 },
          )
        }
        return HttpResponse.json(current)
      }),
    )
    open()
    await add()
    await evidence()
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    await screen.findByText(/CB","Other/)
    await userEvent.clear(screen.getByLabelText('Nguồn tham chiếu tên khác'))
    await userEvent.click(screen.getByRole('button', { name: 'Ghi đè' }))
    expect(bodies).toHaveLength(1)
    await userEvent.type(
      screen.getByLabelText('Nguồn tham chiếu tên khác'),
      'New independent evidence',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ghi đè' }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toMatchObject({
      aliases: ['CB', 'Chao Ban'],
      expectedUpdatedAt: current.updatedAt,
      aliasProvenance: { sourceReference: 'New independent evidence' },
    })
  })

  it('does not silently discard an alias that has not been added to the chip list', async () => {
    let requests = 0
    server.use(
      http.patch(endpoint, () => {
        requests++
        return HttpResponse.json(place)
      }),
    )
    open()
    await userEvent.type(await screen.findByLabelText('Tên khác mới'), 'Unadded alias')
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))
    expect(
      await screen.findByText('Nhấn Thêm tên khác hoặc xoá ô nhập trước khi lưu.'),
    ).toBeInTheDocument()
    expect(requests).toBe(0)
  })

  it('uses English copy for the field and empty/read-only states', async () => {
    window.localStorage.setItem('gogo.cms.locale', 'en')
    server.use(http.get(endpoint, () => HttpResponse.json({ ...place, aliases: [] })))
    open('moderator')
    expect(await screen.findByRole('group', { name: 'Other names (aliases)' })).toBeInTheDocument()
    expect(screen.getByText('No aliases yet.')).toBeInTheDocument()
    expect(screen.getByText('You can only view aliases.')).toBeInTheDocument()
  })
})
