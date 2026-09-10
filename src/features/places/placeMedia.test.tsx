import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQuery } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { resetMockDb } from '@/shared/test/handlers'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import { queryKeys } from '@/shared/api/queryKeys'
import { authorizeUpload } from '@/features/media/api'
import { updatePlaceMedia } from './api'
import { fetchPlace } from './api'
import { PlaceMediaCard } from './placeMedia.view'

const PLACE = places.find((place) => place.id === 'pl-chao-ban')!
const COVER_KEY = PLACE.media[0]!.storageKey
const PENDING_KEY = PLACE.media[1]!.storageKey
/** The row whose `url` is null — media hosting is not configured for it. */
const NO_URL_KEY = PLACE.media[2]!.storageKey

/**
 * The card reads `media` from the place detail query, so the harness owns that
 * query: a test can then see the list actually change after a mutation
 * invalidates it, rather than a prop the test itself re-passed.
 */
function Harness({ canWrite = true }: { canWrite?: boolean }) {
  const query = useQuery({
    queryKey: queryKeys.places.detail(PLACE.id),
    queryFn: ({ signal }) => fetchPlace(PLACE.id, signal),
  })
  if (!query.data) return null
  return <PlaceMediaCard placeId={PLACE.id} media={query.data.media} canWrite={canWrite} />
}

function open(canWrite = true) {
  return renderWithProviders(<Harness canWrite={canWrite} />)
}

/** The card renders nothing until the place query answers. */
function ready() {
  return screen.findByTitle(COVER_KEY)
}

function jpeg(name: string, body = 'ok') {
  return new File([body], name, { type: 'image/jpeg' })
}

/** The `<li>` a photo occupies, found by the one string unique to it. */
function rowFor(key: string) {
  const label = screen.getByTitle(key)
  return within(label.closest('li') as HTMLElement)
}

async function chooseFiles(user: ReturnType<typeof userEvent.setup>, files: File[]) {
  const input = await screen.findByLabelText('Chọn ảnh từ máy')
  await user.upload(input, files)
}

/** `POST /cms/uploads`, answering with a key the test chooses. */
function uploadsReturning(key: string) {
  return http.post('/v1/cms/uploads', () =>
    HttpResponse.json(
      {
        id: 'up-forced',
        key,
        uploadUrl: 'https://storage.gogo.test/put/forced',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        maxBytes: 10 * 1024 * 1024,
        contentType: 'image/jpeg',
        readUrl: null,
      },
      { status: 201 },
    ),
  )
}

beforeEach(() => {
  // Attaching, reordering and detaching all write to the mock catalogue, and
  // `resetHandlers` restores handlers rather than what they wrote.
  resetMockDb()
  signInAs('editor')
})

