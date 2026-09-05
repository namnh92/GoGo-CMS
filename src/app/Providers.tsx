import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { I18nProvider } from '@/shared/i18n/i18n'
import { SessionProvider } from '@/shared/auth/session'
import { ToastProvider } from '@/shared/ui/Toast'
import { ApiError } from '@/shared/api/errors'
import { isReachable, subscribeReachability } from '@/shared/ui/useOnline'

// CMS-031 (#109). By default TanStack pauses every query the moment the
// browser says `navigator.onLine === false`, and macOS says that on any
// interface change. Queries now pause and resume on the same verified
// reachability the offline banner uses — one fact, checked against the API.
onlineManager.setEventListener((setOnline) => {
  setOnline(isReachable())
  return subscribeReachability(setOnline)
})

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // 401/403/404/409 are answers, not blips: never retry them.
          if (error instanceof ApiError && !error.retryable) return false
          return failureCount < 2
        },
      },
      mutations: { retry: false },
    },
  })
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}
