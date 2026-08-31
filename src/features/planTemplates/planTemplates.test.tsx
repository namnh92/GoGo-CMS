import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsPlanTemplates } from '@/shared/test/fixtures'
import PlanTemplateListScreen from './planTemplateList.view'
import PlanTemplateDetailScreen from './planTemplateDetail.view'

const published = cmsPlanTemplates.find((tpl) => tpl.status === 'published')!
const draft = cmsPlanTemplates.find((tpl) => tpl.status === 'draft' && tpl.stops.length === 0)!
const archived = cmsPlanTemplates.find((tpl) => tpl.status === 'archived')!

function Routed() {
  return (
    <Routes>
      <Route path="/plan-templates" element={<PlanTemplateListScreen />} />
      <Route path="/plan-templates/:id" element={<PlanTemplateDetailScreen />} />
    </Routes>
  )
}

describe('plan template list (CMS-026)', () => {
  it('shows the filtered total from the server', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: '/plan-templates' })

    await screen.findByRole('table')
    expect(
      screen.getByText(`Trang này 25 · tổng ${cmsPlanTemplates.length} khớp bộ lọc`),
    ).toBeInTheDocument()
  })

  it('says templates are not live plans', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: '/plan-templates' })

    expect(await screen.findByText(/không phải lịch trình đang chạy/)).toBeInTheDocument()
  })

  it('renders a budget with its currency and scope, never a bare number', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: '/plan-templates' })

    await screen.findByRole('table')
    // Minor units formatted at the display layer; scope spelled out.
    expect(screen.getAllByText(/cả nhóm|mỗi người/).length).toBeGreaterThan(0)
  })

  it('offers no create control without write permission', async () => {
    signInAs('moderator')
    renderWithProviders(<Routed />, { route: '/plan-templates' })

    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Tạo mẫu' })).not.toBeInTheDocument()
  })
})

describe('plan template detail (CMS-026)', () => {
  it('renders stops in their stored order with the optional flag', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/plan-templates/${published.id}` })

    await screen.findByText('Điểm dừng')
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // The second stop is optional — a property of the stop, not a convention.
    expect(screen.getAllByRole('switch', { name: 'Không bắt buộc' })).toHaveLength(2)
  })

  it('shows a stop with no preferred place as an open choice', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/plan-templates/${published.id}` })

    expect(await screen.findByText(/Chưa chọn địa điểm cụ thể/)).toBeInTheDocument()
  })

  it('reorders stops by replacing the whole list', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/plan-templates/${published.id}` })

    await screen.findByText('Điểm dừng')
    await user.click(screen.getByRole('button', { name: /Đưa điểm dừng 2 lên trên/ }))

    expect(await screen.findByText('Đã lưu danh sách điểm dừng.')).toBeInTheDocument()
  })

  it('offers only the transitions the server declares', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/plan-templates/${published.id}` })

    await screen.findByText('Vòng đời')
    expect(screen.getByRole('button', { name: 'Chuyển về nháp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument()
  })

  it('treats archived as terminal', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/plan-templates/${archived.id}` })

    expect(await screen.findByText(/Đã lưu trữ — mẫu nghỉ hưu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xuất bản' })).not.toBeInTheDocument()
  })

  it("surfaces the server's refusal to publish a template with no stops", async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/plan-templates/${draft.id}` })

    await screen.findByText('Vòng đời')
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('adds a stop using a real category taxonomy', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: `/plan-templates/${draft.id}` })

    await screen.findByText(/Chưa có điểm dừng nào/)
    await user.click(screen.getByRole('button', { name: 'Thêm điểm dừng' }))

    expect(await screen.findByText('Đã lưu danh sách điểm dừng.')).toBeInTheDocument()
  })

  it('keeps the template key read-only after creation', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/plan-templates/${published.id}` })

    expect(await screen.findByLabelText(/Khoá mẫu/)).toBeDisabled()
  })

  it('disables every write for a read-only role', async () => {
    signInAs('moderator')
    renderWithProviders(<Routed />, { route: `/plan-templates/${published.id}` })

    await screen.findByText('Điểm dừng')
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Thêm điểm dừng' })).not.toBeInTheDocument()
  })
})
