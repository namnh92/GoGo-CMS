import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import type { Schemas } from '@/shared/api/generated'
import PlaceVerificationScreen from './placeVerification.view'

const place = places[0]!
const path = `/v1/cms/places/${place.id}`
const initial = {
  status: 'unverified',
  identityRevision: 1,
  version: 0,
  etag: '"1:0"',
} satisfies Schemas['CmsVenueVerification']

function open(role: 'editor' | 'moderator' | 'ops_admin' | 'super_admin' = 'moderator') {
  signInAs(role)
  return renderWithProviders(
    <Routes>
      <Route path="/places/:id/verification" element={<PlaceVerificationScreen />} />
    </Routes>,
    { route: `/places/${place.id}/verification` },
  )
}

function mockDetail(verification: Schemas['CmsVenueVerification'] | null = initial) {
  server.use(http.get(path, () => HttpResponse.json({ ...place, verification })))
}

async function fillEvidence() {
  await userEvent.type(await screen.findByLabelText(/Tham chiếu bằng chứng/), 'CASE-275')
  await userEvent.type(
    screen.getByLabelText(/Lý do quyết định/),
    'Đã đối chiếu danh tính và vị trí',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Xác minh địa điểm' }))
  return screen.findByRole('dialog')
}

describe('venue verification decisions (CMS#275)', () => {
  it('verifies then revokes with current ETags, CSRF, evidence and separate idempotency keys', async () => {
    let verification: Schemas['CmsVenueVerification'] = initial
    const writes: { headers: Headers; body: unknown }[] = []
    server.use(
      http.get(path, () => HttpResponse.json({ ...place, verification })),
      http.put(`${path}/verification`, async ({ request }) => {
        const body = (await request.json()) as Schemas['SetVenueVerification']
        writes.push({ headers: request.headers, body })
        verification = {
          ...verification,
          status: body.status,
          version: verification.version + 1,
          etag: `"1:${verification.version + 1}"`,
          ...(body.status === 'verified'
            ? { verifiedAt: '2026-11-06T08:00:00Z' }
            : { verifiedAt: undefined }),
        }
        return HttpResponse.json(verification)
      }),
    )
    open()
    const dialog = await fillEvidence()
    expect(within(dialog).getByText('CASE-275')).toBeInTheDocument()
    expect(within(dialog).getByText('Khảo sát thực địa')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Đã xác minh')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Lý do quyết định/), 'Bằng chứng không còn hiệu lực')
    await userEvent.click(screen.getByRole('button', { name: 'Thu hồi xác minh' }))
    const revoke = await screen.findByRole('dialog')
    expect(within(revoke).getByText('Chưa xác minh')).toBeInTheDocument()
    await userEvent.click(within(revoke).getByRole('button', { name: 'Xác nhận quyết định' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await screen.findByText('Chưa xác minh')
    expect(writes).toHaveLength(2)
    expect(writes[0]!.body).toEqual({
      status: 'verified',
      evidenceType: 'site_visit',
      evidenceReference: 'CASE-275',
      reason: 'Đã đối chiếu danh tính và vị trí',
    })
    expect(writes[1]!.body).toEqual({
      status: 'unverified',
      reason: 'Bằng chứng không còn hiệu lực',
    })
    expect(writes[0]!.headers.get('if-match')).toBe('"1:0"')
    expect(writes[1]!.headers.get('if-match')).toBe('"1:1"')
    expect(writes[0]!.headers.get('x-gogo-csrf')).toBe('mock-csrf-token')
    expect(writes[0]!.headers.get('idempotency-key')).toBeTruthy()
    expect(writes[1]!.headers.get('idempotency-key')).not.toBe(
      writes[0]!.headers.get('idempotency-key'),
    )
  })

  it.each(['editor', 'ops_admin'] as const)(
    'lets %s read without offering a decision',
    async (role) => {
      mockDetail()
      open(role)
      await screen.findByText('Chưa xác minh')
      expect(screen.queryByLabelText(/Tham chiếu bằng chứng/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Xác minh địa điểm' })).not.toBeInTheDocument()
    },
  )

  it('requires evidence and a nonblank reason before preview', async () => {
    mockDetail()
    open('super_admin')
    const button = await screen.findByRole('button', { name: 'Xác minh địa điểm' })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Tham chiếu bằng chứng/), '   ')
    await userEvent.type(screen.getByLabelText(/Lý do quyết định/), 'Reason')
    expect(button).toBeDisabled()
  })

  it('renders missing contract facts as unavailable rather than unverified', async () => {
    mockDetail(null)
    open()
    await screen.findByText(/API chưa cung cấp trạng thái/)
    expect(screen.queryByText('Chưa xác minh')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Lý do quyết định/)).not.toBeInTheDocument()
  })

  it('blocks stale decisions until an explicit reload provides a new identity revision', async () => {
    let current: Schemas['CmsVenueVerification'] = initial
    let writes = 0
    server.use(
      http.get(path, () => HttpResponse.json({ ...place, verification: current })),
      http.put(`${path}/verification`, () => {
        writes++
        current = { ...initial, identityRevision: 2, etag: '"2:0"' }
        return new HttpResponse(null, { status: 412 })
      }),
    )
    open()
    const dialog = await fillEvidence()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }))
    await screen.findByText(/Phiên bản hiện tại không còn dùng được/)
    expect(screen.getByRole('button', { name: 'Xác minh địa điểm' })).toBeDisabled()
    expect(writes).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại địa điểm' }))
    await waitFor(() =>
      expect(screen.queryByText(/Phiên bản hiện tại không còn dùng được/)).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText(/Lý do quyết định/)).toHaveValue('')
  })

  it('discards a 428 decision and restores editing after reloading the same ETag', async () => {
    let reads = 0
    let writes = 0
    server.use(
      http.get(path, () => {
        reads++
        return HttpResponse.json({ ...place, verification: initial })
      }),
      http.put(`${path}/verification`, () => {
        writes++
        return HttpResponse.json(
          { code: 'PRECONDITION_REQUIRED', message: 'Reload required' },
          { status: 428 },
        )
      }),
    )
    open()
    await userEvent.selectOptions(await screen.findByLabelText(/Loại bằng chứng/), 'venue_document')
    const dialog = await fillEvidence()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }))
    await screen.findByText(/Phiên bản hiện tại không còn dùng được/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Lý do quyết định/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xác minh địa điểm' })).toBeDisabled()
    const readsBeforeReload = reads
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại địa điểm' }))
    await waitFor(() =>
      expect(screen.queryByText(/Phiên bản hiện tại không còn dùng được/)).not.toBeInTheDocument(),
    )
    expect(reads).toBeGreaterThan(readsBeforeReload)
    expect(screen.queryByText('Reload required')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Loại bằng chứng/)).toHaveValue('site_visit')
    expect(screen.getByLabelText(/Tham chiếu bằng chứng/)).toHaveValue('')
    expect(screen.getByLabelText(/Tham chiếu bằng chứng/)).toBeEnabled()
    expect(screen.getByLabelText(/Lý do quyết định/)).toHaveValue('')
    expect(screen.getByLabelText(/Lý do quyết định/)).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Xác minh địa điểm' })).toBeDisabled()
    const freshDialog = await fillEvidence()
    expect(within(freshDialog).getByText('Khảo sát thực địa')).toBeInTheDocument()
    expect(within(freshDialog).getByRole('button', { name: 'Xác nhận quyết định' })).toBeEnabled()
    expect(writes).toBe(1)
  })

  it('retries the same preview with the same idempotency key after a network failure', async () => {
    mockDetail()
    const keys: (string | null)[] = []
    server.use(
      http.put(`${path}/verification`, ({ request }) => {
        keys.push(request.headers.get('idempotency-key'))
        return HttpResponse.error()
      }),
    )
    open()
    const dialog = await fillEvidence()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }))
    await within(dialog).findByText('Mất kết nối mạng')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }))
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  })

  it('removes the form on a mid-session 403', async () => {
    mockDetail()
    server.use(
      http.put(`${path}/verification`, () =>
        HttpResponse.json({ code: 'ROLE_DENIED', message: 'denied' }, { status: 403 }),
      ),
    )
    open()
    const dialog = await fillEvidence()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }))
    await waitFor(() => expect(screen.queryByLabelText(/Lý do quyết định/)).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows loading until the detail responds', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    server.use(
      http.get(path, async () => {
        await pending
        return HttpResponse.json({ ...place, verification: initial })
      }),
    )
    open()
    try {
      expect(await screen.findByRole('status', { name: 'Đang tải…' })).toBeInTheDocument()
      expect(screen.queryByLabelText(/Lý do quyết định/)).not.toBeInTheDocument()
    } finally {
      finish()
    }
    await screen.findByText('Chưa xác minh')
  })

  it('renders a denied detail read without a decision form', async () => {
    server.use(
      http.get(path, () =>
        HttpResponse.json({ code: 'ROLE_DENIED', message: 'denied' }, { status: 403 }),
      ),
    )
    open()
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Lý do quyết định/)).not.toBeInTheDocument()
  })

  it('keeps the preview and displays field errors and request ID on validation refusal', async () => {
    mockDetail()
    server.use(
      http.put(`${path}/verification`, () =>
        HttpResponse.json(
          {
            code: 'VALIDATION_FAILED',
            message: 'Evidence refused',
            request_id: 'req-275',
            field_errors: [
              { field: 'evidenceReference', code: 'invalid', message: 'Reference refused' },
            ],
          },
          { status: 400 },
        ),
      ),
    )
    open()
    const dialog = await fillEvidence()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận quyết định' }))
    expect(await within(dialog).findByText(/Reference refused/)).toBeInTheDocument()
    expect(within(dialog).getByText(/req-275/)).toBeInTheDocument()
    expect(within(dialog).getByText('CASE-275')).toBeInTheDocument()
  })

  it('offers retry when the detail read fails', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 503 })))
    open()
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Lý do quyết định/)).not.toBeInTheDocument()
  })
})
