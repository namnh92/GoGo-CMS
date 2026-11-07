import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { mockDb, resetMockDb } from '@/shared/test/handlers'
import { server } from '@/shared/test/server'
import { setAccessToken } from '@/shared/auth/token'
import type { Schemas } from '@/shared/api/generated'
import { SubmissionReviewDrawer } from './submissionReview.view'

const ID = '9a1d0c00-0000-4000-8000-000000000001'
const OTHER = '9a1d0c00-0000-4000-8000-000000000002'
const CONTENT = '/v1/cms/place-submissions/:id/photos/:photoId/content'
const photos: Schemas['SubmissionPhoto'][] = [1, 2].map((n) => ({
  id: `a0000000-0000-4000-8000-00000000000${n}`,
  mediaId: `b0000000-0000-4000-8000-00000000000${n}`,
  width: 800,
  height: 600,
  status: 'pending',
  url: `/v1/cms/place-submissions/${ID}/photos/a0000000-0000-4000-8000-00000000000${n}/content`,
}))
const createUrl = vi.fn(() => `blob:private-${Math.random()}`)
const revokeUrl = vi.fn()
const NativeURL = URL
const detail = (id = ID) => mockDb.submissionDetails[id] as Record<string, unknown>

beforeEach(() => {
  resetMockDb()
  signInAs('moderator')
  detail().photos = structuredClone(photos)
  createUrl.mockClear()
  revokeUrl.mockClear()
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static override createObjectURL = createUrl
      static override revokeObjectURL = revokeUrl
    },
  )
  server.use(
    http.get(
      CONTENT,
      () =>
        new HttpResponse(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' },
        }),
    ),
  )
})
afterEach(() => {
  cleanup()
  setAccessToken(null)
  vi.unstubAllGlobals()
})

async function open() {
  const rendered = renderWithProviders(
    <SubmissionReviewDrawer submissionId={ID} onClose={vi.fn()} />,
  )
  const keep = await screen.findByRole('checkbox', { name: 'Giữ ảnh 1' })
  return { ...rendered, keep, user: userEvent.setup() }
}
async function reason(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Lý do quyết định'), 'Đã kiểm tra')
}

