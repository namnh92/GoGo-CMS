import { useEffect, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { formatDateTime, formatNumber } from '@/shared/format'
import { Modal } from '@/shared/ui/Overlay'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { ErrorState } from '@/shared/ui/State'
import type {
  CmsPlaceDetail,
  CmsProviderPreview,
  PlaceSource,
  ProviderPreviewTier,
} from '@/shared/api/contracts'
import { previewProviderContent } from './api'
import { styles } from './providerPreview.style'

/**
 * GoGo-BE#341 / CMS#98 — "Xem dữ liệu Google hiện tại".
 *
 * One live Place Details request, rendered beside what GoGo holds, then
 * discarded. The answer lives in this dialog's mutation state and nowhere
 * else: no query cache, no local storage, no "apply" button that would copy
 * Google's value into a GoGo field. A moderator who wants GoGo's record to
 * change types the value into the editor form, and the row carries their
 * authorship (ADR-0006 §9.7).
 *
 * The tier is the moderator's decision, made before the fetch, because it is
 * also the price: `core` is a Pro request, `quality` an Enterprise one.
 */
export function ProviderPreviewDialog({
  open,
  onClose,
  place,
  source,
}: {
  open: boolean
  onClose: () => void
  place: CmsPlaceDetail
  /** The place's Google identity row; the dialog is not offered without one. */
  source: PlaceSource
}) {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()
  const [tier, setTier] = useState<ProviderPreviewTier>('core')

  const preview = useMutation({
    mutationFn: () => previewProviderContent(place.id, tier),
  })

  // Closing the dialog is the discard: nothing outlives it.
  useEffect(() => {
    if (!open) preview.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const answer = preview.data

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('placeEditor.providerPreview.title')}
      description={t('placeEditor.providerPreview.description')}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('action.close')}
        </Button>
      }
    >
      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold text-text-muted">
          {t('placeEditor.providerPreview.tier')}
        </legend>
        <div className={styles.tierRow} role="radiogroup">
          <TierOption
            selected={tier === 'core'}
            onSelect={() => setTier('core')}
            label={t('placeEditor.providerPreview.tierCore')}
            hint={t('placeEditor.providerPreview.tierCoreHint')}
          />
          <TierOption
            selected={tier === 'quality'}
            onSelect={() => setTier('quality')}
            label={t('placeEditor.providerPreview.tierQuality')}
            hint={t('placeEditor.providerPreview.tierQualityHint')}
          />
        </div>
        <p className={styles.cost}>{t('placeEditor.providerPreview.cost')}</p>
      </fieldset>

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          loading={preview.isPending}
          onClick={() => preview.mutate()}
        >
          {answer
            ? t('placeEditor.providerPreview.refetch')
            : t('placeEditor.providerPreview.fetch')}
        </Button>
      </div>

      {preview.isError ? (
        <div className="mt-4">
          <ErrorState error={preview.error} onRetry={() => preview.mutate()} />
        </div>
      ) : null}

      {!answer && !preview.isError ? (
        <p className={styles.idle}>{t('placeEditor.providerPreview.idle')}</p>
      ) : null}

      {answer ? (
        <PreviewAnswer
          answer={answer}
          place={place}
          source={source}
          fetchedAt={formatDateTime(answer.fetchedAt, locale)}
          statusLabel={(status) => label(`businessStatus.${status}`, status)}
          sourceStatusLabel={(status) => label(`sourceStatus.${status}`, status)}
          formatCount={(n) => formatNumber(n, locale)}
        />
      ) : null}
    </Modal>
  )
}

function TierOption({
  selected,
  onSelect,
  label,
  hint,
}: {
  selected: boolean
  onSelect: () => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`${styles.tierButton} ${selected ? styles.tierSelected : styles.tierIdle}`}
      onClick={onSelect}
    >
      <span className={styles.tierLabel}>
        {/* Selection is never colour alone. */}
        <span aria-hidden="true">{selected ? '●' : '○'}</span>
        {label}
      </span>
      <span className={styles.tierHint}>{hint}</span>
    </button>
  )
}

