import { useQuery } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { useSession } from '@/shared/auth/session'
import { queryKeys } from '@/shared/api/queryKeys'
import { fetchAdministrativeCapability } from './api'
import { capabilityNotice } from './capability'

/**
 * CMS #153 — the shell for the Administrative Data screen.
 *
 * It shows one true thing and claims nothing else: whether this environment has
 * a published dataset and a loaded boundary release, which is what decides
 * whether a place can be approved at all. The dataset table, the diff and the
 * publish flow are #154; the screen says so rather than rendering controls that
 * do not work yet, because a button that looks operable and is not is worse
 * than an empty state that explains itself.
 */
export default function AdministrativeDataScreen() {
  const t = useT()
  const { can } = useSession()
  const allowed = can('administrativeDataset.read')

  const capability = useQuery({
    queryKey: queryKeys.administrativeCapability(),
    queryFn: ({ signal }) => fetchAdministrativeCapability(signal),
    staleTime: 30_000,
    // No request at all without permission: hiding the screen is not the point,
    // not asking is.
    enabled: allowed,
  })

  if (!allowed) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: t('app.suffix') }]}
          title={t('administrative.dataset.title')}
        />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const notice = capabilityNotice

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }]}
        title={t('administrative.dataset.title')}
      />
      <PageBody>
        <AsyncBoundary
          status={capability.status}
          error={capability.error}
          data={capability.data}
          onRetry={() => void capability.refetch()}
        >
          {(data) => (
            <Card>
              <CardHeader
                title={t('administrative.dataset.title')}
                actions={<Badge tone={notice(data).tone}>{t(notice(data).messageKey)}</Badge>}
              />
              <CardBody>
                <EmptyState
                  title={t('administrative.dataset.subtitle')}
                  hint={
                    <>
                      {t('administrative.shell.notImplemented')}
                      <div className="mt-2 font-mono text-xs">
                        {data.dataset.version ?? '—'} · {data.boundaries.version ?? '—'}
                      </div>
                    </>
                  }
                />
              </CardBody>
            </Card>
          )}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}
