import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { TextInput, Toggle } from '@/shared/ui/Field'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import type { AuditEntry } from '@/shared/api/contracts'
import { fetchAudit, type AuditFilters } from './api'
import { styles } from './auditLog.style'

const EMPTY: AuditFilters = {}

/**
 * CMS-014 — the audit log as a screen.
 *
 * Read-only on purpose: FR-CMS-008 makes the log immutable and GoGo-BE serves
 * no write route here (it answers 404 to one even for super_admin), so nothing
 * on this screen may suggest an entry can be edited or removed.
 */
export default function AuditLogScreen() {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()
  const { can } = useSession()

  const [form, setForm] = useState({
    resourceType: '',
    resourceId: '',
    actorId: '',
    action: '',
    from: '',
    to: '',
  })
  const [applied, setApplied] = useState<AuditFilters>(EMPTY)
  const [breakGlass, setBreakGlass] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const canRead = can('audit.read')
  const filters: AuditFilters = useMemo(
    () => ({ ...applied, breakGlass: breakGlass || undefined }),
    [applied, breakGlass],
  )

  /*
   * Keyset paging, not offset: the log is appended to while it is read, so an
   * offset would repeat or skip entries between one page and the next.
   */
  const query = useInfiniteQuery({
    queryKey: queryKeys.audit.list(filters as Record<string, unknown>),
    queryFn: ({ pageParam, signal }) =>
      fetchAudit({ ...filters, cursor: pageParam as string | null }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: canRead,
  })

  const entries: AuditEntry[] = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.items),
    [query.data],
  )

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('audit.screenTitle')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('audit.breadcrumb') }]}
        title={t('audit.screenTitle')}
        showSearch={false}
      />
      <PageBody>
        <p className={`${styles.note} mb-5`}>
          <span aria-hidden="true">ℹ</span>
          {t('audit.subtitle')}
        </p>

        <Card>
          <CardHeader title={t('audit.filter.apply')} hint={t('audit.breakGlassHint')} />
          <CardBody>
            <div className={styles.filters}>
              <TextInput
                label={t('audit.filter.resourceType')}
                value={form.resourceType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, resourceType: event.target.value }))
                }
              />
              <TextInput
                label={t('audit.filter.resourceId')}
                hint={t('audit.filter.resourceIdHint')}
                value={form.resourceId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, resourceId: event.target.value }))
                }
              />
              <TextInput
                label={t('audit.filter.action')}
                value={form.action}
                onChange={(event) =>
                  setForm((current) => ({ ...current, action: event.target.value }))
                }
              />
              <TextInput
                label={t('audit.filter.actorId')}
                value={form.actorId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, actorId: event.target.value }))
                }
              />
              <TextInput
                label={t('audit.filter.from')}
                type="date"
                value={form.from}
                onChange={(event) =>
                  setForm((current) => ({ ...current, from: event.target.value }))
                }
              />
              <TextInput
                label={t('audit.filter.to')}
                type="date"
                value={form.to}
                onChange={(event) => setForm((current) => ({ ...current, to: event.target.value }))}
              />
            </div>
            <div className={styles.filterActions}>
              <div className={styles.breakGlassToggle}>
                {/* One click, because incident review is the query this log exists for. */}
                <Toggle
                  label={t('audit.breakGlass')}
                  checked={breakGlass}
                  onChange={setBreakGlass}
                />
                <span className="text-xs text-text-muted">{t('audit.breakGlass')}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setForm({
                      resourceType: '',
                      resourceId: '',
                      actorId: '',
                      action: '',
                      from: '',
                      to: '',
                    })
                    setBreakGlass(false)
                    setApplied(EMPTY)
                  }}
                >
                  {t('audit.filter.reset')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    setApplied({
                      resourceType: form.resourceType.trim() || undefined,
                      resourceId: form.resourceId.trim() || undefined,
                      actorId: form.actorId.trim() || undefined,
                      action: form.action.trim() || undefined,
                      // A date input gives a day; the API wants an instant.
                      from: form.from
                        ? new Date(`${form.from}T00:00:00Z`).toISOString()
                        : undefined,
                      to: form.to ? new Date(`${form.to}T23:59:59Z`).toISOString() : undefined,
                    })
                  }
                >
                  {t('audit.filter.apply')}
                </Button>
              </div>
            </div>
            <p className={`${styles.note} mt-3`}>
              <span aria-hidden="true">ℹ</span>
              {t('audit.immutable')} {t('audit.ipNote')}
            </p>
          </CardBody>
        </Card>

        <Card className="mt-5">
          <CardHeader title={t('audit.screenTitle')} />
          <CardBody>
            <AsyncBoundary
              status={query.status}
              error={query.error}
              data={entries}
              isEmpty={(items) => items.length === 0}
              onRetry={() => void query.refetch()}
              empty={<EmptyState title={t('audit.empty')} hint={null} />}
            >
              {(items) => (
                <>
                  <ol>
                    {items.map((entry) => (
                      <li
                        key={entry.id}
                        className={`${styles.row} ${entry.breakGlass ? styles.rowBreakGlass : ''}`}
                      >
                        <div className={styles.head}>
                          <span>
                            <span className={styles.action}>{entry.action}</span>{' '}
                            <span className={styles.actor}>
                              {entry.actorRole
                                ? t(`role.${entry.actorRole}` as const)
                                : entry.actorType}
                              {entry.actorId ? ` · ${entry.actorId}` : ''}
                            </span>
                          </span>
                          <time className={styles.time} dateTime={entry.occurredAt}>
                            {formatDateTime(entry.occurredAt, locale)}
                          </time>
                        </div>
                        <div className={styles.meta}>
                          {/* Break-glass is worded as well as coloured. */}
                          {entry.breakGlass ? (
                            <Badge tone="danger">{t('audit.breakGlassBadge')}</Badge>
                          ) : null}
                          <span>
                            {t('audit.col.resource')}: {entry.resourceType} ·{' '}
                            <span className={styles.mono}>{entry.resourceId}</span>
                          </span>
                          {entry.authorizationPath ? (
                            <span>
                              {t('audit.col.path')}:{' '}
                              {label(
                                `authPath.${entry.authorizationPath}`,
                                entry.authorizationPath,
                              )}
                            </span>
                          ) : null}
                          {entry.requestId ? (
                            <span>
                              {t('audit.col.requestId')}:{' '}
                              <span className={styles.mono}>{entry.requestId}</span>
                            </span>
                          ) : null}
                          {/*
                            Staff IP is returned only to ops_admin and above.
                            Absent means "not entitled to see it", so nothing is
                            rendered — an empty cell would read as missing data.
                          */}
                          {entry.ipAddress ? (
                            <span className={styles.mono}>
                              {t('audit.col.ip')}: {entry.ipAddress}
                            </span>
                          ) : null}
                        </div>
                        {entry.reason ? (
                          <p className={styles.reason}>
                            {t('audit.reason')}: {entry.reason}
                          </p>
                        ) : null}
                        {entry.diff != null ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-expanded={expanded === entry.id}
                              onClick={() =>
                                setExpanded((current) => (current === entry.id ? null : entry.id))
                              }
                            >
                              {expanded === entry.id ? t('audit.collapse') : t('audit.expand')}
                            </Button>
                            {expanded === entry.id ? (
                              <pre className={styles.diff}>
                                {JSON.stringify(entry.diff, null, 2)}
                              </pre>
                            ) : null}
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  {query.hasNextPage ? (
                    <div className={styles.more}>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={query.isFetchingNextPage}
                        onClick={() => void query.fetchNextPage()}
                      >
                        {t('audit.loadMore')}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </AsyncBoundary>
          </CardBody>
        </Card>
      </PageBody>
    </>
  )
}
