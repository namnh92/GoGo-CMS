import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useOnline } from '@/shared/ui/useOnline'
import { Modal } from '@/shared/ui/Overlay'
import { Button } from '@/shared/ui/Button'
import { TextArea } from '@/shared/ui/Field'
import { useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { styles } from './takedownDialog.style'
import {
  MAX_TAKEDOWN_REASON,
  MIN_TAKEDOWN_REASON,
  TAKEDOWN_TRANSITION,
  takedown,
  type TakedownTarget,
} from './api'

/**
 * Break-glass confirmation.
 *
 * It names the exact transition rather than asking "are you sure?", because
 * the operator reaching for this is under time pressure and needs to see what
 * the call does. The reason is mandatory at 10 characters — the server's own
 * floor — since this record is the only explanation an incident review gets.
 */
export function TakedownDialog({
  open,
  onClose,
  target,
  resourceId,
  resourceLabel,
  onDone,
}: {
  open: boolean
  onClose: () => void
  target: TakedownTarget
  resourceId: string
  resourceLabel?: string
  onDone?: () => void
}) {
  const t = useT()
  const toast = useToast()
  const online = useOnline()
  const queryClient = useQueryClient()
  const describeError = useErrorMessage()
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open, resourceId])

  const transition = TAKEDOWN_TRANSITION[target]
  const trimmed = reason.trim()
  const tooShort = trimmed.length < MIN_TAKEDOWN_REASON

  const mutation = useMutation({
    mutationFn: () => takedown(target, resourceId, trimmed),
    onSuccess: () => {
      toast.success(t('emergency.done'), resourceLabel)
      // A takedown changes the catalog and the moderation surface both.
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.moderation.all })
      onDone?.()
      onClose()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('emergency.title', { target: t(`emergency.target.${target}` as const) })}
      description={t('emergency.subtitle')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-text-subtle">{t('emergency.oneAtATime')}</span>
          <span className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={tooShort || !online}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {t('emergency.confirm')}
            </Button>
          </span>
        </div>
      }
    >
      <div className={styles.transition}>
        <span className={styles.transitionLabel}>{t('emergency.transition')}</span>
        <span className={styles.from}>{transition.from}</span>
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
        <span className={styles.to}>{transition.to}</span>
      </div>
      {resourceLabel ? <p className={styles.resource}>{resourceLabel}</p> : null}
      <p className={styles.resourceId}>{resourceId}</p>

      <div className="mt-4">
        <TextArea
          label={t('emergency.reason')}
          hint={t('emergency.reasonHint')}
          required
          rows={3}
          maxLength={MAX_TAKEDOWN_REASON}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={reason.length > 0 && tooShort ? t('emergency.reasonTooShort') : undefined}
        />
        <p className={styles.counter}>
          {trimmed.length}/{MAX_TAKEDOWN_REASON}
        </p>
      </div>

      <p className={`${styles.warning} mt-3`}>
        <span aria-hidden="true">⚠</span>
        {t('emergency.auditWarning')}
      </p>
      <p className={`${styles.note} mt-2`}>{t('emergency.reversible')}</p>
    </Modal>
  )
}
