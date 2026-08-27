import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
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
import { styles } from './duplicateQueue.style'

/** Which side of the pair the operator wants to keep. */
type Direction = 'a' | 'b'

export function DuplicateQueue() {
  const t = useT()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()
  const [pending, setPending] = useState<DuplicatePair | null>(null)
  const [swapped, setSwapped] = useState<Record<string, boolean>>({})

  const query = useQuery({
    queryKey: queryKeys.places.duplicates,
    queryFn: ({ signal }) => fetchDuplicates(signal),
  })

  const pairKey = (pair: DuplicatePair) => `${pair.canonicalId}:${pair.duplicateId}`

  const sideOf = useMemo(
    () =>
      (
        pair: DuplicatePair,
      ): { keepId: string; keepName: string; dropId: string; dropName: string } => {
        const direction: Direction = swapped[pairKey(pair)] ? 'b' : 'a'
        return direction === 'a'
          ? {
              keepId: pair.canonicalId,
              keepName: pair.canonicalName,
              dropId: pair.duplicateId,
              dropName: pair.duplicateName,
            }
          : {
              keepId: pair.duplicateId,
              keepName: pair.duplicateName,
              dropId: pair.canonicalId,
              dropName: pair.canonicalName,
            }
      },
    [swapped],
  )

  const merge = useMutation({
    mutationFn: (pair: DuplicatePair) => {
      const { keepId, dropId } = sideOf(pair)
      return mergePlace(keepId, dropId)
    },
    onSuccess: () => {
      toast.success(t('duplicates.mergeConfirm'))
      setPending(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changesFor = (pair: DuplicatePair): ChangeLine[] => {
    const { keepName, dropName } = sideOf(pair)
    return [
      {
        label: t('duplicates.moves'),
        from: dropName,
        to: keepName,
        // The endpoint returns two ids, two names, a similarity and a
        // distance — no counts. Naming the relations beats inventing numbers.
        note: t('duplicates.movesUnknown'),
      },
      {
        label: t('duplicates.archived'),
        from: dropName,
        to: t('placeStatus.archived'),
        note: t('duplicates.mergeExplain'),
      },
    ]
  }

  return (
    <Card>
      <CardHeader title={t('duplicates.title')} hint={t('duplicates.hint')} />
      <CardBody>
        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={query.data ?? []}
          isEmpty={(items) => items.length === 0}
          onRetry={() => void query.refetch()}
          empty={<EmptyState title={t('duplicates.empty')} hint={null} />}
        >
          {(pairs) => (
            <ul className={styles.list}>
              {pairs.map((pair) => {
                const key = pairKey(pair)
                const { keepName, dropName } = sideOf(pair)
                return (
                  <li key={key} className={styles.pair}>
                    <div className={styles.pairHead}>
                      <p className={styles.pairTitle}>{keepName}</p>
                      <div className="flex items-center gap-3">
                        {pair.distanceMeters != null ? (
                          <Badge tone="neutral">
                            {t('placeEditor.distance', { meters: Math.round(pair.distanceMeters) })}
                          </Badge>
                        ) : null}
                        <ConfidenceMeter
                          value={pair.similarity}
                          label={t('duplicates.similarity')}
                        />
                      </div>
                    </div>

                    <div className={styles.grid}>
                      <div className={styles.side}>
                        <p className={styles.sideLabel}>{t('duplicates.canonical')}</p>
                        <p className={styles.name}>{keepName}</p>
                      </div>
                      <div className={styles.side}>
                        <p className={styles.sideLabel}>{t('duplicates.duplicate')}</p>
                        <p className={styles.name}>{dropName}</p>
                      </div>
                    </div>

                    <div className={styles.footer}>
                      <p className={styles.hint}>{t('duplicates.swapHint')}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setSwapped((current) => ({ ...current, [key]: !current[key] }))
                          }
                        >
                          {t('duplicates.swap')}
                        </Button>
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
                    </div>
                  </li>
                )
              })}
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
