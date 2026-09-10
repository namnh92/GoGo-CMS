import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useOnline } from '@/shared/ui/useOnline'
import { formatBytes, formatDateTime } from '@/shared/format'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button, IconButton } from '@/shared/ui/Button'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import { Badge, StatusBadge, type Tone } from '@/shared/ui/Badge'
import { ConfirmDialog, Modal } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { ProgressBar } from '@/shared/ui/Progress'
import { useToast } from '@/shared/ui/Toast'
import {
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  RetryIcon,
  StarIcon,
  TrashIcon,
} from '@/shared/ui/icons'
import { PLACE_MEDIA_LIMITS } from '@/shared/api/cmsPlaceContract'
import {
  cmsUploadContentTypeSchema,
  placeMediaModerationSchema,
  type AttachableMedia,
  type PlaceMedia,
  type PlaceMediaModeration,
} from '@/shared/api/contracts'
import { toApiError } from '@/shared/api/errors'
import { authorizeUpload, putUploadBytesTracked } from '@/features/media/api'
import {
  attachPlaceMedia,
  detachPlaceMedia,
  fetchAttachableMedia,
  updatePlaceMedia,
  type UpdatePlaceMediaInput,
} from './api'
import { styles } from './placeMedia.style'

const ACCEPT = cmsUploadContentTypeSchema.options.join(',')
const DECISIONS = placeMediaModerationSchema.options

const MODERATION_TONE: Record<string, Tone> = {
  pending: 'amber',
  approved: 'mint',
  rejected: 'danger',
}

/** Colour is never the only signal, so each decision also carries a glyph. */
const MODERATION_SHAPE = {
  pending: 'clock',
  approved: 'check',
  rejected: 'alert',
} as const

/**
 * A blob URL, or null where the browser will not make one.
 *
 * jsdom has no `createObjectURL`, and a locked-down profile can throw. Neither
 * is a reason to lose the upload — the queue row simply shows no thumbnail.
 */
function createObjectUrl(file: File): string | null {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
    return URL.createObjectURL(file)
  } catch {
    return null
  }
}

function revokeObjectUrl(url: string | null): void {
  if (!url) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Already revoked, or a browser that never made one. Nothing to undo.
  }
}

/**
 * Pixel dimensions, best effort.
 *
 * The bytes never cross the API, so the server cannot report them — only
 * something that has read the object can, and in this flow that is the
 * browser. A decode that never finishes must not strand the upload, hence the
 * timeout: `width`/`height` are nullable on the wire precisely because they
 * are not always knowable.
 */
function probeImageSize(url: string | null): Promise<{ width: number; height: number } | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: { width: number; height: number } | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), 3_000)
    const image = new Image()
    image.onload = () => {
      clearTimeout(timer)
      finish(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null,
      )
    }
    image.onerror = () => {
      clearTimeout(timer)
      finish(null)
    }
    image.src = url
  })
}

type QueueStage = 'uploading' | 'attaching' | 'done' | 'error'

/**
 * A thumbnail that degrades to words when the bytes will not load.
 *
 * `url` being non-null only says the server composed one; it does not say the
 * object is there. On an environment where catalogue media is written to one
 * bucket and the public host serves another, every one of these URLs resolves
 * and 404s — and a broken-image glyph tells an editor nothing about which of
 * "no photo", "no hosting" or "hosting is misconfigured" they are looking at.
 * `.claude/rules/core.md` #15: an absence is stated, never placeholdered.
 */
function Thumb({
  src,
  alt,
  className,
  fallbackClassName,
}: {
  src: string
  alt: string
  className: string
  fallbackClassName: string
}) {
  const t = useT()
  const [failed, setFailed] = useState(false)

  // A new src is a new claim: a row that failed before must be allowed to load
  // once the key, or the environment, changes.
  useEffect(() => setFailed(false), [src])

  if (failed) {
    return (
      <span className={fallbackClassName} title={src}>
        {t('placeMedia.thumbUnavailable')}
      </span>
    )
  }
  return (
    <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />
  )
}

