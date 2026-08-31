import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsRecommendations } from '@/shared/test/fixtures'
import RecommendationListScreen from './recommendationList.view'
import RecommendationDetailScreen from './recommendationDetail.view'

const drafts = cmsRecommendations.filter((r) => r.status === 'draft').length
const published = cmsRecommendations.find((r) => r.status === 'published')!

function Routed() {
  return (
    <Routes>
      <Route path="/recommendations" element={<RecommendationListScreen />} />
      <Route path="/recommendations/:id" element={<RecommendationDetailScreen />} />
    </Routes>
  )
}

describe('recommendation list (CMS-025)', () => {
  it('shows the filtered total, not the page length', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: '/recommendations' })

    await screen.findByRole('table')
    expect(
      screen.getByText(`Trang này 25 · tổng ${cmsRecommendations.length} khớp bộ lọc`),
    ).toBeInTheDocument()
  })

  it('pushes the status filter to the server', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/recommendations' })

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'draft')
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`tổng ${drafts} khớp bộ lọc`))).toBeInTheDocument(),
    )
  })

  it('refuses a slug the server pattern would reject, before sending it', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/recommendations' })

    await user.click(await screen.findByRole('button', { name: 'Tạo gợi ý' }))
    const drawer = await screen.findByRole('dialog')
    await user.type(within(drawer).getByLabelText(/Tên nội bộ/), 'Cuối tuần')
    await user.type(within(drawer).getByLabelText(/Khoá nội bộ/), 'Không Hợp Lệ!')
    await user.type(within(drawer).getByLabelText(/Tiêu đề hiển thị/), 'Đi đâu')
    await user.click(within(drawer).getByRole('button', { name: 'Tạo' }))

    expect(await within(drawer).findByText(/Khoá chỉ gồm chữ thường/)).toBeInTheDocument()
  })

  it('offers no create control to a role that cannot manage content', async () => {
    // `moderator` is rank 1 and content asks for editor/ops — read passes on
    // rank, write does not.
    signInAs('moderator')
    renderWithProviders(<Routed />, { route: '/recommendations' })

    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Tạo gợi ý' })).not.toBeInTheDocument()
  })
})

describe('recommendation detail (CMS-025)', () => {
  it('renders the ordered places with their stored position', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/recommendations/${published.id}` })

    expect(await screen.findByText('Chào Bạn Cafe & Space')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('flags a place that is not published inside a published recommendation', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/recommendations/${published.id}` })

    // The contract returns the place's catalog status precisely so this is
    // visible rather than a silently shorter list.
    expect(await screen.findByText(/đang ở trạng thái/)).toBeInTheDocument()
  })

  it('reorders by replacing the whole list, which is the only shape the API has', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/recommendations/${published.id}` })

    await screen.findByText('Chào Bạn Cafe & Space')
    await user.click(screen.getByRole('button', { name: /Đưa Phở Bát Đàn lên trên/ }))

    expect(await screen.findByText('Đã lưu danh sách địa điểm.')).toBeInTheDocument()
  })

  it('offers only the transitions the server declares', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/recommendations/${published.id}` })

    await screen.findByText('Vòng đời')
    // From `published`: back to draft, or archive. Never "schedule".
    expect(screen.getByRole('button', { name: 'Chuyển về nháp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lên lịch' })).not.toBeInTheDocument()
  })

  it('treats archived as terminal', async () => {
    const archived = cmsRecommendations.find((r) => r.status === 'archived')!
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/recommendations/${archived.id}` })

    expect(await screen.findByText(/Đã lưu trữ — nội dung nghỉ hưu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xuất bản' })).not.toBeInTheDocument()
  })

  it('surfaces the server refusal when publishing an empty recommendation', async () => {
    const draft = cmsRecommendations.find((r) => r.status === 'draft' && r.places.length === 0)!
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/recommendations/${draft.id}` })

    await screen.findByText('Vòng đời')
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))

    // The console does not pre-empt the rule; the server owns it and says so.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('keeps the slug read-only after creation', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/recommendations/${published.id}` })

    const slug = await screen.findByLabelText(/Khoá nội bộ/)
    expect(slug).toBeDisabled()
  })

  it('disables every write for a role that may only read', async () => {
    signInAs('moderator')
    renderWithProviders(<Routed />, { route: `/recommendations/${published.id}` })

    await screen.findByText('Chào Bạn Cafe & Space')
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
  })
})
