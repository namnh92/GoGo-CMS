import { useQuery } from '@tanstack/react-query'

import { formatNumber } from '@/shared/format'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { Button } from '@/shared/ui/Button'
import { AsyncBoundary } from '@/shared/ui/State'
import { CheckIcon, ChevronRightIcon } from '@/shared/ui/icons'
import { cn } from '@/shared/ui/cn'

import { fetchPlaceAdministrativeCounts, type PlaceCountFilters } from './api'
import { styles } from './administrativeTree.style'

/**
 * ADM-018 — the catalogue as the country is actually organised.
 *
 * Tỉnh/Thành phố → Phường/Xã/Đặc khu → the places filed under that commune.
 * There is no district level: district-level units were dissolved on
 * 2025-07-01, and offering one would be a level nothing current lives at.
 *
 * The counts come from the server, over the *same* filters the table below is
 * showing. Fetching the catalogue and adding it up in the browser would be
 * wrong twice: the list is keyset-paged, so the browser only ever holds fifty
 * rows, and any arithmetic done here would be a second implementation of a
 * grouping rule that has to agree with the server's exactly.
 *
 * Selecting a row filters the table to precisely the places that row counted.
 */
export type AdministrativeSelection = {
  provinceCode: string
  communeCode: string
  /** `review` is the unresolved bucket; `grouped` is a chosen unit. */
  state: 'grouped' | 'review' | null
}

export const NO_SELECTION: AdministrativeSelection = {
  provinceCode: '',
  communeCode: '',
  state: null,
}

