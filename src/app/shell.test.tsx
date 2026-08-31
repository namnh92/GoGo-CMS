import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { AppShell } from './AppShell'

afterEach(() => {
  vi.unstubAllEnvs()
  window.sessionStorage.clear()
})

describe('environment awareness (CMS-016)', () => {
  it('names the environment on every screen, from build config', async () => {
    signInAs('ops_admin')
    renderWithProviders(<AppShell />)

    // The badge lives in the shell, so it is on screen whatever route renders.
    expect(await screen.findByText('DEV')).toBeInTheDocument()
  })

  it('warns loudly on production and nowhere else', async () => {
    signInAs('ops_admin')
    const { unmount } = renderWithProviders(<AppShell />)
    expect(screen.queryByText(/PRODUCTION —/)).not.toBeInTheDocument()
    unmount()

    vi.stubEnv('VITE_APP_ENV', 'production')
    renderWithProviders(<AppShell />)

    expect(await screen.findByText(/PRODUCTION —/)).toBeInTheDocument()
    expect(screen.getAllByText('PRODUCTION').length).toBeGreaterThan(0)
  })

  it('falls back to the least alarming environment when the value is junk', async () => {
    signInAs('ops_admin')
    vi.stubEnv('VITE_APP_ENV', 'prod-ish')
    renderWithProviders(<AppShell />)

    expect(await screen.findByText('DEV')).toBeInTheDocument()
    expect(screen.queryByText(/PRODUCTION —/)).not.toBeInTheDocument()
  })
})
