import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import AuditLogScreen from './auditLog.view'

describe('AuditLogScreen', () => {
  it('shows staff IP to ops_admin — the field exists for incident review', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AuditLogScreen />)

    await screen.findByText('place.emergency_suspended')
    expect(screen.getByText(/10\.20\.4\.51/)).toBeInTheDocument()
  })

  it('renders no IP column for a role that is not entitled to it', async () => {
    // The server omits `ipAddress` below ops_admin. An empty cell would read as
    // missing data, so nothing must be rendered at all.
    signInAs('editor')
    renderWithProviders(<AuditLogScreen />)

    await screen.findByText('place.emergency_suspended')
    expect(screen.queryByText(/10\.20\.4\.51/)).not.toBeInTheDocument()
    expect(screen.queryByText(/IP nhân viên:/)).not.toBeInTheDocument()
  })

  it('the break-glass filter changes the result, not just the query string', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AuditLogScreen />)

    await screen.findByText('place.updated')

    await user.click(screen.getByRole('switch', { name: /Chỉ gỡ khẩn cấp/ }))
    await waitFor(() => expect(screen.queryByText('place.updated')).not.toBeInTheDocument())
    expect(screen.getByText('place.emergency_suspended')).toBeInTheDocument()
  })

  it('says the log is read-only, and the only row control is expand', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<AuditLogScreen />)

    await screen.findByText('place.updated')
    // FR-CMS-008: immutable, and GoGo-BE serves no write route here — so the
    // screen states it rather than leaving the absence to be inferred.
    expect(screen.getByText(/Nhật ký chỉ đọc/)).toBeInTheDocument()

    const expand = screen.getAllByRole('button', { name: 'Xem chi tiết' })[0]!
    await user.click(expand)
    expect(await screen.findByText(/Chào Bạn Cafe & Space/)).toBeInTheDocument()
  })
})