type QueueItem = {
  id: string
  file: File
  previewUrl: string | null
  stage: QueueStage
  /** 0..1. Real upload progress where the transport reports it, else the stage. */
  fraction: number
  error: string | null
}

/** A refusal this browser made on its own — already translated, never an ApiError. */
class LocalRefusal extends Error {}

let queueSeq = 0

/**
 * The upload queue, one independent run per file.
 *
 * Independence is the requirement, not a nicety: a queue that awaited its
 * files in sequence and threw on the first failure would discard every photo
 * behind it, and an editor who dropped eight pictures would have to work out
 * which four actually landed. Each row carries its own stage, its own progress
 * and its own retry, and nothing one row does can touch another.
 */
function useUploadQueue(placeId: string, onAttached: () => void) {
  const t = useT()
  const { locale } = useI18n()
  const describeError = useErrorMessage()
  const [items, setItems] = useState<QueueItem[]>([])
  // Effects must not depend on `items`, or revoking on unmount would fire on
  // every queue change and blank the thumbnails still on screen.
  const urlsRef = useRef<string[]>([])

  useEffect(
    () => () => {
      for (const url of urlsRef.current) revokeObjectUrl(url)
      urlsRef.current = []
    },
    [],
  )

  const patch = useCallback((id: string, changes: Partial<QueueItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }, [])

  const run = useCallback(
    async (item: QueueItem) => {
      patch(item.id, { stage: 'uploading', fraction: 0.02, error: null })
      try {
        // Both checks happen before anything is asked of the server: the
        // presigner signs for exactly one content type and refuses an
        // oversized `contentLength`, so a round-trip here would only buy a
        // less specific rejection that cannot name the file.
        const contentType = cmsUploadContentTypeSchema.safeParse(item.file.type)
        if (!contentType.success) throw new LocalRefusal(t('media.error.contentType'))
        if (item.file.size > PLACE_MEDIA_LIMITS.maxUploadBytes) {
          throw new LocalRefusal(
            t('placeMedia.error.tooLarge', {
              max: formatBytes(PLACE_MEDIA_LIMITS.maxUploadBytes, locale),
            }),
          )
        }

        const authorized = await authorizeUpload({
          purpose: 'place_image',
          contentType: contentType.data,
          contentLength: item.file.size,
        })
        await putUploadBytesTracked(
          authorized.uploadUrl,
          item.file,
          authorized.contentType,
          (fraction) => patch(item.id, { fraction: 0.05 + fraction * 0.8 }),
        )

        patch(item.id, { stage: 'attaching', fraction: 0.9 })
        const size = await probeImageSize(item.previewUrl)
        await attachPlaceMedia(placeId, {
          storageKey: authorized.key,
          width: size?.width ?? null,
          height: size?.height ?? null,
        })

        patch(item.id, { stage: 'done', fraction: 1 })
        onAttached()
      } catch (cause) {
        patch(item.id, {
          stage: 'error',
          error: cause instanceof LocalRefusal ? cause.message : describeError(cause),
        })
      }
    },
    [describeError, locale, onAttached, patch, placeId, t],
  )

  const add = useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return
      const created = files.map<QueueItem>((file) => {
        const previewUrl = createObjectUrl(file)
        if (previewUrl) urlsRef.current.push(previewUrl)
        queueSeq += 1
        return {
          id: `q-${queueSeq}`,
          file,
          previewUrl,
          stage: 'uploading',
          fraction: 0,
          error: null,
        }
      })
      setItems((current) => [...current, ...created])
      for (const item of created) void run(item)
    },
    [run],
  )

  const retry = useCallback(
    (id: string) => {
      const item = items.find((candidate) => candidate.id === id)
      if (item) void run(item)
    },
    [items, run],
  )

  const dismiss = useCallback((id: string) => {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id)
      revokeObjectUrl(item?.previewUrl ?? null)
      return current.filter((candidate) => candidate.id !== id)
    })
  }, [])

  const clearSettled = useCallback(() => {
    setItems((current) => {
      for (const item of current) {
        if (item.stage === 'done' || item.stage === 'error') revokeObjectUrl(item.previewUrl)
      }
      return current.filter((item) => item.stage !== 'done' && item.stage !== 'error')
    })
  }, [])

  return { items, add, retry, dismiss, clearSettled }
}

