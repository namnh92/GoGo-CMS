import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { TextArea } from '@/shared/ui/Field'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import { MAX_FLAG_REASON, flagReasonSchema } from './api'

type ConfirmProps = ComponentProps<typeof ConfirmDialog>

/**
 * The one confirmation every CMS flag write goes through (GoGo-BE#713 Q7).
 *
 * A flag is shared operational control, so it gets one audit rule wherever it
 * is edited — the generic flags panel, App Control, the GoGo AI kill switch:
 * the change spelled out, plus a required reason that lands in the
 * `feature_flag.set` audit entry. The confirm button stays locked until the
 * reason meets the server's own bounds, and while offline.
 */
export function FlagConfirmDialog({
  open,
  online,
  onConfirm,
  children,
  ...dialog
}: Omit<ConfirmProps, 'onConfirm' | 'confirmDisabled' | 'children'> & {
  online: boolean
  onConfirm: (reason: string) => void
  /** Extra notes shown above the reason field. */
  children?: ReactNode
}) {
  const t = useT()
  const [reason, setReason] = useState('')

  // A new confirmation starts empty: a reason belongs to one change.
  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const trimmed = reason.trim()
  const valid = flagReasonSchema.safeParse(reason).success

  return (
    <ConfirmDialog
      {...dialog}
      open={open}
      irreversible={dialog.irreversible ?? false}
      confirmDisabled={!valid || !online}
      onConfirm={() => {
        if (valid) onConfirm(trimmed)
      }}
    >
      {children}
      <div>
        <TextArea
          label={t('flags.reason')}
          hint={t('flags.reasonHint')}
          required
          rows={2}
          maxLength={MAX_FLAG_REASON}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={reason.length > 0 && !valid ? t('flags.reasonTooShort') : undefined}
        />
        <p className="mt-1 text-right text-caption tabular-nums text-text-secondary">
          {trimmed.length}/{MAX_FLAG_REASON}
        </p>
      </div>
    </ConfirmDialog>
  )
}
