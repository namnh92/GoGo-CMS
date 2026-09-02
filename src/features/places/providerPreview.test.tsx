import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import PlaceEditorScreen from './placeEditor.view'

/**
 * GoGo-BE#341 / CMS#98 — "Xem dữ liệu Google hiện tại".
 *
 * The property under test is the boundary: Google's answer is shown beside
 * GoGo's, labelled as ephemeral, and nothing in the place changes because of
 * it. Plus the `screen × role` matrix the quality gates require — an action
 * the API would refuse must not look operable.
 */

function renderEditor(placeId: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/places/:id" element={<PlaceEditorScreen />} />
    </Routes>,
    { route: `/places/${placeId}` },
  )
}

describe('provider preview (GoGo-BE#341)', () => {
  it('shows the recorded liveness state of the Google identity', async () => {
    signInAs('editor')
    renderEditor('pl-chao-ban')

    await screen.findByText('ChIJ_chao_ban_cafe')
    expect(screen.getByText('Hoạt động')).toBeInTheDocument()
    expect(screen.getByText('Kiểm tra kế tiếp')).toBeInTheDocument()
  })

  it('renders Google beside GoGo, says it is not saved, and leaves the place alone', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    renderEditor('pl-chao-ban')

    const open = await screen.findByRole('button', { name: 'Xem dữ liệu Google hiện tại' })
    expect(open).toBeEnabled()
    await user.click(open)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Chọn mức dữ liệu/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Lấy dữ liệu từ Google' }))

    // Google's name, GoGo's name, and the difference flagged.
    expect(await within(dialog).findByText('Chào Bạn Cafe & Space (Google)')).toBeInTheDocument()
    expect(within(dialog).getByRole('cell', { name: 'Chào Bạn Cafe & Space' })).toBeInTheDocument()
    expect(within(dialog).getAllByText('khác').length).toBeGreaterThan(0)
    // Attribution at the presentation boundary, and the ephemeral notice.
    expect(within(dialog).getByText(/Nguồn: Google Maps/)).toBeInTheDocument()
    expect(within(dialog).getByText(/không được lưu vào GoGo/)).toBeInTheDocument()
    // Core tier: rating is "not fetched", never a zero.
    expect(within(dialog).getAllByText('không lấy ở mức này').length).toBeGreaterThan(0)

    // Closing discards; the editor's own fields never picked the value up.
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText(/Tên hiển thị/)).toHaveValue('Chào Bạn Cafe & Space')
  })

  it('fetches the quality tier when asked, and shows the rating it bought', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    renderEditor('pl-chao-ban')

    await user.click(await screen.findByRole('button', { name: 'Xem dữ liệu Google hiện tại' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /Đầy đủ/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Lấy dữ liệu từ Google' }))

    expect(
      await within(dialog).findByText(/4\.5 · 1\.320 lượt|4\.5 · 1,320 lượt/),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('không lấy ở mức này')).not.toBeInTheDocument()
  })

  it('treats "Google has no such place" as an answer, not an error', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    renderEditor('pl-pho-bat-dan')

    await user.click(await screen.findByRole('button', { name: 'Xem dữ liệu Google hiện tại' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Lấy dữ liệu từ Google' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent(/Google không còn địa điểm/)
    expect(within(dialog).getByText(/không được lưu vào GoGo/)).toBeInTheDocument()
  })

  it('is not operable for a moderator — the API refuses, so the button does too', async () => {
    signInAs('moderator')
    renderEditor('pl-chao-ban')

    await screen.findByText('ChIJ_chao_ban_cafe')
    expect(screen.getByRole('button', { name: 'Xem dữ liệu Google hiện tại' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Yêu cầu kiểm tra lại ID Google' })).toBeDisabled()
  })

  it('is not offered on a place without a Google identity', async () => {
    signInAs('editor')
    renderEditor('pl-tay-ho-sup')

    await screen.findByLabelText(/Tên hiển thị/)
    expect(screen.getByRole('button', { name: 'Xem dữ liệu Google hiện tại' })).toBeDisabled()
  })
})

describe('refresh request (GoGo-BE#341)', () => {
  it('states what changes, queues the check, and calls no provider', async () => {
    const user = userEvent.setup()
    signInAs('editor')
    renderEditor('pl-chao-ban')

    await user.click(await screen.findByRole('button', { name: 'Yêu cầu kiểm tra lại ID Google' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Lượt kiểm tra kế tiếp')
    expect(dialog).toHaveTextContent('ngay lần chạy tới')
    expect(dialog).toHaveTextContent(/Không gọi Google ngay/)

    await user.click(within(dialog).getByRole('button', { name: 'Đưa vào hàng đợi' }))
    expect(await screen.findByText('Đã đưa vào hàng đợi kiểm tra ID')).toBeInTheDocument()
  })
})