function PreviewAnswer({
  answer,
  place,
  source,
  fetchedAt,
  statusLabel,
  sourceStatusLabel,
  formatCount,
}: {
  answer: CmsProviderPreview
  place: CmsPlaceDetail
  source: PlaceSource
  fetchedAt: string
  statusLabel: (status: string) => string
  sourceStatusLabel: (status: string) => string
  formatCount: (n: number) => string
}) {
  const t = useT()
  const meta = (
    <p className={styles.meta}>
      {t('placeEditor.providerPreview.fetchedAt', {
        time: fetchedAt,
        attribution: answer.attribution,
      })}
    </p>
  )
  const ephemeral = <p className={styles.ephemeral}>{t('placeEditor.providerPreview.ephemeral')}</p>

  if (answer.outcome !== 'found' || !answer.provider) {
    return (
      <>
        <p className={styles.notice} role="status">
          {answer.outcome === 'invalid_id'
            ? t('placeEditor.providerPreview.invalidId')
            : t('placeEditor.providerPreview.notFound')}
        </p>
        {meta}
        {ephemeral}
      </>
    )
  }

  const p = answer.provider
  const notFetched = (
    <span className={styles.tdEmpty}>{t('placeEditor.providerPreview.notFetched')}</span>
  )
  const empty = <span className={styles.tdEmpty}>{t('placeEditor.providerPreview.empty')}</span>
  const gogoRating = place.ratings.provider
  const coords = (lat: number | null | undefined, lng: number | null | undefined) =>
    lat == null || lng == null ? null : `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  const rating = (r: number | null | undefined, count: number | null | undefined) =>
    r == null
      ? null
      : `${r.toFixed(1)} · ${t('placeEditor.ratingCount', { count: formatCount(count ?? 0) })}`

  const rows: {
    key: string
    label: string
    gogo: string | null
    google: ReactNode
    googleText: string | null
  }[] = [
    {
      key: 'name',
      label: t('placeEditor.name'),
      gogo: place.name,
      google: p.name,
      googleText: p.name,
    },
    {
      key: 'address',
      label: t('placeEditor.address'),
      gogo: place.addressText ?? null,
      google: p.addressText || empty,
      googleText: p.addressText || null,
    },
    {
      key: 'coordinates',
      label: t('placeEditor.providerPreview.fieldCoordinates'),
      gogo: coords(place.lat, place.lng),
      google: coords(p.location.lat, p.location.lng),
      googleText: coords(p.location.lat, p.location.lng),
    },
    {
      key: 'status',
      label: t('placeEditor.providerPreview.fieldStatus'),
      gogo: source.sourceStatus ? sourceStatusLabel(source.sourceStatus) : null,
      google: statusLabel(p.businessStatus),
      googleText: statusLabel(p.businessStatus),
    },
    {
      key: 'type',
      label: t('placeEditor.providerPreview.fieldType'),
      gogo: place.taxonomyKeys.length > 0 ? place.taxonomyKeys.join(', ') : null,
      google: p.primaryType ?? empty,
      googleText: p.primaryType,
    },
    {
      key: 'rating',
      label: t('placeEditor.ratingProvider'),
      gogo: rating(gogoRating.rating, gogoRating.count),
      google: p.quality ? (rating(p.quality.rating, p.quality.ratingCount) ?? empty) : notFetched,
      googleText: p.quality ? rating(p.quality.rating, p.quality.ratingCount) : null,
    },
    {
      key: 'hours',
      label: t('placeEditor.hours'),
      gogo: t('placeEditor.providerPreview.hoursCount', { count: formatCount(place.hours.length) }),
      google: p.quality
        ? t('placeEditor.providerPreview.hoursCount', {
            count: formatCount(p.quality.hours.length),
          })
        : notFetched,
      googleText: p.quality
        ? t('placeEditor.providerPreview.hoursCount', {
            count: formatCount(p.quality.hours.length),
          })
        : null,
    },
    {
      key: 'priceLevel',
      label: t('placeEditor.priceLevel'),
      gogo: place.priceLevel != null ? `${place.priceLevel}/4` : null,
      google: p.quality
        ? p.quality.priceLevel != null
          ? `${p.quality.priceLevel}/4`
          : empty
        : notFetched,
      googleText: p.quality && p.quality.priceLevel != null ? `${p.quality.priceLevel}/4` : null,
    },
  ]

  return (
    <>
      {p.moved ? (
        <p className={styles.notice} role="status">
          {t('placeEditor.providerPreview.moved', { id: p.googlePlaceId })}
        </p>
      ) : null}
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.th}>
              {t('placeEditor.providerPreview.colField')}
            </th>
            <th scope="col" className={styles.th}>
              {t('placeEditor.providerPreview.colGogo')}
            </th>
            <th scope="col" className={styles.th}>
              {t('placeEditor.providerPreview.colGoogle')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const differs =
              row.googleText !== null && row.gogo !== null && row.googleText !== row.gogo
            return (
              <tr key={row.key}>
                <th scope="row" className={`${styles.td} ${styles.tdLabel}`}>
                  {row.label}
                </th>
                <td className={styles.td}>{row.gogo ?? empty}</td>
                <td className={styles.td}>
                  {row.google}
                  {differs ? (
                    <Badge tone="amber" className={styles.differs}>
                      {t('placeEditor.providerPreview.differs')}
                    </Badge>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {meta}
      {ephemeral}
    </>
  )
}
