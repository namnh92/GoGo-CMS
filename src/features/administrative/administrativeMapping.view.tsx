import { useQuery } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { useSession } from '@/shared/auth/session'
import { queryKeys } from '@/shared/api/queryKeys'
import { fetchAdministrativeMappings } from './api'

/**
 * CMS #153 — the shell for the place mapping review queue.
 *
 * It shows the counts the server already returns, so the destination is not a
 * blank page, and says plainly that the queue itself is #156. The decisions —
 * verify, reject, rematch, correct — are moderator-only on the server and are
 * not offered here at all: an action shipped before its screen would be a
 * control nobody has designed the consequences of.
 */
export default function AdministrativeMappingScreen() {
  const t = useT()
  const { can } = useSession()
  const allowed = can('administrativeMapping.read')

  const queue = useQuery({
    queryKey: queryKeys.administrativeMappings('summary'),
    queryFn: ({ signal }) => fetchAdministrativeMappings({ limit: 1 }, signal),
    staleTime: 30_000,
    enabled: allowed,
  })

  if (!allowed) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: t('app.suffix') }]}
          title={t('administrative.mapping.title')}
        />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }]}
        title={t('administrative.mapping.title')}
      />
      <PageBody>
        <AsyncBoundary
          status={queue.status}
          error={queue.error}
          data={queue.data}
          onRetry={() => void queue.refetch()}
        >
          {(data) => (
            <Card>
              <CardHeader
                title={t('administrative.mapping.title')}
                actions={<Badge tone="neutral">{data.counts.NEEDS_REVIEW ?? 0}</Badge>}
              />
              <CardBody>
                <EmptyState
                  title={t('administrative.mapping.subtitle')}
                  hint={t('administrative.shell.notImplemented')}
                />
              </CardBody>
            </Card>
          )}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}
