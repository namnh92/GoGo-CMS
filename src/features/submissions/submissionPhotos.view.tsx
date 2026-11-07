import { useEffect, useState } from 'react'
import type { Schemas } from '@/shared/api/generated'
import { ApiError, toApiError } from '@/shared/api/errors'
import { useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Overlay'
import { ErrorState, LoadingState } from '@/shared/ui/State'
import { fetchSubmissionPhoto } from './api'
import { styles } from './submissionPhotos.style'

export function SubmissionPhotos({
  submissionId,
  photos,
  canPreview,
  canSelect,
  disabled,
  excludedIds,
  onToggle,
}: {
  submissionId: string
  photos: Schemas['SubmissionPhoto'][]
  canPreview: boolean
  canSelect: boolean
  disabled: boolean
  excludedIds: string[]
  onToggle: (id: string) => void
}) {
  const t = useT()
  return (
    <section className={styles.section} aria-label={t('submissions.photos.title')}>
      <h3 className={styles.title}>{t('submissions.photos.title')}</h3>
      <p className={styles.hint}>{t('submissions.photos.hint')}</p>
      {photos.length === 0 ? (
        <p>{t('submissions.photos.empty')}</p>
      ) : (
        <div className={styles.grid}>
          {photos.map((photo, index) => (
            <SubmissionPhoto
              key={`${photo.id}:${photo.url ?? ''}:${photo.status}`}
              submissionId={submissionId}
              photo={photo}
              index={index + 1}
              canPreview={canPreview}
              canSelect={canSelect}
              disabled={disabled}
              selected={!excludedIds.includes(photo.id)}
              onToggle={() => onToggle(photo.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SubmissionPhoto({
  submissionId,
  photo,
  index,
  canPreview,
  canSelect,
  disabled,
  selected,
  onToggle,
}: {
  submissionId: string
  photo: Schemas['SubmissionPhoto']
  index: number
  canPreview: boolean
  canSelect: boolean
  disabled: boolean
  selected: boolean
  onToggle: () => void
}) {
  const t = useT()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const available = canPreview && photo.status === 'pending' && photo.url !== null
  const label = t('submissions.photos.image', { n: String(index) })

  // No query/browser cache for private image bytes. Abort and revoke on retry,
  // close, submission change or decision; the same blob serves the enlarged view.
  useEffect(() => {
    if (!available) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    setUrl(null)
    setError(null)
    void fetchSubmissionPhoto(submissionId, photo.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return
        if (blob.type !== 'image/webp') throw new Error('Unexpected photo content type')
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof ApiError
              ? cause
              : new ApiError({
                  code: 'PHOTO_UNAVAILABLE',
                  message: 'Photo unavailable',
                  status: 422,
                }),
          )
        }
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [submissionId, photo.id, available, attempt])

  const image = (large: boolean) => (
    <img
      src={url!}
      alt={label}
      className={large ? styles.largeImage : styles.image}
      onError={() => {
        setExpanded(false)
        setError(
          new ApiError({ code: 'PHOTO_UNAVAILABLE', message: 'Photo unavailable', status: 404 }),
        )
      }}
    />
  )

  return (
    <div className={styles.card}>
      {!available ? (
        <p>
          {t(
            photo.status === 'pending'
              ? 'submissions.photos.unavailable'
              : `submissions.photos.${photo.status}`,
          )}
        </p>
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={
            toApiError(error).isForbidden ? undefined : () => setAttempt((value) => value + 1)
          }
        />
      ) : url ? (
        <Button
          variant="ghost"
          onClick={() => setExpanded(true)}
          aria-label={t('submissions.photos.enlarge', { n: String(index) })}
        >
          {image(false)}
        </Button>
      ) : (
        <LoadingState label={t('submissions.photos.loading')} />
      )}
      {available && error && toApiError(error).isNetwork ? (
        <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
          {t('state.retry')}
        </Button>
      ) : null}
      {canSelect && photo.status === 'pending' ? (
        <label className={styles.selection}>
          <input type="checkbox" checked={selected} disabled={disabled} onChange={onToggle} />
          {t('submissions.photos.keep', { n: String(index) })}
        </label>
      ) : null}
      <Modal
        open={available && expanded && Boolean(url) && !error}
        onClose={() => setExpanded(false)}
        title={label}
      >
        {url ? image(true) : null}
      </Modal>
    </div>
  )
}
