import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import type { CmsPlaceDetail } from '@/shared/api/contracts'
import PlaceEditorScreen from './placeEditor.view'
import { compareIdentity, readGoogleLink } from './googleLink'

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

describe('readGoogleLink (GoGo-CMS#126)', () => {
  it.each([
    'https://www.google.com/maps/place/?q=place_id:ChIJ_x&place_id=ChIJ_chao_ban_cafe',
    'https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJ_chao_ban_cafe',
    'https://maps.google.com/?placeid=ChIJ_chao_ban_cafe',
  ])('reads the Place ID out of %s', (url) => {
    const reading = readGoogleLink(url)
    expect(reading).toMatchObject({ kind: 'place_id', placeId: 'ChIJ_chao_ban_cafe' })
  })

  it('reports a short link as a short link rather than guessing', () => {
    // Expanding it needs an SSRF-safe redirect hop on the server, and no CMS
    // route exposes `identifyUrl`. Guessing would invent an identity.
    expect(readGoogleLink('https://maps.app.goo.gl/abc123')).toMatchObject({ kind: 'short_link' })
    expect(readGoogleLink('https://goo.gl/maps/abc123')).toMatchObject({ kind: 'short_link' })
  })

  it('pulls a name out of a /maps/place/ path', () => {
    expect(
      readGoogleLink(
        'https://www.google.com/maps/place/Ch%C3%A0o+B%E1%BA%A1n+Cafe/@10.77,106.70,17z',
      ),
    ).toMatchObject({ kind: 'hints', query: 'Chào Bạn Cafe', lat: 10.77, lng: 106.7 })
  })

  it('reads a coordinate pair given as the query', () => {
    expect(readGoogleLink('https://www.google.com/maps?q=10.7769,106.7009')).toMatchObject({
      kind: 'hints',
      lat: 10.7769,
      lng: 106.7009,
    })
  })

  it.each([
    ['https://maps.evil.tld/place/x', 'maps.evil.tld'],
    // A subdomain spoof must not pass the allowlist.
    ['https://www.google.com.evil.tld/maps', 'www.google.com.evil.tld'],
  ])('refuses %s as a foreign host', (url, host) => {
    expect(readGoogleLink(url)).toEqual({ kind: 'foreign_host', host })
  })

  it.each(['not a url', 'javascript:alert(1)', 'ftp://google.com/maps'])('rejects %j', (raw) => {
    expect(readGoogleLink(raw).kind).toBe('invalid')
  })

  it('says nothing about an empty box', () => {
    expect(readGoogleLink('   ')).toEqual({ kind: 'empty' })
  })
})

describe('compareIdentity', () => {
  const pasted = readGoogleLink('https://www.google.com/maps?place_id=ChIJ_chao_ban_cafe')

  it('matches an identical stored id', () => {
    expect(compareIdentity(pasted, 'ChIJ_chao_ban_cafe')).toEqual({ kind: 'same' })
  })

  it('reports a different stored id with both values', () => {
    expect(compareIdentity(pasted, 'ChIJ_other')).toEqual({
      kind: 'different',
      stored: 'ChIJ_other',
      pasted: 'ChIJ_chao_ban_cafe',
    })
  })

  it('reports a place that holds no identity', () => {
    expect(compareIdentity(pasted, null)).toEqual({
      kind: 'place_has_none',
      pasted: 'ChIJ_chao_ban_cafe',
    })
  })

  it('declines to compare when the link carries no id', () => {
    // A name or a coordinate is not an identity, and treating it as one would
    // be the console resolving a link it cannot resolve.
    expect(compareIdentity(readGoogleLink('https://maps.app.goo.gl/x'), 'ChIJ_x')).toEqual({
      kind: 'unknown',
    })
  })
})

describe('the Google link panel on screen', () => {
  it('compares a pasted id against the identity the place holds', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open()

    const field = await screen.findByLabelText('Dán link Google Maps')
    const stored = PLACE.sources.find(
      (source) => source.provider === 'google' || source.provider === 'google_places',
    )!
    await user.type(field, `https://www.google.com/maps?place_id=${stored.externalId}`)

    expect(await screen.findByText('Trùng với Place ID địa điểm đang lưu')).toBeInTheDocument()
  })

  it('shows both ids when the pasted link names a different place', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open()

    const field = await screen.findByLabelText('Dán link Google Maps')
    await user.type(field, 'https://www.google.com/maps?place_id=ChIJ_somewhere_else')

    expect(await screen.findByText('Khác với Place ID địa điểm đang lưu')).toBeInTheDocument()
    expect(screen.getByText('ChIJ_somewhere_else')).toBeInTheDocument()
  })

  it('says a short link needs the server, and offers no button that would 404', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open()

    const field = await screen.findByLabelText('Dán link Google Maps')
    await user.type(field, 'https://maps.app.goo.gl/abc123')

    expect(await screen.findByText('Link rút gọn')).toBeInTheDocument()
    expect(screen.getByText(/chưa có endpoint CMS nào làm việc đó/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mở link|Phân giải/ })).not.toBeInTheDocument()
  })

  it('renders the field comparison as unavailable with the reason, not as a dead button', async () => {
    signInAs('editor')
    open()

    await screen.findByText('Liên kết Google Maps')
    expect(screen.getByText('So sánh từng trường với Google: chưa mở')).toBeInTheDocument()
    expect(screen.getByText(/PR8 đã huỷ và đang chờ quyết định chính sách/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Theo dõi ở GoGo-BE#341' })).toHaveAttribute(
      'href',
      'https://github.com/namnh92/GoGo-BE/issues/341',
    )
    // Nothing that looks operable but is not (`core.md` §16).
    expect(screen.queryByRole('button', { name: /So sánh/ })).not.toBeInTheDocument()
  })

  it('says the place holds no identity when it has no Google source', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    open({ sources: [] })

    const field = await screen.findByLabelText('Dán link Google Maps')
    await user.type(field, 'https://www.google.com/maps?place_id=ChIJ_new_place')

    expect(await screen.findByText('Địa điểm này chưa gắn Place ID nào')).toBeInTheDocument()
    expect(screen.getByText(/Gắn hoặc đổi Place ID không làm được từ màn này/)).toBeInTheDocument()
  })
})