export function AdministrativeTree({
  filters,
  value,
  onChange,
}: {
  /** The list's own filters, minus anything administrative. */
  filters: PlaceCountFilters
  value: AdministrativeSelection
  onChange: (next: AdministrativeSelection) => void
}) {
  const t = useT()
  const { locale } = useI18n()

  const provincesQuery = useQuery({
    queryKey: queryKeys.places.administrative({ ...filters }),
    queryFn: ({ signal }) => fetchPlaceAdministrativeCounts(filters, signal),
  })

  /**
   * The expanded province is the selected one. There is no separate "open"
   * state: an editor who opens a province is looking at that province, and two
   * ideas of "which one" is what makes a tree disagree with the table beside it.
   */
  const expanded = value.provinceCode
  const communesQuery = useQuery({
    queryKey: queryKeys.places.administrative({ ...filters, provinceCode: expanded }),
    queryFn: ({ signal }) =>
      fetchPlaceAdministrativeCounts({ ...filters, provinceCode: expanded }, signal),
    enabled: expanded !== '',
  })

  const number = (value: number) => formatNumber(value, locale)

  return (
    <section className={styles.panel} aria-label={t('places.hierarchy.title')}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t('places.hierarchy.title')}</h2>
        {/* Which release the codes and names were read from. 2,212 of the
            current commune codes named a different unit before 2025-07-01, so
            a count without its dataset is not reproducible. */}
        {provincesQuery.data?.datasetVersion ? (
          <span className={styles.dataset}>{provincesQuery.data.datasetVersion}</span>
        ) : null}
      </div>

      <AsyncBoundary
        status={provincesQuery.status}
        error={provincesQuery.error}
        data={provincesQuery.data}
        onRetry={() => void provincesQuery.refetch()}
      >
        {(summary) => (
          <div className={styles.body}>
            {summary.units.map((unit) => {
              const open = expanded === unit.code
              const selected = open && value.communeCode === '' && value.state === 'grouped'
              return (
                <div key={unit.code}>
                  {/*
                    One control, not two. Opening a province and filtering to it
                    are the same intent — an editor who opens Hồ Chí Minh is
                    looking at Hồ Chí Minh — and a separate chevron would be a
                    second tab stop that does the same thing under a different
                    name.
                  */}
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-pressed={selected}
                    className={cn(styles.row, selected && styles.rowSelected)}
                    onClick={() =>
                      onChange(
                        open
                          ? NO_SELECTION
                          : { provinceCode: unit.code, communeCode: '', state: 'grouped' },
                      )
                    }
                  >
                    <ChevronRightIcon
                      size={13}
                      aria-hidden="true"
                      className={cn(styles.chevron, open && 'rotate-90')}
                    />
                    <span className={styles.name}>{unit.name ?? unit.code}</span>
                    {/* Reported beside the province it is filed under, and
                        never added to it: a place under review has no commune
                        anyone should trust it under. */}
                    {unit.reviewCount ? (
                      <span className={styles.review}>
                        {t('places.hierarchy.reviewCount', { count: number(unit.reviewCount) })}
                      </span>
                    ) : null}
                    <span className={styles.count}>{number(unit.placeCount)}</span>
                    {/* Selection is never colour alone. */}
                    {selected ? <CheckIcon size={13} className={styles.check} /> : null}
                  </button>

                  {open ? (
                    <AsyncBoundary
                      status={communesQuery.status}
                      error={communesQuery.error}
                      data={communesQuery.data}
                      onRetry={() => void communesQuery.refetch()}
                    >
                      {(communes) =>
                        communes.units.length === 0 ? (
                          <p className={styles.footer}>{t('places.hierarchy.emptyProvince')}</p>
                        ) : (
                          <>
                            {communes.units.map((commune) => {
                              const active = value.communeCode === commune.code
                              return (
                                <button
                                  key={commune.code}
                                  type="button"
                                  aria-pressed={active}
                                  className={cn(
                                    styles.row,
                                    styles.communeRow,
                                    active && styles.rowSelected,
                                  )}
                                  onClick={() =>
                                    onChange({
                                      provinceCode: unit.code,
                                      communeCode: active ? '' : commune.code,
                                      state: 'grouped',
                                    })
                                  }
                                >
                                  {active ? <CheckIcon size={13} className={styles.check} /> : null}
                                  <span className={styles.name}>
                                    {commune.name ?? commune.code}
                                  </span>
                                  <span className={styles.count}>{number(commune.placeCount)}</span>
                                </button>
                              )
                            })}
                          </>
                        )
                      }
                    </AsyncBoundary>
                  ) : null}
                </div>
              )
            })}

            {/*
              The places that cannot enter the hierarchy, kept apart rather than
              filed under a commune nobody verified. Its own row, its own filter,
              and a breakdown of why — `NEEDS_REVIEW` is the resolver unable to
              decide, `STALE` is the dataset moving underneath a mapping, and
              `INVALID_HIERARCHY` is two codes that are each real and do not
              belong together.
            */}
            <div className={styles.reviewRow}>
              <button
                type="button"
                aria-pressed={value.state === 'review'}
                className={cn(styles.row, value.state === 'review' && styles.rowSelected)}
                onClick={() =>
                  onChange(
                    value.state === 'review'
                      ? NO_SELECTION
                      : { provinceCode: '', communeCode: '', state: 'review' },
                  )
                }
              >
                {value.state === 'review' ? <CheckIcon size={13} className={styles.check} /> : null}
                <span className={styles.name}>{t('places.hierarchy.unresolved')}</span>
                <span className={styles.count}>{number(summary.totals.review)}</span>
              </button>
              {summary.totals.review > 0 ? (
                <p className={styles.reviewBreakdown}>
                  {(['NEEDS_REVIEW', 'UNMAPPED', 'STALE', 'REJECTED', 'INVALID_HIERARCHY'] as const)
                    .filter((bucket) => summary.review.byStatus[bucket] > 0)
                    .map((bucket) => (
                      <span key={bucket}>
                        {t(`places.hierarchy.bucket.${bucket}` as const)}:{' '}
                        {number(summary.review.byStatus[bucket])}
                      </span>
                    ))}
                </p>
              ) : null}
            </div>

            {value.state !== null ? (
              <div className={styles.clear}>
                <Button size="sm" variant="ghost" onClick={() => onChange(NO_SELECTION)}>
                  {t('places.hierarchy.clear')}
                </Button>
              </div>
            ) : null}

            <p className={styles.footer}>{t('places.hierarchy.note')}</p>
          </div>
        )}
      </AsyncBoundary>
    </section>
  )
}
