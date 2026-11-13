import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/shared/auth/session'
import { server } from '@/shared/test/server'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import AuditLogScreen from './auditLog.view'

function SessionControls({ onCacheCheck }: { onCacheCheck: (empty: boolean) => void }) {
  const { logout, login } = useSession()
  const client = useQueryClient()
  return (
    <>
      <button onClick={logout}>Sign out</button>
      <button onClick={() => void login({ email: 'editor@example.com', password: 'test' })}>
        Sign in as editor
      </button>
      <button
        onClick={() =>
          onCacheCheck(
            client.getQueriesData({ queryKey: ['audit'] }).every(([, data]) => data === undefined),
          )
        }
      >
        Check audit cache
      </button>
    </>
  )
}

describe('AuditLogScreen', () => {
  it('removes restricted audit rows on logout and requests authorized data for the next session', async () => {
    signInAs('super_admin')
    const cacheCheck = vi.fn()
    let editor = false
    const reads = vi.fn(() =>
      HttpResponse.json({
        items: editor
          ? []
          : [
              {
                id: 'restricted-entry',
                action: 'room_invite_ttl.updated',
                actorType: 'admin',
                actorId: 'admin-a',
                actorRole: 'super_admin',
                resourceType: 'room_invite_ttl',
                resourceId: 'global',
                occurredAt: '2026-11-13T00:00:00Z',
              },
            ],
        nextCursor: null,
      }),
    )
    server.use(
      http.get('*/v1/cms/audit', reads),
      http.post('*/v1/cms/auth/login', () => {
        editor = true
        return HttpResponse.json({ role: 'editor', displayName: 'Editor' })
      }),
    )
    renderWithProviders(
      <>
        <SessionControls onCacheCheck={cacheCheck} />
        <AuditLogScreen />
      </>,
      { staleTime: 30000 },
    )
    await screen.findByText('room_invite_ttl.updated')
    await userEvent.click(screen.getByText('Sign out'))
    expect(screen.queryByText('room_invite_ttl.updated')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Sign in as editor'))
    expect(screen.queryByText('room_invite_ttl.updated')).not.toBeInTheDocument()
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(2))
    await userEvent.click(screen.getByText('Sign out'))
    await userEvent.click(screen.getByText('Check audit cache'))
    expect(cacheCheck).toHaveBeenCalledWith(true)
    expect(screen.queryByText('room_invite_ttl.updated')).not.toBeInTheDocument()
  })

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
