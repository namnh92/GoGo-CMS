import { describe, expect, it } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { screen } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { CHANGE_PASSWORD_PATH, RequireAuth } from './RequireAuth'

const HINT_KEY = 'gogo.cms.session-hint'

/**
 * #101. A staff account signing in with a temporary password used to be
 * written into the session before the obligation was cleared, and the
 * change-password step lived inside `/login` with no route of its own — so
 * typing a URL, reloading or pressing Back walked into a console where
 * GoGo-BE answers 403 PASSWORD_CHANGE_REQUIRED on every query, with no way
 * back to the one screen that can fix it.
 */
function signInWithTemporaryPassword(): void {
  signInAs('ops_admin')
  window.localStorage.setItem(
    HINT_KEY,
    JSON.stringify({ role: 'ops_admin', displayName: 'temp.admin', mustChangePassword: true }),
  )
}

function guardedRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <p>console</p>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/accounts"
        element={
          <RequireAuth>
            <p>accounts</p>
          </RequireAuth>
        }
      />
      <Route
        path={CHANGE_PASSWORD_PATH}
        element={
          <RequireAuth>
            <p>change password</p>
          </RequireAuth>
        }
      />
    </Routes>
  )
}

describe('forced password change (#101)', () => {
  it('sends a landing on the console to the change-password screen', async () => {
    signInWithTemporaryPassword()
    renderWithProviders(guardedRoutes(), { route: '/' })

    expect(await screen.findByText('change password')).toBeInTheDocument()
    expect(screen.queryByText('console')).not.toBeInTheDocument()
  })

  it('sends a reload onto a deep protected route there too', async () => {
    signInWithTemporaryPassword()
    renderWithProviders(guardedRoutes(), { route: '/settings/accounts' })

    expect(await screen.findByText('change password')).toBeInTheDocument()
    expect(screen.queryByText('accounts')).not.toBeInTheDocument()
  })

  it('lets the change-password screen itself render, or there is nowhere to go', async () => {
    signInWithTemporaryPassword()
    renderWithProviders(guardedRoutes(), { route: CHANGE_PASSWORD_PATH })

    expect(await screen.findByText('change password')).toBeInTheDocument()
  })

  it('leaves an ordinary session alone, including a hint written before this field existed', async () => {
    // `signInAs` writes exactly that older shape: role and displayName only.
    signInAs('ops_admin')
    renderWithProviders(guardedRoutes(), { route: '/' })

    expect(await screen.findByText('console')).toBeInTheDocument()
  })
})
