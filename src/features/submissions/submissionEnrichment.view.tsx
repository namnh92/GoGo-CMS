import type { ReactNode } from 'react'
import type { Schemas } from '@/shared/api/generated'
import { formatNumber } from '@/shared/format'
import { useI18n } from '@/shared/i18n/i18n'
import { AsyncBoundary, EmptyState } from '@/shared/ui/State'
import { useQuery } from '@tanstack/react-query'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import { queryKeys } from '@/shared/api/queryKeys'
import { styles } from './submissionEnrichment.style'

/** Read-only until BE declares a per-fact selection on review/decide (#284). */
export function SubmissionEnrichment({
  enrichment,
}: {
  enrichment?: Schemas['ContributionEnrichment']
}) {
  const { t, locale } = useI18n()
  const taxonomy = useQuery({
    queryKey: queryKeys.taxonomies.all,
    queryFn: ({ signal }) => fetchTaxonomies({}, signal),
    enabled: Boolean(enrichment),
    staleTime: 5 * 60_000,
  })
  const label = (kind: Schemas['CmsTaxonomy']['kind'], key: string) => {
    const item = taxonomy.data?.find((row) => row.kind === kind && row.key === key)
    return (
      item?.labels[locale] ?? item?.labels.vi ?? t('submissions.wizard.unknownTaxonomy', { key })
    )
  }
  const chips = (kind: Schemas['CmsTaxonomy']['kind'], keys: string[]) => (
    <div className={styles.chips}>
      {keys.map((key) => (
        <span className={styles.chip} key={key}>
          {label(kind, key)}
        </span>
      ))}
    </div>
  )
  const row = (title: string, value: ReactNode, key?: string) => (
    <div className={styles.row} key={key}>
      <dt className={styles.label}>{title}</dt>
      <dd>{value}</dd>
    </div>
  )
  return (
    <section className={styles.section} aria-label={t('submissions.wizard.title')}>
      <h3 className={styles.title}>{t('submissions.wizard.title')}</h3>
      {!enrichment ? (
        <EmptyState title={t('submissions.wizard.empty')} hint={null} />
      ) : (
        <>
          <p className={styles.warning} role="note">
            {t('submissions.wizard.contractGap')}
          </p>
          <AsyncBoundary
            status={taxonomy.status}
            error={taxonomy.error}
            data={taxonomy.data}
            onRetry={() => void taxonomy.refetch()}
          >
            {() => (
              <dl className={styles.facts}>
                {enrichment.price
                  ? row(
                      t('submissions.wizard.price'),
                      enrichment.price.unit === 'free'
                        ? t('priceUnit.free')
                        : `${formatNumber(enrichment.price.min, locale)}–${formatNumber(enrichment.price.max, locale)} ${enrichment.price.currency} / ${t(`priceUnit.${enrichment.price.unit}`)}`,
                    )
                  : null}
                {enrichment.purposeKeys.length
                  ? row(
                      t('submissions.wizard.purposes'),
                      chips('suitability', enrichment.purposeKeys),
                    )
                  : null}
                {enrichment.vibeKeys.length
                  ? row(t('submissions.wizard.vibes'), chips('mood', enrichment.vibeKeys))
                  : null}
                {Object.entries(enrichment.amenities ?? {}).map(([key, present]) =>
                  row(
                    label('amenity', key),
                    t(present ? 'submissions.wizard.yes' : 'submissions.wizard.no'),
                    key,
                  ),
                )}
                {enrichment.recommendedDishes
                  ? row(
                      t('submissions.wizard.dishes'),
                      <p className={styles.note}>{enrichment.recommendedDishes}</p>,
                    )
                  : null}
                {enrichment.visitTips
                  ? row(
                      t('submissions.wizard.tips'),
                      <p className={styles.note}>{enrichment.visitTips}</p>,
                    )
                  : null}
                {(['service', 'space'] as const).map((kind) => {
                  const rating = enrichment[kind]
                  return rating
                    ? row(
                        t(`submissions.wizard.${kind}`),
                        <>
                          {formatNumber(rating.rating, locale)} / 5{' '}
                          {chips('checkin_tag', rating.chipKeys)}
                        </>,
                        kind,
                      )
                    : null
                })}
              </dl>
            )}
          </AsyncBoundary>
        </>
      )}
    </section>
  )
}
