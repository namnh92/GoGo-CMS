import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from '@/app/Providers'
import { AppErrorBoundary } from '@/app/ErrorBoundary'
import { router } from '@/app/routes'
import {
  initSentry,
  rootErrorHandlers,
  routeTemplateOf,
  setSentryRoute,
} from '@/shared/observability/sentry'
import './styles/global.css'

async function bootstrap(): Promise<void> {
  // First, so an error anywhere below is reported (ADR-0005). No DSN, no-op.
  initSentry()

  // MSW lets the whole CMS run without a backend. It is dev-only and is never
  // bundled into a production build.
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true') {
    const { worker } = await import('@/shared/test/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }

  // GoGo-CMS#241 — which screen an error came from, as a route template.
  setSentryRoute(routeTemplateOf(router.state.matches))
  router.subscribe((state) => setSentryRoute(routeTemplateOf(state.matches)))

  const container = document.getElementById('root')
  if (!container) throw new Error('#root missing')

  createRoot(container, rootErrorHandlers()).render(
    <StrictMode>
      <AppErrorBoundary>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void bootstrap()
