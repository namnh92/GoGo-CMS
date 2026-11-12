import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { ApiError } from '@/shared/api/errors'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber } from '@/shared/format'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/Button'
import {
  AsyncBoundary,
  EmptyState,
  ErrorState,
  OfflineState,
  PermissionDeniedState,
  TableSkeleton,
} from '@/shared/ui/State'
import { useOnline } from '@/shared/ui/useOnline'
import { fetchAssistantCredits } from './assistantCredits.api'
import { styles } from './assistantCredits.style'

export default function AssistantCreditsScreen() {
  const { id = '' } = useParams()
  const { can } = useSession()
  const t = useT()
  return (
    <>
      <PageHeader
        title={t('credits.title')}
        breadcrumb={[{ label: t('users.title'), to: '/users' }, { label: t('credits.title') }]}
      />
      <PageBody>
        {can('user.assistantCredits') ? (
          <CreditLedger key={id} id={id} />
        ) : (
          <PermissionDeniedState />
        )}
      </PageBody>
    </>
  )
}

function CreditLedger({ id }: { id: string }) {
  const t = useT()
  const { locale } = useI18n()
  const label = useLabel()
  const online = useOnline()
  const query = useInfiniteQuery({
    queryKey: ['appUsers', id, 'assistantCredits'],
    queryFn: ({ pageParam, signal }) =>
      fetchAssistantCredits(id, { limit: 50, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: online,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  // A mid-session denial must hide even previously loaded pages.
  if (query.error instanceof ApiError && query.error.isForbidden) return <PermissionDeniedState />
  if (!online || query.fetchStatus === 'paused') return <OfflineState />
  const pages = query.data?.pages ?? []
  const latest = pages[pages.length - 1]
  const items = pages.flatMap((page) => page.items)

  return (
    <AsyncBoundary
      status={query.isFetchNextPageError ? 'success' : query.status}
      error={query.error}
      data={latest}
      loading={<TableSkeleton cols={4} />}
      onRetry={() => void query.refetch()}
    >
      {(latest) => (
        <>
          <section className={styles.summary} aria-label={t('credits.balanceLabel')}>
            <p className={styles.name}>{latest.user.displayName}</p>
            <p className={styles.identifier}>{latest.user.id}</p>
            <p className={styles.balance}>
              {t('credits.balance', { count: formatNumber(latest.balance, locale) })}
            </p>
            <p className={styles.note}>{t('credits.snapshotNote')}</p>
          </section>
          {items.length === 0 ? (
            <EmptyState title={t('credits.empty')} hint={t('credits.emptyHint')} />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>{t('credits.ledger')}</caption>
                <thead>
                  <tr>
                    {(['time', 'delta', 'reason', 'references'] as const).map((key) => (
                      <th key={key} scope="col" className={styles.heading}>
                        {t(`credits.col.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.id}>
                      <td className={styles.cell}>
                        <time dateTime={entry.createdAt} title={entry.createdAt}>
                          {formatDateTime(entry.createdAt, locale)}
                        </time>
                        <p className={styles.identifier}>{entry.id}</p>
                      </td>
                      <td className={styles.cell}>
                        <span className={styles.delta}>
                          {entry.delta > 0 ? '+' : ''}
                          {formatNumber(entry.delta, locale)}
                        </span>
                      </td>
                      <td className={styles.cell}>
                        {label(`credits.reason.${entry.reason}`, t('credits.reason.other'))}
                      </td>
                      <td className={styles.cell}>
                        <div className={styles.references}>
                          {entry.submissionId ? (
                            <Link
                              className={styles.link}
                              to={`/submissions/${encodeURIComponent(entry.submissionId)}`}
                            >
                              {t('credits.submission')}: {entry.submissionId}
                            </Link>
                          ) : null}
                          {entry.venueIdentity ? (
                            <span>
                              {t('credits.venueIdentity')}: {entry.venueIdentity}
                            </span>
                          ) : null}
                          {entry.placeId ? (
                            <Link
                              className={styles.link}
                              to={`/places/${encodeURIComponent(entry.placeId)}`}
                            >
                              {t('credits.place')}: {entry.placeId}
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {query.isFetchNextPageError ? <ErrorState error={query.error} /> : null}
          <div className={styles.footer}>
            <span aria-live="polite">
              {t('credits.shown', { count: formatNumber(items.length, locale) })}
            </span>
            {query.hasNextPage ? (
              <Button
                variant="secondary"
                loading={query.isFetchingNextPage}
                disabled={!online || query.isFetching}
                onClick={() => void query.fetchNextPage()}
              >
                {t(query.isFetchNextPageError ? 'state.retry' : 'credits.loadMore')}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </AsyncBoundary>
  )
}
