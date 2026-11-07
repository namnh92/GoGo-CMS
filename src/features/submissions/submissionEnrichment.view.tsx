import type { ReactNode } from 'react'
import type { Schemas } from '@/shared/api/generated'
import { formatNumber } from '@/shared/format'
import { useI18n } from '@/shared/i18n/i18n'
import { AsyncBoundary, EmptyState } from '@/shared/ui/State'
import { useQuery } from '@tanstack/react-query'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import { queryKeys } from '@/shared/api/queryKeys'
import { styles } from './submissionEnrichment.style'

export function SubmissionEnrichment({
  enrichment,
  factKeys = [],
  excludedKeys = [],
  canSelect = false,
  disabled = false,
  onToggle,
}: {
  enrichment?: Schemas['ContributionEnrichment']
  factKeys?: string[]
  excludedKeys?: string[]
  canSelect?: boolean
  disabled?: boolean
  onToggle?: (key: string) => void
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
  const facts: { key: string; title: string; value: ReactNode }[] = []
  const add = (key: string, title: string, value: ReactNode) => facts.push({ key, title, value })
  if (enrichment) {
    if (enrichment.price) {
      const price = enrichment.price
      add(
        'price',
        t('submissions.wizard.price'),
        price.unit === 'free'
          ? t('priceUnit.free')
          : `${formatNumber(price.min, locale)}–${formatNumber(price.max, locale)} ${price.currency} / ${t(`priceUnit.${price.unit}`)}`,
      )
    }
    for (const key of enrichment.purposeKeys)
      add(`purposeKeys:${key}`, t('submissions.wizard.purposes'), label('suitability', key))
    for (const key of enrichment.vibeKeys)
      add(`vibeKeys:${key}`, t('submissions.wizard.vibes'), label('mood', key))
    for (const [key, present] of Object.entries(enrichment.amenities ?? {}))
      add(
        `amenities:${key}`,
        label('amenity', key),
        t(present ? 'submissions.wizard.yes' : 'submissions.wizard.no'),
      )
    if (enrichment.recommendedDishes)
      add('recommendedDishes', t('submissions.wizard.dishes'), enrichment.recommendedDishes)
    if (enrichment.visitTips) add('visitTips', t('submissions.wizard.tips'), enrichment.visitTips)
    for (const kind of ['service', 'space'] as const) {
      const rating = enrichment[kind]
      if (!rating) continue
      add(
        `${kind}.rating`,
        t(`submissions.wizard.${kind}`),
        `${formatNumber(rating.rating, locale)} / 5`,
      )
      for (const key of rating.chipKeys)
        add(
          `${kind}.chipKeys:${key}`,
          `${t(`submissions.wizard.${kind}`)}: ${label('checkin_tag', key)}`,
          label('checkin_tag', key),
        )
    }
  }
  return (
    <section className={styles.section} aria-label={t('submissions.wizard.title')}>
      <h3 className={styles.title}>{t('submissions.wizard.title')}</h3>
      {!enrichment || facts.length === 0 ? (
        <EmptyState title={t('submissions.wizard.empty')} hint={null} />
      ) : (
        <AsyncBoundary
          status={taxonomy.status}
          error={taxonomy.error}
          data={taxonomy.data}
          onRetry={() => void taxonomy.refetch()}
        >
          {() => (
            <>
              {canSelect ? <p>{t('submissions.wizard.selectionHint')}</p> : null}
              <dl className={styles.facts}>
                {facts.map(({ key, title, value }) => (
                  <div className={styles.row} key={key}>
                    <dt className={styles.label}>{title}</dt>
                    <dd className={styles.note}>{value}</dd>
                    {canSelect && factKeys.includes(key) ? (
                      <dd>
                        <label className={styles.selection}>
                          <input
                            type="checkbox"
                            checked={!excludedKeys.includes(key)}
                            disabled={disabled}
                            onChange={() => onToggle?.(key)}
                          />
                          {t('submissions.wizard.keepFact', {
                            fact: typeof value === 'string' ? `${title}: ${value}` : title,
                          })}
                        </label>
                      </dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            </>
          )}
        </AsyncBoundary>
      )}
    </section>
  )
}
