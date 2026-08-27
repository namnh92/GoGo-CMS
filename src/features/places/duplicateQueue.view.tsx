import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatNumber } from '@/shared/format'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { ConfidenceMeter } from '@/shared/ui/Progress'
import { ConfirmDialog, type ChangeLine } from '@/shared/ui/Overlay'
import { AsyncBoundary, EmptyState, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { MergeIcon } from '@/shared/ui/icons'
import type { DuplicatePair } from '@/shared/api/contracts'
import { fetchDuplicates, mergePlace } from './api'
import { PlaceStatusBadge } from './status'
import { styles } from './duplicateQueue.style'

export function DuplicateQueue() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()
  const [pending, setPending] = useState<DuplicatePair | null>(null)

  const query = useQuery({
    queryKey: queryKeys.places.duplicates,
    queryFn: ({ signal }) => fetchDuplicates(signal),
  })

  const merge = useMutation({
    mutationFn: (pair: DuplicatePair) => mergePlace(pair.canonical.id, pair.duplicate.id),
    onSuccess: () => {
      toast.success(t('duplicates.mergeConfirm'))
      setPending(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changesFor = (pair: DuplicatePair): ChangeLine[] => [
    {
      label: t('duplicates.moves'),
      note: [
        `${t('placeEditor.sources')}: ${formatNumber(pair.moves.sources, locale)}`,
        `${t('placeEditor.media')}: ${formatNumber(pair.moves.media, locale)}`,
        `${t('placeEditor.prices')}: ${formatNumber(pair.moves.prices, locale)}`,
      ].join(' · '),
      from: pair.duplicate.name,
      to: pair.canonical.name,
    },
    {
      label: t('duplicates.archived'),
      from: t(`placeStatus.${pair.duplicate.status}` as const),
      to: t('placeStatus.archived'),
      note: t('duplicates.mergeExplain'),
    },
  ]

  return (
    <Card>
      <CardHeader title={t('duplicates.title')} hint={t('duplicates.hint')} />
      <CardBody>
        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={query.data?.items ?? []}
          isEmpty={(items) => items.length === 0}
          onRetry={() => void query.refetch()}
          empty={<EmptyState title={t('duplicates.empty')} hint={null} />}
        >
          {(pairs) => (
            <ul className={styles.list}>
              {pairs.map((pair) => (
                <li key={`${pair.canonical.id}:${pair.duplicate.id}`} className={styles.pair}>
                  <div className={styles.pairHead}>
                    <p className={styles.pairTitle}>{pair.canonical.name}</p>
                    <div className="flex items-center gap-3">
                      {pair.sharedProviderId ? <Badge tone="danger">provider id</Badge> : null}
                      {pair.distanceMeters != null ? (
                        <Badge tone="neutral">
                          {t('placeEditor.distance', { meters: Math.round(pair.distanceMeters) })}
                        </Badge>
                      ) : null}
                      <ConfidenceMeter value={pair.similarity} label={t('duplicates.similarity')} />
                    </div>
                  </div>

                  <div className={styles.grid}>
                    <div className={styles.side}>
                      <p className={styles.sideLabel}>{t('duplicates.canonical')}</p>
                      <p className={styles.name}>{pair.canonical.name}</p>
                      <p className={styles.meta}>{pair.canonical.addressText ?? '—'}</p>
                      <div className="mt-2">
                        <PlaceStatusBadge status={pair.canonical.status} />
                      </div>
                    </div>
                    <div className={styles.side}>
                      <p className={styles.sideLabel}>{t('duplicates.duplicate')}</p>
                      <p className={styles.name}>{pair.duplicate.name}</p>
                      <p className={styles.meta}>{pair.duplicate.addressText ?? '—'}</p>
                      <div className="mt-2">
                        <PlaceStatusBadge status={pair.duplicate.status} />
                      </div>
                    </div>
                  </div>

                  <div className={styles.moves}>
                    <span className={styles.moveChip}>
                      {t('placeEditor.sources')} {formatNumber(pair.moves.sources, locale)}
                    </span>
                    <span className={styles.moveChip}>
                      {t('placeEditor.media')} {formatNumber(pair.moves.media, locale)}
                    </span>
                    <span className={styles.moveChip}>
                      {t('placeEditor.prices')} {formatNumber(pair.moves.prices, locale)}
                    </span>
                  </div>

                  <div className={styles.footer}>
                    <p className={styles.hint}>{t('duplicates.mergeExplain')}</p>
                    <Button
                      size="sm"
                      variant="primary"
                      iconLeft={<MergeIcon size={14} />}
                      disabled={!can('place.merge') || !online}
                      onClick={() => setPending(pair)}
                    >
                      {t('placeEditor.merge')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </CardBody>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && merge.mutate(pending)}
        title={t('duplicates.mergePreview')}
        description={t('duplicates.mergeExplain')}
        changes={pending ? changesFor(pending) : []}
        confirmLabel={t('duplicates.mergeConfirm')}
        tone="primary"
        loading={merge.isPending}
      />
    </Card>
  )
}
