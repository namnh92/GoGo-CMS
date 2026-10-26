import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { formatDateTime } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { InlineSelect } from '@/shared/ui/Field'
import { AsyncBoundary, EmptyState, LoadingState, ErrorState } from '@/shared/ui/State'
import type {
  CmsAssistantDocumentDetail,
  CmsAssistantVersionSummary,
} from '@/shared/api/contracts-assistant'
import { fetchVersion, fetchVersions } from './api'
import { VersionDiff, VersionStateBadge } from './assistantParts'
import { useActorName } from './useActorName'
import { styles } from './assistant.style'

/** Versions that may be published again: once live, now not. */
const ROLLBACK_STATES = new Set(['superseded', 'withdrawn'])

/**
 * Version history (append-only) with a diff between any two versions, and —
 * for `ops_admin` — publishing an earlier version again as a rollback. The
 * rollback goes through the same preview dialog as a normal publish.
 */
export function DocumentVersions({
  detail,
  canPublish,
  online,
  onRollback,
}: {
  detail: CmsAssistantDocumentDetail
  canPublish: boolean
  online: boolean
  onRollback: (version: CmsAssistantVersionSummary) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const actorName = useActorName()
  const id = detail.document.id

  const versions = useQuery({
    queryKey: queryKeys.assistant.versions(id),
    queryFn: ({ signal }) => fetchVersions(id, signal),
  })

  const items = useMemo(() => versions.data?.items ?? [], [versions.data])
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')

  // Default comparison: what is live against what would replace it.
  useEffect(() => {
    if (items.length === 0 || (fromId && toId)) return
    const to = detail.draft?.id ?? items[0]?.id ?? ''
    const from =
      detail.published && detail.published.id !== to
        ? detail.published.id
        : (items.find((item) => item.id !== to)?.id ?? '')
    setFromId(from)
    setToId(to)
  }, [items, detail.draft?.id, detail.published, fromId, toId])

  const fromQuery = useQuery({
    queryKey: queryKeys.assistant.version(id, fromId),
    queryFn: ({ signal }) => fetchVersion(id, fromId, signal),
    enabled: Boolean(fromId),
  })
  const toQuery = useQuery({
    queryKey: queryKeys.assistant.version(id, toId),
    queryFn: ({ signal }) => fetchVersion(id, toId, signal),
    enabled: Boolean(toId),
  })

  const label = (version: CmsAssistantVersionSummary) =>
    t('assistant.versionOption', { number: version.number, title: version.title })

  return (
    <AsyncBoundary
      status={versions.status}
      error={versions.error}
      data={items}
      isEmpty={(list) => list.length === 0}
      onRetry={() => void versions.refetch()}
      empty={<EmptyState title={t('assistant.versions.empty')} hint={null} />}
    >
      {(list) => (
        <>
          <ol className={styles.versionList} aria-label={t('assistant.versions.title')}>
            {list.map((version) => {
              const live = detail.published?.id === version.id
              return (
                <li key={version.id} className={styles.versionRow}>
                  <div className="min-w-0">
                    <p className={`${styles.versionTitle} flex flex-wrap items-center gap-2`}>
                      <span>{t('assistant.versionNumber', { number: version.number })}</span>
                      <VersionStateBadge state={version.state} />
                      <span className="font-normal">{version.title}</span>
                    </p>
                    <p className={styles.versionMeta}>
                      {t('assistant.versions.created', {
                        who: actorName(version.createdBy),
                        at: formatDateTime(version.createdAt, locale),
                      })}
                      {version.state === 'draft' && typeof version.revision === 'number'
                        ? ` · ${t('assistant.revision', { revision: version.revision })}`
                        : ''}
                    </p>
                    {version.publishedAt ? (
                      <p className={styles.versionMeta}>
                        {t('assistant.versions.published', {
                          who: actorName(version.publishedBy),
                          at: formatDateTime(version.publishedAt, locale),
                        })}
                        {version.publishReason ? (
                          <span className={styles.versionReason}>
                            {' '}
                            · {t('assistant.reason')}: {version.publishReason}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {version.withdrawnAt ? (
                      <p className={styles.versionMeta}>
                        {t('assistant.versions.withdrawn', {
                          who: actorName(version.withdrawnBy),
                          at: formatDateTime(version.withdrawnAt, locale),
                        })}
                        {version.withdrawReason ? (
                          <span className={styles.versionReason}>
                            {' '}
                            · {t('assistant.reason')}: {version.withdrawReason}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  {canPublish && !live && ROLLBACK_STATES.has(version.state) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!online}
                      onClick={() => onRollback(version)}
                    >
                      {t('assistant.rollback', { number: version.number })}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ol>

          {list.length < 2 ? (
            <p className={`${styles.note} mx-5 my-4`}>{t('assistant.compare.single')}</p>
          ) : (
            <>
              <div className={styles.compareBar}>
                <InlineSelect
                  label={t('assistant.compare.from')}
                  value={fromId}
                  onChange={(event) => setFromId(event.target.value)}
                >
                  {list.map((version) => (
                    <option key={version.id} value={version.id}>
                      {label(version)}
                    </option>
                  ))}
                </InlineSelect>
                <InlineSelect
                  label={t('assistant.compare.to')}
                  value={toId}
                  onChange={(event) => setToId(event.target.value)}
                >
                  {list.map((version) => (
                    <option key={version.id} value={version.id}>
                      {label(version)}
                    </option>
                  ))}
                </InlineSelect>
              </div>
              <div className="px-5 py-4">
                {fromId === toId ? (
                  <p className={styles.fieldSame}>{t('assistant.compare.same')}</p>
                ) : fromQuery.status === 'error' || toQuery.status === 'error' ? (
                  <ErrorState
                    error={fromQuery.error ?? toQuery.error}
                    onRetry={() => {
                      void fromQuery.refetch()
                      void toQuery.refetch()
                    }}
                  />
                ) : fromQuery.data && toQuery.data ? (
                  <VersionDiff before={fromQuery.data} after={toQuery.data} />
                ) : (
                  <LoadingState />
                )}
              </div>
            </>
          )}
        </>
      )}
    </AsyncBoundary>
  )
}
