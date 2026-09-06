import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import type { CmsPlaceDetail } from '@/shared/api/contracts'
import PlaceEditorScreen from './placeEditor.view'
import { blockingFailures, buildChecklist, suggestionsUnmet } from './publishChecklist'

const PLACE = places.find((place) => place.id === 'pl-chao-ban')! as CmsPlaceDetail

function Routed() {
  return (
    <Routes>
      <Route path="/places/:id" element={<PlaceEditorScreen />} />
    </Routes>
  )
}

function open(detail: Partial<CmsPlaceDetail> = {}) {
  server.use(http.get('/v1/cms/places/:id', () => HttpResponse.json({ ...PLACE, ...detail })))
  return renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })
}

describe('buildChecklist (GoGo-CMS#127)', () => {
  it('marks only the two things the server actually enforces as required', () => {
    const items = buildChecklist({ place: PLACE, canTransition: true, target: 'published' })
    expect(items.filter((item) => item.kind === 'required').map((item) => item.id)).toEqual([
      'transition',
      'permission',
    ])
    // Everything else is advice. `transitionPlace` on GoGo-BE checks the
    // transition and the role and nothing else — inventing a field gate here
    // would be a publishing rule the product never agreed.
    expect(items.filter((item) => item.kind === 'suggested').length).toBeGreaterThan(5)
  })

  it('does not block on an unmet suggestion', () => {
    const items = buildChecklist({
      place: { ...PLACE, status: 'review', media: [], prices: [], hours: [], description: null },
      canTransition: true,
      target: 'published',
    })
    expect(suggestionsUnmet(items).length).toBeGreaterThan(0)
    expect(blockingFailures(items)).toEqual([])
  })

  it('treats a place that is already published as having nothing to transition', () => {
    // `PLACE_TRANSITIONS` has no self-edge, but "you cannot publish this" is
    // nonsense to say about a published place.
    const items = buildChecklist({ place: PLACE, canTransition: true, target: 'published' })
    expect(PLACE.status).toBe('published')
    expect(blockingFailures(items)).toEqual([])
  })

  it('blocks when the current status cannot reach published', () => {
    // `archived` is terminal — PLACE_TRANSITIONS has no exit from it.
    const items = buildChecklist({
      place: { ...PLACE, status: 'archived' },
      canTransition: true,
      target: 'published',
    })
    expect(blockingFailures(items).map((item) => item.id)).toEqual(['transition'])
  })

  it('blocks when the account cannot change status', () => {
    const items = buildChecklist({
      place: { ...PLACE, status: 'review' },
      canTransition: false,
      target: 'published',
    })
    expect(blockingFailures(items).map((item) => item.id)).toEqual(['permission'])
  })

  it('counts only approved photos — a pending upload is not published art', () => {
    const withPending = buildChecklist({
      place: {
        ...PLACE,
        media: [{ ...PLACE.media[0]!, moderation: 'pending' }],
      },
      canTransition: true,
      target: 'published',
    })
    expect(withPending.find((item) => item.id === 'photo')!.met).toBe(false)
  })

  it('treats a closed day as hours that are known', () => {
    // A day saying "closed" is data. A day with no row is not — the two are
    // different facts (GoGo-BE#425).
    const closed = buildChecklist({
      place: {
        ...PLACE,
        hours: [
          {
            dayOfWeek: 0,
            kind: 'closed',
            openMinute: 0,
            closeMinute: 0,
            isOvernight: false,
            source: 'editor',
            verifiedAt: null,
          },
        ],
      },
      canTransition: true,
      target: 'published',
    })
    expect(closed.find((item) => item.id === 'hours')!.met).toBe(true)

    const none = buildChecklist({
      place: { ...PLACE, hours: [] },
      canTransition: true,
      target: 'published',
    })
    expect(none.find((item) => item.id === 'hours')!.met).toBe(false)
  })
})

describe('the checklist on screen', () => {
  it('says in words that the suggestions do not block', async () => {
    signInAs('editor')
    open()
    await screen.findByText('Trước khi xuất bản')
    expect(
      screen.getByText(
        'Không chặn xuất bản. Đây là những thứ làm địa điểm dùng được, không phải luật.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Máy chủ chỉ chặn hai điều này. Không có trường nào khác bị bắt buộc trước khi xuất bản.',
      ),
    ).toBeInTheDocument()
  })

  it('never marks an item by colour alone', async () => {
    signInAs('editor')
    open({ description: null })
    const heading = await screen.findByText('Trước khi xuất bản')
    const card = within(heading.closest('section') as HTMLElement)
    // Each row carries a word as well as a tone.
    expect(card.getAllByText(/Đủ|Chưa có|Chưa đạt/).length).toBeGreaterThan(5)
  })

  /*
   * #138 — this assertion used to accept the bug it was meant to catch. The
   * summary joined the list labels, which are written affirmatively because
   * `Row` shows them beside ✓/○, so the sentence read "Chưa xuất bản được:
   * Trạng thái hiện tại cho phép chuyển sang Đã xuất bản" — cannot publish
   * because publishing is allowed. A reason has to be phrased as a failure.
   */
  it('names what is blocking, phrased as a failure', async () => {
    signInAs('editor')
    open({ status: 'archived' })
    await screen.findByText('Trước khi xuất bản')

    const blocked = await screen.findByText(/Chưa xuất bản được:/)
    expect(blocked).toHaveTextContent(
      'Chưa xuất bản được: trạng thái Lưu trữ không chuyển thẳng sang Đã xuất bản được',
    )
    // The affirmative label belongs to the row, never to the reason.
    expect(blocked).not.toHaveTextContent('cho phép')
  })

  it('phrases a missing permission as a failure too', async () => {
    // A moderator reads the editor and cannot transition, so `permission` is
    // the blocking item — the other half of the same bug.
    signInAs('moderator')
    open({ status: 'review' })
    await screen.findByText('Trước khi xuất bản')

    const blocked = await screen.findByText(/Chưa xuất bản được:/)
    expect(blocked).toHaveTextContent('tài khoản không có quyền chuyển trạng thái')
    // Not the row label, which says the opposite ("Tài khoản có quyền …").
    expect(blocked).not.toHaveTextContent('Tài khoản có quyền')
  })
})

describe('the location panel', () => {
  it('shows the coordinates and a real link out, not a map that failed to load', async () => {
    signInAs('editor')
    open({ lat: 10.7769, lng: 106.7009 })

    await screen.findByText('Toạ độ')
    expect(screen.getByText('10.776900, 106.700900')).toBeInTheDocument()

    const link = screen.getByRole('link', { name: /Google Maps/ })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=10.7769,106.7009',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))

    // Said outright, so nobody reads the panel as a broken embed.
    expect(screen.getByText(/không phải bản đồ nhúng/)).toBeInTheDocument()
  })

  it('says so plainly when there are no coordinates', async () => {
    signInAs('editor')
    open({ lat: null, lng: null })
    expect(await screen.findByText('Chưa có toạ độ cho địa điểm này.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Google Maps/ })).not.toBeInTheDocument()
  })

  it('copies the pair without throwing where the clipboard is unavailable', async () => {
    signInAs('editor')
    open({ lat: 10.7769, lng: 106.7009 })
    await screen.findByText('Toạ độ')
    const user = userEvent.setup()
    // jsdom has no clipboard permission; the handler must not reject into the
    // click, and the numbers stay selectable on screen either way.
    await user.click(screen.getByRole('button', { name: 'Chép toạ độ' }))
    expect(screen.getByText('10.776900, 106.700900')).toBeInTheDocument()
  })
})
