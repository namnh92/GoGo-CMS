import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import PlaceEditorScreen from './placeEditor.view'

const PLACE = places.find((place) => place.id === 'pl-chao-ban')!

/** Midday UTC, so the viewer-local date is the 28th in every test timezone. */
const FETCHED_AT = '2026-09-28T12:00:00.000Z'

/**
 * Through the editor screen and the real `fetchPlace` parse, not the badge in
 * isolation: a field the CMS's zod schema drops never reaches the component,
 * and that is the failure this test exists to catch.
 */
function open(providerStatus?: unknown) {
  const body: Record<string, unknown> = { ...PLACE }
  if (providerStatus !== undefined) body.providerStatus = providerStatus
  server.use(http.get('/v1/cms/places/:id', () => HttpResponse.json(body)))
  renderWithProviders(
    <Routes>
      <Route path="/places/:id" element={<PlaceEditorScreen />} />
    </Routes>,
    { route: `/places/${PLACE.id}` },
  )
}

/** The badge, found by its stated source (core rule 14). */
async function badge() {
  const text = await screen.findByText(/^Google báo:/)
  return text.closest('span') as HTMLElement
}

describe('place editor — provider status (GoGo-BE#360)', () => {
  it('says Google reports the place permanently closed, with the fetch date', async () => {
    signInAs('editor')
    open({ status: 'closed', fetchedAt: FETCHED_AT })

    const el = await badge()
    expect(el).toHaveTextContent('Google báo: Đã đóng cửa vĩnh viễn · cập nhật 28/9/2026')
    // More than colour: the alert glyph travels with the danger tone.
    expect(el.className).toContain('text-danger-ink')
    expect(el.querySelector('svg')).not.toBeNull()
  })

  it('says temporarily closed in the warning tone', async () => {
    signInAs('editor')
    open({ status: 'temporarily_closed', fetchedAt: FETCHED_AT })

    const el = await badge()
    expect(el).toHaveTextContent('Google báo: Tạm đóng cửa · cập nhật 28/9/2026')
    expect(el.className).toContain('text-amber-ink')
    expect(el.querySelector('svg')).not.toBeNull()
  })

  it('says moved in the warning tone', async () => {
    signInAs('editor')
    open({ status: 'moved', fetchedAt: FETCHED_AT })

    const el = await badge()
    expect(el).toHaveTextContent('Google báo: Đã chuyển địa điểm · cập nhật 28/9/2026')
    expect(el.className).toContain('text-amber-ink')
  })

  it('names a value the CMS does not know yet, in neutral, instead of guessing', async () => {
    signInAs('editor')
    // x-extensible-enum: the server may add a value before the CMS learns it,
    // and the editor must still open.
    open({ status: 'relocating_soon', fetchedAt: FETCHED_AT })

    const el = await badge()
    expect(el).toHaveTextContent(
      'Google báo: Trạng thái khác (relocating_soon) · cập nhật 28/9/2026',
    )
    expect(el.className).toContain('text-text-muted')
    expect(el.className).not.toMatch(/danger|amber|mint/)
  })

  it('shows no badge when no provider has reported', async () => {
    signInAs('editor')
    open()

    expect(await screen.findByRole('textbox', { name: /Tên/ })).toBeInTheDocument()
    expect(screen.queryByText(/^Google báo:/)).not.toBeInTheDocument()
  })
})
