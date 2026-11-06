import { useQuery } from '@tanstack/react-query'
import { fetchTaxonomies } from '@/features/taxonomy/api'
import { queryKeys } from '@/shared/api/queryKeys'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/Button'
import { AsyncBoundary, EmptyState } from '@/shared/ui/State'
import { styles } from './placeList.style'

export function AmenityFilter({
  value,
  onChange,
}: {
  value: string[]
  onChange: (keys: string[]) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const query = useQuery({
    queryKey: [...queryKeys.taxonomies.byKind('amenity'), { isActive: true }],
    queryFn: ({ signal }) => fetchTaxonomies({ kind: 'amenity', isActive: true }, signal),
  })
  const options = (query.data ?? []).filter((item) => item.kind === 'amenity' && item.isActive)
  const label = (key: string) => {
    const item = options.find((option) => option.key === key)
    return item?.labels[locale] || item?.labels.vi || key
  }

  return (
    <fieldset className={styles.amenityFilter}>
      <legend className={styles.amenityLegend}>{t('places.filter.amenities')}</legend>
      <p className={styles.muted}>{t('places.filter.amenitiesHint')}</p>
      <AsyncBoundary
        status={query.status}
        error={query.error}
        data={options}
        isEmpty={(items) => items.length === 0}
        empty={<EmptyState title={t('places.filter.amenitiesEmpty')} />}
        onRetry={() => void query.refetch()}
      >
        {(items) => (
          <div className={styles.amenityOptions}>
            {items.map((item) => (
              <label key={item.key} className={styles.amenityOption}>
                <input
                  type="checkbox"
                  checked={value.includes(item.key)}
                  disabled={value.length >= 10 && !value.includes(item.key)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, item.key]
                        : value.filter((key) => key !== item.key),
                    )
                  }
                />
                {label(item.key)}
              </label>
            ))}
          </div>
        )}
      </AsyncBoundary>
      {value.length > 0 && (
        <div
          role="group"
          className={styles.amenityOptions}
          aria-label={t('places.filter.amenitiesActive')}
        >
          {value.map((key) => (
            <Button
              key={key}
              variant="secondary"
              className={styles.amenityChip}
              aria-label={t('places.filter.removeAmenity', { label: label(key) })}
              onClick={() => onChange(value.filter((item) => item !== key))}
            >
              {label(key)} <span aria-hidden="true">×</span>
            </Button>
          ))}
          <Button variant="ghost" onClick={() => onChange([])}>
            {t('places.filter.clearAmenities')}
          </Button>
        </div>
      )}
    </fieldset>
  )
}