describe('place media — upload queue (CMS-046)', () => {
  it('keeps the photos that uploaded when one of them fails', async () => {
    server.use(
      // The presigner numbers keys in arrival order, so the second file is the
      // one whose PUT is refused — a storage failure, after the authorization
      // it shares with the other two succeeded.
      http.put('https://storage.gogo.test/put/up-2', () => new HttpResponse(null, { status: 500 })),
      http.put('https://storage.gogo.test/put/*', () => new HttpResponse(null, { status: 200 })),
    )
    const user = userEvent.setup()
    open()
    await ready()

    await chooseFiles(user, [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')])

    // The explicit acceptance criterion: one failure loses nothing else.
    await waitFor(() => expect(screen.getAllByText('Đã thêm vào địa điểm')).toHaveLength(2))
    const failed = screen.getByTitle('b.jpg').closest('li') as HTMLElement
    expect(within(failed).getByText('Không thêm được')).toBeInTheDocument()
    expect(within(failed).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()

    // And the two that worked are on the place, not merely green in the queue.
    await waitFor(() =>
      expect(screen.getAllByTitle(/^cms\/place_image\/adm-mock\//)).toHaveLength(2),
    )
  })

  it('accepts photos dropped on the card, not only ones chosen from a dialog', async () => {
    open()
    await ready()

    const zone = screen.getByText('Kéo thả ảnh vào đây').closest('div') as HTMLElement
    fireEvent.drop(zone, { dataTransfer: { files: [jpeg('dropped.jpg')] } })

    expect(await screen.findByText('Đã thêm vào địa điểm')).toBeInTheDocument()
  })

  it('retries only the file that failed', async () => {
    let fail = true
    server.use(
      http.put('https://storage.gogo.test/put/*', () =>
        fail ? new HttpResponse(null, { status: 500 }) : new HttpResponse(null, { status: 200 }),
      ),
    )
    const user = userEvent.setup()
    open()
    await ready()

    await chooseFiles(user, [jpeg('only.jpg')])
    const row = screen.getByTitle('only.jpg').closest('li') as HTMLElement
    await within(row).findByText('Không thêm được')

    fail = false
    await user.click(within(row).getByRole('button', { name: 'Thử lại' }))

    expect(await within(row).findByText('Đã thêm vào địa điểm')).toBeInTheDocument()
  })

  it('refuses an oversized file before asking for an upload URL', async () => {
    let authorizeCalls = 0
    server.use(
      http.post('/v1/cms/uploads', () => {
        authorizeCalls += 1
        return HttpResponse.json({ code: 'X', message: 'x' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    open()

    const big = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })
    await chooseFiles(user, [big])

    expect(await screen.findByText(/vượt quá/)).toBeInTheDocument()
    // The size is declared up front, so an oversized file is refused before a
    // URL exists — checking it here costs no round-trip at all.
    expect(authorizeCalls).toBe(0)
  })

  it('refuses a content type the presigner will not sign for', async () => {
    open()
    await ready()

    // Dropped, because `accept=` filters the file dialog and a drop is exactly
    // the path where a PDF can still arrive.
    const zone = screen.getByText('Kéo thả ảnh vào đây').closest('div') as HTMLElement
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] },
    })

    expect(
      await screen.findByText('Định dạng ảnh không được hỗ trợ. Dùng JPEG, PNG, WebP hoặc HEIC.'),
    ).toBeInTheDocument()
  })

  it('surfaces an unusable upload key without inventing a reason', async () => {
    server.use(uploadsReturning('cms/place_image/somebody-else/never-issued'))
    const user = userEvent.setup()
    open()

    await chooseFiles(user, [jpeg('foreign.jpg')])

    // Unknown, expired, foreign and wrong-purpose are one answer on the wire.
    expect(await screen.findByText(/khoá tải lên không phải của bạn/)).toBeInTheDocument()
  })

  it('says so when the same photo is already on the place', async () => {
    server.use(uploadsReturning(COVER_KEY))
    const user = userEvent.setup()
    open()

    await chooseFiles(user, [jpeg('again.jpg')])

    expect(await screen.findByText('Ảnh này đã có trên địa điểm.')).toBeInTheDocument()
  })
})

describe('place media — the list (CMS-046)', () => {
  it('shows every photo with its state, source and attribution', async () => {
    open()
    await ready()

    const cover = rowFor(COVER_KEY)
    expect(cover.getByText('Đã duyệt')).toBeInTheDocument()
    expect(cover.getByText('Ảnh bìa')).toBeInTheDocument()
    expect(cover.getByText('Biên tập')).toBeInTheDocument()

    // FR-INGEST-014: a provider photo carries its terms wherever it appears.
    const provider = rowFor(NO_URL_KEY)
    expect(provider.getByText('Nhà cung cấp')).toBeInTheDocument()
    expect(provider.getByText('Ảnh © Google Maps contributor')).toBeInTheDocument()
    expect(await screen.findByText(/luôn ở trạng thái chờ duyệt/)).toBeInTheDocument()
  })

  it('renders a missing storage URL as an absence and will not moderate it', async () => {
    open()
    await ready()

    const row = rowFor(NO_URL_KEY)
    expect(row.getByText('Chưa có kho ảnh')).toBeInTheDocument()
    expect(row.getByText(/Chưa cấu hình lưu trữ ảnh ở môi trường này/)).toBeInTheDocument()
    // Deciding on a photo nobody can see is not moderation — so the control
    // says why instead of looking operable.
    const moderate = row.getByRole('button', { name: 'Kiểm duyệt' })
    expect(moderate).toBeDisabled()
    expect(moderate).toHaveAttribute(
      'title',
      expect.stringContaining('Chưa cấu hình lưu trữ ảnh ở môi trường này'),
    )
    // The row is still there to be read; only the decision is withheld.
    expect(row.getByText('Chờ duyệt')).toBeInTheDocument()
  })

  /*
   * A URL the server composed is not proof the object is there. On DEV,
   * catalogue media is written to the private bucket while the public host
   * serves another, so every one of these URLs resolves and 404s. A broken
   * image glyph would leave an editor unable to tell that apart from "no
   * photo" — so the row says which it is.
   */
  it('states an unloadable thumbnail instead of leaving a broken image', async () => {
    open()
    await ready()

    const row = rowFor(COVER_KEY)
    const image = row.getByRole('img')
    expect(image).toBeInTheDocument()

    fireEvent.error(image)

    expect(await screen.findByText('Không tải được ảnh')).toBeInTheDocument()
    expect(row.queryByRole('img')).not.toBeInTheDocument()
    // A failed load is not the same fact as no hosting at all.
    expect(row.queryByText('Chưa có kho ảnh')).not.toBeInTheDocument()
  })

  it('keeps a null URL reading as no hosting, not as a failed load', async () => {
    open()
    await ready()

    const row = rowFor(NO_URL_KEY)
    expect(row.getByText('Chưa có kho ảnh')).toBeInTheDocument()
    expect(row.queryByText('Không tải được ảnh')).not.toBeInTheDocument()
  })

  it('lets a role without place.write read the list and nothing else', async () => {
    open(false)
    await ready()

    expect(await screen.findByText(/Vai trò của bạn xem được danh sách ảnh/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Chọn ảnh từ máy')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kiểm duyệt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gỡ khỏi địa điểm' })).not.toBeInTheDocument()
    // Read-only is not blank: the photos and their states still render.
    expect(screen.getByTitle(COVER_KEY)).toBeInTheDocument()
  })
})

describe('place media — editorial decisions (CMS-046)', () => {
  it('moves a photo with the keyboard, not only with a mouse', async () => {
    const user = userEvent.setup()
    open()
    await ready()

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]!).getByTitle(COVER_KEY)).toBeInTheDocument()

    // Buttons, so the reorder is operable from the keyboard by construction.
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Đưa ảnh thứ 2 lên trước' }))

    await waitFor(() => {
      const after = screen.getAllByRole('listitem')
      expect(within(after[0]!).getByTitle(PENDING_KEY)).toBeInTheDocument()
    })
  })

  it('moves the cover to another photo, one per place', async () => {
    const user = userEvent.setup()
    open()
    await ready()

    await user.click(rowFor(PENDING_KEY).getByRole('button', { name: 'Đặt làm ảnh bìa' }))

    await waitFor(() => expect(rowFor(PENDING_KEY).getByText('Ảnh bìa')).toBeInTheDocument())
    expect(rowFor(COVER_KEY).queryByText('Ảnh bìa')).not.toBeInTheDocument()
  })

  it('records a moderation decision with its reason, and rejecting clears the cover', async () => {
    const user = userEvent.setup()
    open()
    await ready()

    await user.click(rowFor(COVER_KEY).getByRole('button', { name: 'Kiểm duyệt' }))
    const dialog = await screen.findByRole('dialog')

    // It opens on the state the photo is already in — never on a suggestion —
    // so nothing can be recorded until a decision is chosen and explained.
    expect(within(dialog).getByLabelText('Quyết định')).toHaveValue('approved')
    expect(within(dialog).getByText(/trùng trạng thái hiện tại/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Ghi quyết định' })).toBeDisabled()
    await user.selectOptions(within(dialog).getByLabelText('Quyết định'), 'rejected')
    expect(within(dialog).getByText(/sẽ bỏ luôn vai trò ảnh bìa/)).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Lý do/), 'Ảnh mờ, lộ mặt khách')
    await user.click(within(dialog).getByRole('button', { name: 'Ghi quyết định' }))

    await waitFor(() => expect(rowFor(COVER_KEY).getByText('Đã từ chối')).toBeInTheDocument())
    expect(rowFor(COVER_KEY).getByText('Ảnh mờ, lộ mặt khách')).toBeInTheDocument()
    // The server clears `isCover` on a rejection; the console reflects it.
    expect(rowFor(COVER_KEY).queryByText('Ảnh bìa')).not.toBeInTheDocument()
  })

  it('puts the server’s reason rejection under the reason box, not only in a toast', async () => {
    server.use(
      http.patch('/v1/cms/places/:placeId/media/:mediaId', () =>
        HttpResponse.json(
          {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
            field_errors: [
              {
                field: 'moderationReason',
                code: 'required',
                message: 'Quyết định kiểm duyệt phải có lý do',
              },
            ],
            request_id: 'req-media-1',
            retryable: false,
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    open()
    await ready()

    await user.click(rowFor(PENDING_KEY).getByRole('button', { name: 'Kiểm duyệt' }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Quyết định'), 'approved')
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Đã kiểm tra')
    await user.click(within(dialog).getByRole('button', { name: 'Ghi quyết định' }))

    expect(
      await within(dialog).findByText('Quyết định kiểm duyệt phải có lý do.'),
    ).toBeInTheDocument()
  })

  it('saves a caption and the attribution that travels with the photo', async () => {
    const user = userEvent.setup()
    open()
    await ready()

    await user.click(rowFor(PENDING_KEY).getByRole('button', { name: 'Chú thích & nguồn' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Chú thích'), 'Quầy pha chế')
    await user.type(within(dialog).getByLabelText(/Nguồn/), 'Ảnh © GoGo')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(rowFor(PENDING_KEY).getByText('Quầy pha chế')).toBeInTheDocument())
    expect(rowFor(PENDING_KEY).getByText('Ảnh © GoGo')).toBeInTheDocument()
  })

  it('confirms a detach as a detach, never as a delete', async () => {
    const user = userEvent.setup()
    open()
    await ready()

    await user.click(rowFor(PENDING_KEY).getByRole('button', { name: 'Gỡ khỏi địa điểm' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('Gỡ ảnh khỏi địa điểm')).toBeInTheDocument()
    expect(within(dialog).getByText(/Gỡ chứ không xoá/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Vẫn được giữ lại và có thể gắn lại sau/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Gỡ khỏi địa điểm' }))

    await waitFor(() => expect(screen.queryByTitle(PENDING_KEY)).not.toBeInTheDocument())
    expect(screen.getByTitle(COVER_KEY)).toBeInTheDocument()
  })
})

describe('place media — picking an existing GoGo upload (CMS-046)', () => {
  it('says whose photos the list is, when there are none', async () => {
    const user = userEvent.setup()
    open()
    await ready()

    await user.click(await screen.findByRole('button', { name: 'Chọn từ ảnh GoGo' }))

    expect(await screen.findByText('Bạn chưa có ảnh nào chờ gắn')).toBeInTheDocument()
    // Consumer check-in photos are never in here, and the empty state says it.
    expect(screen.getByText(/chỉ gồm ảnh do chính tài khoản này tải lên/)).toBeInTheDocument()
  })

  it('attaches an upload this actor already authorized', async () => {
    const authorized = await authorizeUpload({
      purpose: 'place_image',
      contentType: 'image/jpeg',
      contentLength: 2048,
    })
    const user = userEvent.setup()
    open()
    await ready()

    await user.click(await screen.findByRole('button', { name: 'Chọn từ ảnh GoGo' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByText(authorized.key))

    await waitFor(() => expect(screen.getByTitle(authorized.key)).toBeInTheDocument())
    // Pending, always: uploading is not deciding it may be published.
    expect(rowFor(authorized.key).getByText('Chờ duyệt')).toBeInTheDocument()
  })
})

describe('place media — the mock enforces what GoGo-BE enforces', () => {
  it('refuses a moderation decision that carries no reason', async () => {
    const media = PLACE.media[1]!
    await expect(
      updatePlaceMedia(PLACE.id, media.id, { moderation: 'approved' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fieldErrors: [expect.objectContaining({ field: 'moderationReason' })],
    })
  })

  it('accepts a reorder that touches no decision', async () => {
    const media = PLACE.media[1]!
    await expect(updatePlaceMedia(PLACE.id, media.id, { sortOrder: 5 })).resolves.toMatchObject({
      sortOrder: 5,
      moderation: 'pending',
    })
  })
})
