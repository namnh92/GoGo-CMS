import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/shared/i18n/i18n'
import { SessionProvider } from '@/shared/auth/session'
import { ToastProvider } from '@/shared/ui/Toast'
import type { AdminRole } from '@/shared/api/contracts'
const HINT_KEY = 'gogo.cms.session-hint'

/** Seeds the session hint so a screen can be rendered as a given role. */
export function signInAs(role: AdminRole, displayName = 'test.user'): void {
  // The mock reads this same hint, so it answers per role the way the server
  // does — staff IP in the audit log, four-eyes on a ranking config.
  window.localStorage.setItem(HINT_KEY, JSON.stringify({ role, displayName }))
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <SessionProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
            </ToastProvider>
          </SessionProvider>
        </I18nProvider>
      </QueryClientProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...options })
}
