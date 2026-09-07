import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { formatDate, formatNumber } from '@/shared/format'
import { Badge } from '@/shared/ui/Badge'
import { CardBody, CardHeader } from '@/shared/ui/Card'
import { DataTable, Pagination } from '@/shared/ui/DataTable'
import { AsyncBoundary, EmptyState } from '@/shared/ui/State'
import type { AdministrativeDiffEntry } from '@/shared/api/contracts-administrative'
import { fetchAdministrativeDatasetDiff } from './api'
import { DIFF_CATEGORIES, orderedCategories } from './datasetGuards'
import { styles } from './datasetDetail.style'

const PAGE_SIZE = 100

/**
 * CMS #154 — this version against whatever is published now.
 *
 * Two numbers that are easy to conflate are kept apart on purpose.
 * `countsByCategory` is complete and never paged; `entries` is one bounded page
 * of a diff that can run to five figures. A reviewer walking a 14,000-entry diff
 * must never see a total that shrinks to the size of the page they are looking
 * at — that is how a LIMIT becomes a fact.
 *
 * The category chips are counts, not filters. GoGo-BE's diff endpoint takes no
 * category parameter, and a chip that looked clickable but only filtered the
 * current page would report a different answer on page two.
 */
export function DatasetDiffPanel({ datasetId }: { datasetId: string }) {
  const t = useT()
  const { locale } = useI18n()
  const [offset, setOffset] = useState(0)

  const diff = useQuery({
    queryKey: queryKeys.administrativeDatasetDiff(datasetId, PAGE_SIZE, offset),
    queryFn: ({ signal }) =>
      fetchAdministrativeDatasetDiff(datasetId, { limit: PAGE_SIZE, offset }, signal),
    enabled: Boolean(datasetId),
  })

  const entries = useMemo(() => diff.data?.entries ?? [], [diff.data])

  const columns = useMemo<ColumnDef<AdministrativeDiffEntry, unknown>[]>(
    () => [
      {
        id: 'category',
        header: () => t('administrative.diff.col.category'),
        cell: ({ row }) => (
          <Badge tone={row.original.category === 'UNRESOLVED' ? 'danger' : 'neutral'}>
            {label(t, row.original.category)}
          </Badge>
        ),
        enableSorting: false,
      },
      {
        id: 'from',
        header: () => t('administrative.diff.col.from'),
        cell: ({ row }) => <Identity side={row.original.from} locale={locale} />,
        enableSorting: false,
      },
      {
        id: 'to',
        header: () => t('administrative.diff.col.to'),
        cell: ({ row }) => <Identity side={row.original.to} locale={locale} />,
        enableSorting: false,
      },
      {
        id: 'detail',
        header: () => t('administrative.diff.col.detail'),
        cell: ({ row }) => <span className={styles.meta}>{row.original.detail}</span>,
        enableSorting: false,
      },
      {
        id: 'provenance',
        header: () => t('administrative.diff.col.provenance'),
        cell: ({ row }) => <span className={styles.meta}>{row.original.provenance ?? '—'}</span>,
        enableSorting: false,
      },
      {
        id: 'validation',
        header: () => t('administrative.diff.col.gates'),
        cell: ({ row }) =>
          row.original.validation.length === 0 ? (
            <span className={styles.meta}>—</span>
          ) : (
            <span className={styles.samples}>
              {row.original.validation.map((gate) => (
                <code key={gate} className={styles.sample}>
                  {gate}
                </code>
              ))}
            </span>
          ),
        enableSorting: false,
      },
    ],
    [locale, t],
  )

  return (
    <AsyncBoundary
      status={diff.status}
      error={diff.error}
      data={diff.data}
      onRetry={() => void diff.refetch()}
    >
      {(data) => {
        const categories = orderedCategories(data.countsByCategory)
        const nonEmpty = categories.filter((category) => (data.countsByCategory[category] ?? 0) > 0)
        const onlyDrift = nonEmpty.length === 1 && nonEmpty[0] === 'SOURCE_DRIFT'
        const totalEntries = data.pagination?.totalEntries ?? entries.length
        const hasNext = data.pagination?.hasMore ?? false

        return (
          <>
            <CardBody className="flex flex-col gap-3">
              {/* Null and absent both mean "no baseline": a first publication. */}
              {data.fromVersion == null ? (
                <p className={styles.banner}>
                  <span aria-hidden="true">ℹ</span>
                  {t('administrative.diff.firstPublication')}
                </p>
              ) : (
                <p className={styles.meta}>
                  {t('administrative.diff.baseline', {
                    from: data.fromVersion,
                    to: data.toVersion,
                  })}
                </p>
              )}

              {onlyDrift ? (
                <p className={styles.banner}>
                  <span aria-hidden="true">ℹ</span>
                  {t('administrative.diff.onlySourceDrift')}
                </p>
              ) : null}

              {/*
                Every category the contract declares, including the ones at
                zero: "no SPLIT in this release" is a fact worth reading, and a
                category that simply vanishes cannot be distinguished from one
                nobody thought to compute.
              */}
              <ul className={styles.categoryList}>
                {[
                  ...DIFF_CATEGORIES,
                  ...categories.filter(
                    (category) => !(DIFF_CATEGORIES as readonly string[]).includes(category),
                  ),
                ].map((category) => {
                  const count = data.countsByCategory[category] ?? 0
                  return (
                    <li
                      key={category}
                      className={`${styles.categoryChip} ${
                        count > 0 ? styles.categoryChipOn : styles.categoryChipOff
                      }`}
                    >
                      {label(t, category)}
                      <span className={styles.categoryCount}>{formatNumber(count, locale)}</span>
                    </li>
                  )
                })}
              </ul>

              <div className={styles.facts}>
                <div className={styles.fact}>
                  <p className={styles.factLabel}>{t('administrative.diff.affected')}</p>
                  <p className={styles.factValue}>
                    {formatNumber(data.affectedPlaces.total, locale)}
                  </p>
                </div>
                <div className={styles.fact}>
                  <p className={styles.factLabel}>{t('administrative.diff.entryTotal')}</p>
                  <p className={styles.factValue}>{formatNumber(totalEntries, locale)}</p>
                </div>
              </div>

              {data.affectedPlaces.samples.length > 0 ? (
                <div>
                  <p className={styles.factLabel}>{t('administrative.diff.affectedSamples')}</p>
                  <ul className={styles.samples}>
                    {data.affectedPlaces.samples.map((sample) => (
                      <li key={sample.placeId} className={styles.sample}>
                        {sample.name} · {sample.code} · {sample.status}
                      </li>
                    ))}
                  </ul>
                  {data.affectedPlaces.truncated ? (
                    <p className={styles.meta}>
                      {t('administrative.diff.sampleTruncated', {
                        shown: formatNumber(data.affectedPlaces.samples.length, locale),
                        total: formatNumber(data.affectedPlaces.total, locale),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {data.entriesTruncated ? (
                <p className={styles.banner}>
                  <span aria-hidden="true">⚠</span>
                  {t('administrative.diff.truncated', {
                    limit: formatNumber(data.entryLimit, locale),
                  })}
                </p>
              ) : null}
            </CardBody>

            {entries.length === 0 ? (
              <CardBody>
                <EmptyState
                  title={t('administrative.diff.empty')}
                  hint={t('administrative.diff.emptyHint')}
                />
              </CardBody>
            ) : (
              <>
                <DataTable
                  data={entries}
                  columns={columns}
                  getRowId={(row) => row.key}
                  caption={t('administrative.diff.title')}
                  rowTone={(row) => (row.category === 'UNRESOLVED' ? 'warning' : 'default')}
                />
                <Pagination
                  offset={offset}
                  limit={PAGE_SIZE}
                  total={totalEntries}
                  hasNext={hasNext}
                  onOffsetChange={setOffset}
                  summary={t('administrative.diff.summary', {
                    shown: formatNumber(entries.length, locale),
                    total: formatNumber(totalEntries, locale),
                  })}
                />
              </>
            )}
          </>
        )
      }}
    </AsyncBoundary>
  )
}

export function DiffHeader() {
  const t = useT()
  return <CardHeader title={t('administrative.diff.title')} hint={t('administrative.diff.hint')} />
}

/**
 * One side of a change, as an identity rather than a code.
 *
 * A commune code is not unique across releases — 2,212 of 3,321 changed meaning
 * on 2025-07-01 — so the effective date travels with it. Rendering the code
 * alone would make a REASSIGNED row indistinguishable from an unchanged one.
 */
function Identity({
  side,
  locale,
}: {
  side: AdministrativeDiffEntry['from']
  locale: 'vi' | 'en'
}) {
  if (!side || (!side.code && !side.effectiveFrom)) return <span className={styles.meta}>—</span>
  return (
    <span className={styles.identity}>
      {side.code ?? '—'}
      {side.effectiveFrom ? (
        <span className={styles.identityMeta}>{formatDate(side.effectiveFrom, locale)}</span>
      ) : null}
    </span>
  )
}

function label(t: ReturnType<typeof useT>, category: string): string {
  const key = `administrative.diffCategory.${category}` as Parameters<typeof t>[0]
  const translated = t(key)
  return translated === key ? category : translated
}
