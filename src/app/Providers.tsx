import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/shared/i18n/i18n'
import { SessionProvider } from '@/shared/auth/session'
import { ToastProvider } from '@/shared/ui/Toast'
import { ApiError } from '@/shared/api/errors'

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
