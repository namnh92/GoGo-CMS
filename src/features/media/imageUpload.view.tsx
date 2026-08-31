import { useId, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/Button'
import { useErrorMessage } from '@/shared/ui/State'
import {
  cmsUploadContentTypeSchema,
  type CmsUploadContentType,
  type CmsUploadPurpose,
} from '@/shared/api/contracts'
import { uploadImage } from './api'
import { styles } from './imageUpload.style'

const ACCEPT = cmsUploadContentTypeSchema.options.join(',')

/**
 * Pick an image, authorize it, PUT it to storage, keep the key.
 *
 * The parent stores `imageKey` — never the bytes, never a blob URL. `readUrl`
 * is where the object becomes readable and is **nullable**: until media
 * hosting is configured the server says so honestly instead of handing over a
 * URL that would 404, and this renders that as an absence rather than a broken
 * image.
 */
export function ImageUploadField({
  label,
  purpose,
  imageKey,
  previewUrl,
  required,
  disabled,
  error,
  onUploaded,
}: {
  label: string
  purpose: CmsUploadPurpose
  imageKey: string
  /** Where the current image is readable, or null when hosting is not set up. */
  previewUrl?: string | null
  required?: boolean
  disabled?: boolean
  error?: string
  onUploaded: (result: { key: string; readUrl: string | null }) => void
}) {
  const t = useT()
  const describeError = useErrorMessage()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string>()

  const upload = useMutation({
    mutationFn: ({ file, contentType }: { file: File; contentType: CmsUploadContentType }) =>
      uploadImage(file, purpose, contentType),
    onSuccess: (result) => {
      setLocalError(undefined)
      onUploaded(result)
    },
    onError: (cause) => setLocalError(describeError(cause)),
  })

  const pick = (file: File | undefined) => {
    if (!file) return
    // The content type is checked here because the presigner signs for exactly
    // one: a mismatch would be refused by storage after the round-trip.
    const parsed = cmsUploadContentTypeSchema.safeParse(file.type)
    if (!parsed.success) {
      setLocalError(t('media.error.contentType'))
      return
    }
    upload.mutate({ file, contentType: parsed.data })
  }

  const shownError = error ?? localError

  return (
    <div className={styles.wrap}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className={styles.dropzone}>
        {previewUrl ? (
          <img src={previewUrl} alt="" className={styles.preview} />
        ) : (
          <p className={styles.placeholder}>
            {imageKey ? t('media.noPreview') : t('media.noImage')}
          </p>
        )}

        <div className={styles.body}>
          {imageKey ? (
            <p className={styles.key} title={imageKey}>
              {imageKey}
            </p>
          ) : null}
          <p className={styles.hint}>{t('media.hint')}</p>
        </div>

        <div className={styles.actions}>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className={styles.hiddenInput}
            disabled={disabled || upload.isPending}
            onChange={(event) => {
              pick(event.target.files?.[0])
              // Cleared so re-picking the same file fires `change` again.
              event.target.value = ''
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={upload.isPending}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {imageKey ? t('media.replace') : t('media.choose')}
          </Button>
        </div>
      </div>

      {shownError ? (
        <p role="alert" className={styles.error}>
          <span aria-hidden="true">⚠</span>
          {shownError}
        </p>
      ) : null}
    </div>
  )
}