function UploadRow({
  item,
  onRetry,
  onDismiss,
  disabled,
}: {
  item: QueueItem
  onRetry: () => void
  onDismiss: () => void
  disabled: boolean
}) {
  const t = useT()
  const { locale } = useI18n()
  const busy = item.stage === 'uploading' || item.stage === 'attaching'
  const stageLabel =
    item.stage === 'uploading'
      ? t('placeMedia.queue.uploading')
      : item.stage === 'attaching'
        ? t('placeMedia.queue.attaching')
        : item.stage === 'done'
          ? t('placeMedia.queue.done')
          : t('placeMedia.queue.failed')

  return (
    <li
      className={[
        styles.queueItem,
        item.stage === 'error' ? styles.queueItemFailed : '',
        item.stage === 'done' ? styles.queueItemDone : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {item.previewUrl ? (
        // Decorative: the file name is announced from the row below, and a
        // second reading of it as an image label is noise, not information.
        <Thumb
          src={item.previewUrl}
          alt=""
          className={styles.queueThumb}
          fallbackClassName={styles.queueThumbFallback}
        />
      ) : (
        <span className={styles.queueThumbFallback}>{t('media.noPreview')}</span>
      )}
      <span className={styles.queueBody}>
        <span className={styles.queueName} title={item.file.name}>
          {item.file.name}
        </span>
        <span className={styles.queueMeta}>
          {/* Glyph as well as colour, so the outcome survives greyscale. */}
          <span aria-hidden="true">
            {item.stage === 'done' ? '✓' : item.stage === 'error' ? '⚠' : '↑'}
          </span>
          {stageLabel}
          <span>{formatBytes(item.file.size, locale)}</span>
        </span>
        {busy ? (
          <ProgressBar
            className="mt-1 w-full"
            value={Math.round(item.fraction * 100)}
            max={100}
            label={t('placeMedia.queue.progress', { name: item.file.name })}
          />
        ) : null}
        {item.error ? (
          <span role="alert" className={styles.queueError}>
            <span aria-hidden="true">⚠</span>
            {item.error}
          </span>
        ) : null}
      </span>
      <span className={styles.queueActions}>
        {item.stage === 'error' ? (
          <Button size="sm" variant="secondary" disabled={disabled} onClick={onRetry}>
            <RetryIcon size={14} />
            {t('placeMedia.queue.retry')}
          </Button>
        ) : null}
        <IconButton
          label={t('placeMedia.queue.remove', { name: item.file.name })}
          disabled={busy}
          onClick={onDismiss}
        >
          <TrashIcon size={16} />
        </IconButton>
      </span>
    </li>
  )
}

function AttachablePicker({
  placeId,
  open,
  onClose,
  onPick,
  pending,
}: {
  placeId: string
  open: boolean
  onClose: () => void
  onPick: (item: AttachableMedia) => void
  pending: boolean
}) {
  const t = useT()
  const { locale } = useI18n()
  const query = useQuery({
    queryKey: queryKeys.places.attachableMedia(placeId),
    queryFn: ({ signal }) => fetchAttachableMedia(placeId, signal),
    enabled: open,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('placeMedia.pickTitle')}
      description={t('placeMedia.pickDescription')}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('action.close')}
          </Button>
        </div>
      }
    >
      <AsyncBoundary
        status={query.status}
        error={query.error}
        data={query.data}
        isEmpty={(items) => items.length === 0}
        onRetry={() => void query.refetch()}
        empty={
          <EmptyState title={t('placeMedia.pickEmpty')} hint={t('placeMedia.pickEmptyHint')} />
        }
      >
        {(items) => (
          <ul className={styles.pickList}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.pickItem}
                  disabled={item.attachedHere || pending}
                  onClick={() => onPick(item)}
                >
                  {item.url ? (
                    // Decorative for the same reason: the key is the row label.
                    <Thumb
                      src={item.url}
                      alt=""
                      className={styles.pickThumb}
                      fallbackClassName={styles.pickThumbFallback}
                    />
                  ) : (
                    <span className={styles.pickThumbFallback}>{t('placeMedia.noStorage')}</span>
                  )}
                  <span className={styles.pickBody}>
                    <span className={styles.pickKey}>{item.storageKey}</span>
                    <span className={styles.pickMeta}>
                      {formatBytes(item.contentLength, locale)} · {item.contentType} ·{' '}
                      {formatDateTime(item.createdAt, locale)}
                    </span>
                  </span>
                  {item.attachedHere ? (
                    <Badge tone="mint" icon={<CheckIcon size={11} />}>
                      {t('placeMedia.pickAttached')}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{t('placeMedia.pickAttach')}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </Modal>
  )
}

function ModerationDialog({
  media,
  onClose,
  onSubmit,
  pending,
  error,
  fieldError,
}: {
  media: PlaceMedia | null
  onClose: () => void
  onSubmit: (decision: PlaceMediaModeration, reason: string) => void
  pending: boolean
  error: string | null
  fieldError: string | null
}) {
  const t = useT()
  const label = useLabel()
  const [decision, setDecision] = useState<PlaceMediaModeration>('approved')
  const [reason, setReason] = useState('')

  /*
   * Opens on the state the photo is already in, never on a suggestion.
   * Pre-selecting "approved" for every pending photo would put a decision in
   * the moderator's mouth, and the submit button is off until they change it
   * on purpose and say why.
   */
  useEffect(() => {
    if (!media) return
    setDecision(
      media.moderation === 'rejected'
        ? 'rejected'
        : media.moderation === 'approved'
          ? 'approved'
          : 'pending',
    )
    setReason('')
  }, [media])

  if (!media) return null
  const unchanged = decision === media.moderation
  const localError =
    !unchanged &&
    reason.trim().length > 0 &&
    reason.trim().length < PLACE_MEDIA_LIMITS.moderationReason.min
      ? t('placeMedia.error.reasonTooShort', { min: PLACE_MEDIA_LIMITS.moderationReason.min })
      : undefined

  return (
    <Modal
      open
      onClose={onClose}
      title={t('placeMedia.moderationTitle')}
      description={t('placeMedia.moderationReasonHint')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={unchanged || reason.trim().length < PLACE_MEDIA_LIMITS.moderationReason.min}
            onClick={() => onSubmit(decision, reason.trim())}
          >
            {t('placeMedia.moderationSubmit')}
          </Button>
        </div>
      }
    >
      <p className="mb-3 flex items-center gap-2 text-xs text-text-muted">
        {t('placeMedia.moderationCurrent')}
        <StatusBadge
          tone={MODERATION_TONE[media.moderation] ?? 'neutral'}
          shape={MODERATION_SHAPE[media.moderation as keyof typeof MODERATION_SHAPE] ?? 'info'}
          label={label(`mediaModeration.${media.moderation}`, media.moderation)}
        />
      </p>
      <Select
        label={t('placeMedia.moderationDecision')}
        value={decision}
        onChange={(event) => setDecision(event.target.value as PlaceMediaModeration)}
      >
        {DECISIONS.map((option) => (
          <option key={option} value={option}>
            {label(`mediaModeration.${option}`, option)}
          </option>
        ))}
      </Select>
      <TextArea
        className="mt-3"
        label={t('placeMedia.moderationReason')}
        required
        rows={3}
        maxLength={PLACE_MEDIA_LIMITS.moderationReason.max}
        value={reason}
        error={fieldError ?? localError}
        hint={t('placeMedia.moderationReasonRequired')}
        onChange={(event) => setReason(event.target.value)}
      />
      {unchanged ? <p className={styles.note}>{t('placeMedia.moderationNoChange')}</p> : null}
      {decision === 'rejected' && media.isCover ? (
        <p className={styles.noteWarn}>
          <span aria-hidden="true">⚠</span>
          {t('placeMedia.moderationClearsCover')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.queueError}>
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : null}
    </Modal>
  )
}

function DetailsDialog({
  media,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  media: PlaceMedia | null
  onClose: () => void
  onSubmit: (patch: { caption: string | null; attribution: string | null }) => void
  pending: boolean
  error: string | null
}) {
  const t = useT()
  const [caption, setCaption] = useState('')
  const [attribution, setAttribution] = useState('')

  useEffect(() => {
    setCaption(media?.caption ?? '')
    setAttribution(media?.attribution ?? '')
  }, [media])

  if (!media) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={t('placeMedia.details')}
      description={t('placeMedia.detailsHint')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              onSubmit({
                caption: caption.trim() ? caption.trim() : null,
                attribution: attribution.trim() ? attribution.trim() : null,
              })
            }
          >
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <TextInput
        label={t('placeMedia.caption')}
        maxLength={PLACE_MEDIA_LIMITS.caption.max}
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
      />
      <TextInput
        className="mt-3"
        label={t('placeMedia.attribution')}
        hint={t('placeMedia.attributionHint')}
        maxLength={PLACE_MEDIA_LIMITS.attribution.max}
        value={attribution}
        onChange={(event) => setAttribution(event.target.value)}
      />
      {error ? (
        <p role="alert" className={styles.queueError}>
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : null}
    </Modal>
  )
}

/**
 * CMS-046 (GoGo-CMS#125) — the place-photo card, now that GoGo-BE#191 gave it
 * routes to talk to.
 *
 * It used to list storage keys under a comment saying no write route existed.
 * That comment is gone with the routes it described: an editor uploads,
 * attaches, captions, orders, chooses a cover, decides moderation and detaches
 * from here.
 *
 * Two server rules the card surfaces rather than re-implements. A newly
 * attached photo is always `pending` — the person who uploads is not the
 * person who decides it may be published — and `url` is null wherever media
 * hosting is not configured, which disables the moderation control with that
 * reason, because deciding on a photo you cannot see is not moderation.
 */
export function PlaceMediaCard({
  placeId,
  media,
  canWrite,
}: {
  placeId: string
  media: readonly PlaceMedia[]
  canWrite: boolean
}) {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()
  const toast = useToast()
  const online = useOnline()
  const queryClient = useQueryClient()
  const describeError = useErrorMessage()

  const writable = canWrite && online
  const [dragging, setDragging] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [moderating, setModerating] = useState<PlaceMedia | null>(null)
  const [editing, setEditing] = useState<PlaceMedia | null>(null)
  const [detaching, setDetaching] = useState<PlaceMedia | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.places.detail(placeId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.places.attachableMedia(placeId) })
  }, [placeId, queryClient])

  const queue = useUploadQueue(placeId, invalidate)

  /*
   * Ordered by `sortOrder`, not by the read order.
   *
   * The API answers cover-first because that is what a consumer needs. Here
   * the up/down controls write `sortOrder`, so the list has to show the field
   * being edited — otherwise moving a photo "up" past a pinned cover would
   * change a number nothing on screen reflects. The cover says so with a
   * badge instead of with its position.
   */
  const ordered = useMemo(
    () => [...media].sort((left, right) => left.sortOrder - right.sortOrder),
    [media],
  )

  const attach = useMutation({
    mutationFn: (storageKey: string) => attachPlaceMedia(placeId, { storageKey }),
    onSuccess: () => {
      invalidate()
      setPickerOpen(false)
      toast.success(t('placeMedia.attached'))
    },
    onError: (cause) => toast.error(describeError(cause)),
  })

  const patchMedia = useMutation({
    mutationFn: ({ mediaId, patch }: { mediaId: string; patch: UpdatePlaceMediaInput }) =>
      updatePlaceMedia(placeId, mediaId, patch),
    onSuccess: () => invalidate(),
  })

  const reorder = useMutation({
    mutationFn: async ({ from, to }: { from: PlaceMedia; to: PlaceMedia }) => {
      // Two writes, because the route takes one row's `sortOrder` at a time.
      // Sequential on purpose: the second must not race the first onto the
      // same pair of numbers.
      await updatePlaceMedia(placeId, from.id, { sortOrder: to.sortOrder })
      await updatePlaceMedia(placeId, to.id, { sortOrder: from.sortOrder })
    },
    onSuccess: () => invalidate(),
    onError: (cause) => toast.error(describeError(cause)),
  })

  const detach = useMutation({
    mutationFn: (mediaId: string) => detachPlaceMedia(placeId, mediaId),
    onSuccess: () => {
      invalidate()
      setDetaching(null)
      toast.success(t('placeMedia.detached'))
    },
    onError: (cause) => toast.error(describeError(cause)),
  })

  const pickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    queue.add(Array.from(files))
  }

  const submitModeration = (decision: PlaceMediaModeration, reason: string) => {
    if (!moderating) return
    setDialogError(null)
    setReasonError(null)
    patchMedia.mutate(
      { mediaId: moderating.id, patch: { moderation: decision, moderationReason: reason } },
      {
        onSuccess: () => {
          setModerating(null)
          toast.success(t('placeMedia.moderationSaved'))
        },
        onError: (cause) => {
          const apiError = toApiError(cause)
          // The server names the field; put the message where the operator is
          // already looking rather than only in a toast.
          const reasonIssue = apiError.fieldErrors.find(
            (issue) => issue.field === 'moderationReason',
          )
          if (reasonIssue) setReasonError(t('placeMedia.error.reasonRequired'))
          else setDialogError(describeError(cause))
        },
      },
    )
  }

  const submitDetails = (patch: { caption: string | null; attribution: string | null }) => {
    if (!editing) return
    setDialogError(null)
    patchMedia.mutate(
      { mediaId: editing.id, patch },
      {
        onSuccess: () => {
          setEditing(null)
          toast.success(t('placeMedia.saved'))
        },
        onError: (cause) => setDialogError(describeError(cause)),
      },
    )
  }

  return (
    <Card>
      <CardHeader
        title={t('placeEditor.media')}
        hint={t('placeMedia.hint')}
        actions={
          canWrite ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={!writable}
              onClick={() => setPickerOpen(true)}
            >
              <PlusIcon size={14} />
              {t('placeMedia.drop.pick')}
            </Button>
          ) : null
        }
      />
      <CardBody>
        {canWrite ? (
          <>
            <div
              className={[
                styles.dropzone,
                dragging ? styles.dropzoneActive : '',
                writable ? '' : styles.dropzoneDisabled,
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(event) => {
                if (!writable) return
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                if (!writable) return
                pickFiles(event.dataTransfer.files)
              }}
            >
              <p className={styles.dropzoneTitle}>{t('placeMedia.drop.title')}</p>
              <p className={styles.dropzoneHint}>
                {t('placeMedia.drop.hint', {
                  max: formatBytes(PLACE_MEDIA_LIMITS.maxUploadBytes, locale),
                })}
              </p>
              <div className={styles.dropzoneActions}>
                {/* The file input is the keyboard path; the drop target is the
                    mouse shortcut, never the only way in. */}
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className={styles.hiddenInput}
                  disabled={!writable}
                  onChange={(event) => {
                    pickFiles(event.target.files)
                    // Cleared so re-picking the same file fires `change` again.
                    event.target.value = ''
                  }}
                  aria-label={t('placeMedia.drop.choose')}
                />
                {/* Secondary, not filled: the editor's save bar owns the one
                    dominant CTA on this screen. */}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!writable}
                  onClick={() => inputRef.current?.click()}
                >
                  {t('placeMedia.drop.choose')}
                </Button>
              </div>
            </div>
            {!online ? (
              <p className={styles.noteWarn}>
                <span aria-hidden="true">⚠</span>
                {t('placeMedia.offlineHint')}
              </p>
            ) : null}
          </>
        ) : (
          <PermissionDeniedState hint={t('placeMedia.deniedHint')} />
        )}

        {queue.items.length > 0 ? (
          <div className={styles.queue}>
            <div className={styles.queueHead}>
              <p className={styles.queueTitle}>
                {t('placeMedia.queue.title', { count: queue.items.length })}
              </p>
              <Button size="sm" variant="ghost" onClick={queue.clearSettled}>
                {t('placeMedia.queue.clear')}
              </Button>
            </div>
            <ul className={styles.list}>
              {queue.items.map((item) => (
                <UploadRow
                  key={item.id}
                  item={item}
                  disabled={!writable}
                  onRetry={() => queue.retry(item.id)}
                  onDismiss={() => queue.dismiss(item.id)}
                />
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4">
          {ordered.length === 0 ? (
            <p className="text-xs text-text-subtle">{t('placeEditor.mediaEmpty')}</p>
          ) : (
            <ul className={styles.list}>
              {ordered.map((item, index) => {
                const noStorage = !item.url
                const rejected = item.moderation === 'rejected'
                return (
                  <li
                    key={item.id}
                    className={[styles.item, item.isCover ? styles.itemCover : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {item.url ? (
                      /*
                       * The caption is the only description anyone wrote, so it
                       * is the alt text. With none, the alt says an undescribed
                       * photo is here rather than inventing a description or
                       * marking the row's whole subject decorative — a reader
                       * who cannot see it still learns the caption is missing,
                       * which is a thing an editor can fix.
                       */
                      <Thumb
                        src={item.url}
                        alt={item.caption ?? t('placeMedia.photoUncaptioned')}
                        className={styles.thumb}
                        fallbackClassName={styles.thumbFallback}
                      />
                    ) : (
                      <span className={styles.thumbFallback}>{t('placeMedia.noStorage')}</span>
                    )}

                    <div className={styles.itemBody}>
                      <div className={styles.badgeRow}>
                        <StatusBadge
                          tone={MODERATION_TONE[item.moderation] ?? 'neutral'}
                          shape={
                            MODERATION_SHAPE[item.moderation as keyof typeof MODERATION_SHAPE] ??
                            'info'
                          }
                          label={label(`mediaModeration.${item.moderation}`, item.moderation)}
                        />
                        {item.isCover ? (
                          <Badge tone="coral" icon={<StarIcon size={11} />}>
                            {t('placeMedia.cover')}
                          </Badge>
                        ) : null}
                        {/* FR-INGEST-014: where a photo came from travels with it. */}
                        <Badge tone="lavender">
                          {label(`mediaSource.${item.sourceType}`, item.sourceType)}
                        </Badge>
                        {item.width && item.height ? (
                          <Badge tone="neutral">
                            {item.width}×{item.height}
                          </Badge>
                        ) : null}
                        {item.createdAt ? (
                          <span className="text-[11px] text-text-subtle">
                            {formatDateTime(item.createdAt, locale)}
                          </span>
                        ) : null}
                      </div>

                      <p className={item.caption ? styles.caption : styles.captionEmpty}>
                        {item.caption ?? t('placeMedia.captionEmpty')}
                      </p>
                      {item.attribution ? (
                        <p className={styles.attribution}>{item.attribution}</p>
                      ) : null}
                      <span className={styles.key} title={item.storageKey}>
                        {item.storageKey}
                      </span>

                      {item.moderationReason ? (
                        <p className={styles.reason}>
                          <span className={styles.reasonLabel}>{t('placeMedia.reasonLabel')} </span>
                          {item.moderationReason}
                          <span className="mt-0.5 block text-text-subtle">
                            {t('placeMedia.whoWhen')}
                          </span>
                        </p>
                      ) : null}

                      {noStorage ? (
                        <p className={styles.note}>
                          <span aria-hidden="true">ⓘ</span>
                          {t('placeMedia.noStorageReason')}
                        </p>
                      ) : null}

                      {canWrite ? (
                        <div className={styles.actions}>
                          <span className={styles.orderGroup}>
                            <IconButton
                              label={t('placeMedia.moveUp', { position: index + 1 })}
                              disabled={!writable || index === 0 || reorder.isPending}
                              onClick={() =>
                                reorder.mutate({ from: item, to: ordered[index - 1]! })
                              }
                            >
                              <ChevronRightIcon size={16} className="-rotate-90" />
                            </IconButton>
                            <IconButton
                              label={t('placeMedia.moveDown', { position: index + 1 })}
                              disabled={
                                !writable || index === ordered.length - 1 || reorder.isPending
                              }
                              onClick={() =>
                                reorder.mutate({ from: item, to: ordered[index + 1]! })
                              }
                            >
                              <ChevronRightIcon size={16} className="rotate-90" />
                            </IconButton>
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!writable || item.isCover || rejected}
                            title={rejected ? t('placeMedia.coverRejected') : undefined}
                            onClick={() =>
                              patchMedia.mutate(
                                { mediaId: item.id, patch: { isCover: true } },
                                // This one has no dialog to put a rejection
                                // in, so it says so rather than failing quietly.
                                { onError: (cause) => toast.error(describeError(cause)) },
                              )
                            }
                          >
                            <StarIcon size={14} />
                            {t('placeMedia.setCover')}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!writable}
                            onClick={() => {
                              setDialogError(null)
                              setEditing(item)
                            }}
                          >
                            {t('placeMedia.details')}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            // A decision taken on a picture nobody can see is
                            // not moderation, so the control says why instead
                            // of pretending it is available.
                            disabled={!writable || noStorage}
                            title={noStorage ? t('placeMedia.noStorageReason') : undefined}
                            onClick={() => {
                              setDialogError(null)
                              setReasonError(null)
                              setModerating(item)
                            }}
                          >
                            {t('placeMedia.moderate')}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!writable}
                            onClick={() => setDetaching(item)}
                          >
                            <TrashIcon size={14} />
                            {t('placeMedia.detach')}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className={styles.note}>
          <span aria-hidden="true">ⓘ</span>
          {t('placeMedia.pendingNote')}
        </p>
        <p className={styles.attribution}>{t('placeEditor.mediaAttribution')}</p>
      </CardBody>

      <AttachablePicker
        placeId={placeId}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(item) => attach.mutate(item.storageKey)}
        pending={attach.isPending}
      />

      <ModerationDialog
        media={moderating}
        onClose={() => setModerating(null)}
        onSubmit={submitModeration}
        pending={patchMedia.isPending}
        error={dialogError}
        fieldError={reasonError}
      />

      <DetailsDialog
        media={editing}
        onClose={() => setEditing(null)}
        onSubmit={submitDetails}
        pending={patchMedia.isPending}
        error={dialogError}
      />

      <ConfirmDialog
        open={detaching !== null}
        onClose={() => setDetaching(null)}
        onConfirm={() => detaching && detach.mutate(detaching.id)}
        title={t('placeMedia.detachTitle')}
        description={t('placeMedia.detachDescription')}
        confirmLabel={t('placeMedia.detachConfirm')}
        loading={detach.isPending}
        // The file survives. Calling this irreversible would be a lie, and the
        // dialog's job is to say what actually happens.
        irreversible={false}
        changes={
          detaching
            ? [
                {
                  label: t('placeMedia.detachChangeLabel'),
                  from: detaching.storageKey,
                  note: detaching.isCover ? t('placeMedia.detachCoverNote') : undefined,
                },
                { label: t('placeMedia.detachNoteLabel'), note: t('placeMedia.detachNote') },
              ]
            : []
        }
      />
    </Card>
  )
}