describe('submission photo review', () => {
  it('fetches sanitised bytes with session auth/no-store and enlarges a blob, never a public URL', async () => {
    const requests: Request[] = []
    server.use(
      http.get(CONTENT, ({ request }) => {
        requests.push(request)
        return new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Type': 'image/webp' } })
      }),
    )
    const { user, unmount } = await open()
    setAccessToken('test-preview-token')
    // Retry a fresh mount to verify the bearer dev fallback as well as cookies.
    unmount()
    requests.length = 0
    const fresh = await open()
    const enlarge = await screen.findByRole('button', { name: 'Xem lớn ảnh 1' })
    await user.click(enlarge)
    const modal = screen.getByRole('dialog', { name: 'Ảnh đóng góp 1' })
    expect(within(modal).getByRole('img')).toHaveAttribute('src', expect.stringMatching(/^blob:/))
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.headers.get('Authorization')).toBe('Bearer test-preview-token')
      expect(request.headers.get('Accept')).toBe('image/webp')
      expect(request.credentials).toBe('include')
      expect(request.cache).toBe('no-store')
    }
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Kiểm duyệt đề xuất' })).toBeInTheDocument()
    fresh.unmount()
    await waitFor(() => expect(revokeUrl.mock.calls.length).toBe(createUrl.mock.calls.length))
  })

  it('sends every pending ID when all photos are kept', async () => {
    const { user } = await open()
    await reason(user)
    await user.click(screen.getByRole('button', { name: 'Duyệt' }))
    await waitFor(() =>
      expect(mockDb.decisions[0]).toMatchObject({
        approvedPhotoIds: photos.map((photo) => photo.id),
      }),
    )
  })

  it('allows read-only staff to preview but not select or decide', async () => {
    signInAs('ops_admin')
    renderWithProviders(<SubmissionReviewDrawer submissionId={ID} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: 'Xem lớn ảnh 1' })
    expect(screen.queryByRole('checkbox', { name: /Giữ ảnh/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
  })

  it('aborts an unfinished preview on close and creates no object URL afterwards', async () => {
    let signal: AbortSignal | undefined
    server.use(
      http.get(CONTENT, async ({ request }) => {
        signal = request.signal
        await delay(100)
        return new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Type': 'image/webp' } })
      }),
    )
    const { unmount } = await open()
    await waitFor(() => expect(signal).toBeDefined())
    unmount()
    expect(signal!.aborted).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('ignores an external photo URL and refuses non-WebP bytes', async () => {
    detail().photos = [{ ...photos[0], url: 'https://untrusted.example/original.jpg' }]
    server.use(
      http.get(
        CONTENT,
        () => new HttpResponse('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
      ),
    )
    await open()
    await screen.findByRole('button', { name: 'Thử lại' })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(createUrl).not.toHaveBeenCalled()
  })

  it.each(['approved', 'merged'] as const)('sends only kept IDs on %s', async (decision) => {
    const { keep, user } = await open()
    expect(keep).toBeChecked()
    await user.click(keep)
    await reason(user)
    if (decision === 'merged') {
      await user.type(screen.getByLabelText(/Tìm địa điểm để gộp vào/), 'Chào')
      await user.click(await screen.findByRole('button', { name: /Chào Bạn/ }))
    }
    await user.click(
      screen.getByRole('button', { name: decision === 'approved' ? 'Duyệt' : 'Gộp' }),
    )
    await waitFor(() => expect(mockDb.decisions).toHaveLength(1))
    expect(mockDb.decisions[0]).toMatchObject({ decision, approvedPhotoIds: [photos[1]!.id] })
    await waitFor(() => expect(revokeUrl).toHaveBeenCalled())
  })

  it('sends an explicit empty array to reject every photo', async () => {
    const { user, keep } = await open()
    await user.click(keep)
    await user.click(screen.getByRole('checkbox', { name: 'Giữ ảnh 2' }))
    await reason(user)
    await user.click(screen.getByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(mockDb.decisions[0]).toMatchObject({ approvedPhotoIds: [] }))
  })

  it('leaves rejection unchanged even with pending photos', async () => {
    const { user, keep } = await open()
    await user.click(keep)
    await user.selectOptions(screen.getByLabelText('Lý do từ chối'), 'other')
    await user.click(screen.getByRole('button', { name: 'Từ chối' }))
    await waitFor(() =>
      expect(mockDb.decisions[0]).toMatchObject({ decision: 'rejected', rejectionReason: 'other' }),
    )
    expect(mockDb.decisions[0]).not.toHaveProperty('approvedPhotoIds')
  })

  it('reloads on PHOTO_REVIEW_REQUIRED and includes new photos on retry', async () => {
    let calls = 0
    const bodies: unknown[] = []
    const added = { ...photos[0]!, id: 'a0000000-0000-4000-8000-000000000003' }
    server.use(
      http.post('/v1/cms/place-submissions/:id/decide', async ({ request }) => {
        bodies.push(await request.json())
        if (calls++ === 0) {
          detail().photos = [...photos, added]
          return HttpResponse.json(
            {
              code: 'PHOTO_REVIEW_REQUIRED',
              message: 'review photos',
              request_id: 'photo-review',
              retryable: false,
            },
            { status: 409 },
          )
        }
        return HttpResponse.json({ decided: true }, { status: 201 })
      }),
    )
    const { user, keep } = await open()
    await user.click(keep)
    await reason(user)
    await user.click(screen.getByRole('button', { name: 'Duyệt' }))
    expect(await screen.findByRole('checkbox', { name: 'Giữ ảnh 3' })).toBeChecked()
    expect(
      within(screen.getByRole('dialog', { name: 'Kiểm duyệt đề xuất' })).getByRole('alert'),
    ).toHaveTextContent('Cần kiểm duyệt ảnh')
    expect(screen.getByRole('checkbox', { name: 'Giữ ảnh 1' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Giữ ảnh 3' }))
    await user.click(screen.getByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toMatchObject({ approvedPhotoIds: photos.map((photo) => photo.id) })
  })

  it('resets choices and revokes previews when switching submissions', async () => {
    detail(OTHER).photos = [photos[1]]
    const { user, keep, rerender } = await open()
    await screen.findByRole('button', { name: 'Xem lớn ảnh 1' })
    await user.click(keep)
    rerender(<SubmissionReviewDrawer submissionId={OTHER} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Giữ ảnh 2' })).not.toBeInTheDocument(),
    )
    expect(await screen.findByRole('checkbox', { name: 'Giữ ảnh 1' })).toBeChecked()
    await waitFor(() => expect(revokeUrl).toHaveBeenCalled())
    rerender(<SubmissionReviewDrawer submissionId={ID} onClose={vi.fn()} />)
    expect(await screen.findByRole('checkbox', { name: 'Giữ ảnh 2' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Giữ ảnh 1' })).toBeChecked()
  })

  it.each([403, 404, 503, 0])(
    'renders preview failure %s without loading an original, with retry where permitted',
    async (status) => {
      detail().photos = [photos[0]]
      server.use(
        http.get(CONTENT, () =>
          status === 0
            ? HttpResponse.error()
            : HttpResponse.json(
                {
                  code: status === 403 ? 'FORBIDDEN' : 'PHOTO_UNAVAILABLE',
                  message: 'Unavailable',
                  request_id: 'test',
                  retryable: true,
                },
                { status },
              ),
        ),
      )
      const { user } = await open()
      await waitFor(() =>
        expect(screen.queryByText('Đang tải ảnh riêng tư…')).not.toBeInTheDocument(),
      )
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      if (status === 403) {
        expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
      } else {
        server.use(
          http.get(
            CONTENT,
            () =>
              new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Type': 'image/webp' } }),
          ),
        )
        await user.click(screen.getByRole('button', { name: 'Thử lại' }))
        await screen.findByRole('button', { name: 'Xem lớn ảnh 1' })
      }
    },
  )

  it('renders loading, handles image decode failure, and retries', async () => {
    detail().photos = [photos[0]]
    server.use(
      http.get(CONTENT, async () => {
        await delay(100)
        return new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Type': 'image/webp' } })
      }),
    )
    const { user } = await open()
    expect(screen.getByText('Đang tải ảnh riêng tư…')).toBeInTheDocument()
    fireEvent.error(await screen.findByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    await screen.findByRole('img')
  })

  it('shows no-photo and decided states without fetching private content', async () => {
    detail().photos = []
    const { rerender } = renderWithProviders(
      <SubmissionReviewDrawer submissionId={ID} onClose={vi.fn()} />,
    )
    expect(await screen.findByText('Không có ảnh đóng góp.')).toBeInTheDocument()
    detail(OTHER).status = 'approved'
    detail(OTHER).photos = [{ ...photos[0], status: 'approved', url: null }]
    rerender(<SubmissionReviewDrawer submissionId={OTHER} onClose={vi.fn()} />)
    expect(await screen.findByText('Ảnh đã được duyệt.')).toBeInTheDocument()
    expect(createUrl).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox', { name: /Giữ ảnh/ })).not.toBeInTheDocument()
  })

  it('warns before discarding photo choices', async () => {
    const { user, keep } = await open()
    await user.click(keep)
    await user.click(screen.getAllByRole('button', { name: 'Đóng' }).at(-1)!)
    expect(await screen.findByRole('dialog', { name: /chưa lưu/ })).toHaveTextContent(
      'Ảnh đóng góp',
    )
  })
})
