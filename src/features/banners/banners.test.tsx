import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsBanners } from '@/shared/test/fixtures'
import BannerListScreen from './bannerList.view'
import BannerDetailScreen from './bannerDetail.view'
import { checkDestination, isSafeExternalUrl, isValidWindow, toLocalInput } from './destination'

/** The fixture whose window has closed while a person left it published. */
const expired = cmsBanners.find((banner) => banner.id === 'bn-noel-cu')!
/** The fixture with no readable image URL — hosting is not configured. */
const noImageUrl = cmsBanners.find((banner) => banner.id === 'bn-cuoi-tuan')!
const heroes = cmsBanners.filter((banner) => banner.placement === 'home_hero').length

function Routed() {
  return (
    <Routes>
      <Route path="/banners" element={<BannerListScreen />} />
      <Route path="/banners/:id" element={<BannerDetailScreen />} />
    </Routes>
  )
}

describe('banner list (CMS-027)', () => {
  it('shows the filtered total, not the page length', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: '/banners' })

    await screen.findByRole('table')
    expect(
      screen.getByText(`Trang này ${cmsBanners.length} · tổng ${cmsBanners.length} khớp bộ lọc`),
    ).toBeInTheDocument()
  })

  it('pushes the placement filter to the server', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/banners' })

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Vị trí'), 'home_hero')
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`tổng ${heroes} khớp bộ lọc`))).toBeInTheDocument(),
    )
  })

  it('says a missing image URL in words rather than showing a broken image', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: '/banners' })

    const table = await screen.findByRole('table')
    const row = within(table).getByText(noImageUrl.name).closest('tr')!
    expect(within(row).getByText('Chưa có ảnh xem trước')).toBeInTheDocument()
    expect(within(row).queryByRole('img')).not.toBeInTheDocument()
  })

  it('refuses a banner with no image before sending it', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/banners' })

    await user.click(await screen.findByRole('button', { name: 'Tạo banner' }))
    const drawer = await screen.findByRole('dialog')
    await user.type(within(drawer).getByLabelText(/Tên banner/), 'Banner thử')
    await user.click(within(drawer).getByRole('button', { name: 'Tạo' }))

    expect(await within(drawer).findByText('Banner bắt buộc phải có ảnh.')).toBeInTheDocument()
  })

  it('uploads an image and keeps the server-issued key', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/banners' })

    await user.click(await screen.findByRole('button', { name: 'Tạo banner' }))
    const drawer = await screen.findByRole('dialog')
    const file = new File(['bytes'], 'hero.png', { type: 'image/png' })
    await user.upload(within(drawer).getByLabelText(/Ảnh banner/), file)

    // The key comes from the server; nothing the client supplied steers it.
    expect(await within(drawer).findByText(/^cms\/banner_image\//)).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Đổi ảnh' })).toBeInTheDocument()
  })

  it('offers no create control to a role that cannot manage banners', async () => {
    signInAs('moderator')
    renderWithProviders(<Routed />, { route: '/banners' })

    // A moderator reads banners by rank but writes nothing.
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Tạo banner' })).not.toBeInTheDocument()
  })
})

describe('banner detail (CMS-027)', () => {
  it('keeps the computed status apart from the one a person set', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/banners/${expired.id}` })

    expect(await screen.findByText('Trạng thái vòng đời')).toBeInTheDocument()
    // Lifecycle says published — a person set that. Effective says expired —
    // the clock did, and the server recomputes it on every read.
    expect(screen.getByText('Đang chạy')).toBeInTheDocument()
    expect(screen.getAllByText('Hết hạn').length).toBeGreaterThan(0)
    expect(screen.getByText(/qua thời điểm kết thúc/)).toBeInTheDocument()
  })

  it('never offers "expired" as something to set', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/banners/${expired.id}` })

    await screen.findByText('Trạng thái vòng đời')
    const lifecycle = screen.getByText('Trạng thái', { selector: 'h2' }).closest('div')!
    expect(within(lifecycle).queryByRole('button', { name: /Hết hạn/ })).not.toBeInTheDocument()
  })

  it('refuses an inverted window before sending it', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/banners/${expired.id}` })

    const starts = await screen.findByLabelText('Bắt đầu')
    await user.clear(starts)
    await user.type(starts, '2026-09-10T09:00')
    const ends = screen.getByLabelText('Kết thúc')
    await user.clear(ends)
    await user.type(ends, '2026-09-01T09:00')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(
      await screen.findByText('Thời điểm kết thúc phải sau thời điểm bắt đầu.'),
    ).toBeInTheDocument()
  })

  it('clears the destination value when the type changes', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/banners/${expired.id}` })

    const value = (await screen.findByLabelText('Điểm đến')) as HTMLInputElement
    expect(value.value).toBe(expired.destinationValue)
    // An id written for one type cannot resolve under another.
    await user.selectOptions(screen.getByLabelText('Loại điểm đến'), 'place')
    expect(value.value).toBe('')
  })
})

describe('destination and window rules', () => {
  it('accepts only an https URL with no credentials outside the network', () => {
    expect(isSafeExternalUrl('https://gogo.vn/noel')).toBe(true)
    expect(isSafeExternalUrl('http://gogo.vn/noel')).toBe(false)
    expect(isSafeExternalUrl('https://user:pass@gogo.vn')).toBe(false)
    expect(isSafeExternalUrl('https://localhost:3000')).toBe(false)
    expect(isSafeExternalUrl('https://10.0.0.5/admin')).toBe(false)
    expect(isSafeExternalUrl('https://cms.internal/ops')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })

  it('refuses a value where the type takes none, and none where it needs one', () => {
    expect(checkDestination('none', 'rec-1', ['none'])).toEqual({ ok: false, code: 'forbidden' })
    expect(checkDestination('place', '', ['none'])).toEqual({ ok: false, code: 'required' })
    expect(checkDestination('place', 'pl-1', ['none'])).toEqual({ ok: true })
  })

  it('treats an open-ended window as valid', () => {
    expect(isValidWindow('', '')).toBe(true)
    expect(isValidWindow('2026-09-01T09:00', '')).toBe(true)
    expect(isValidWindow('2026-09-10T09:00', '2026-09-01T09:00')).toBe(false)
  })

  it('renders an absent bound as empty, never as now', () => {
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput(undefined)).toBe('')
  })
})
