import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { ApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { TextArea, TextInput } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Overlay'
import { useToast } from '@/shared/ui/Toast'
import { useErrorMessage } from '@/shared/ui/State'
import type { CmsAppUser, PrivacyExportAdminStatus } from '@/shared/api/contracts'
import { ExportFacts } from '@/features/privacy/exportFacts.view'
import { banAppUser, deleteAppUser, exportAppUser, reactivateAppUser, suspendAppUser } from './api'
import { styles } from './users.style'

export type UserAction = 'suspend' | 'ban' | 'reactivate' | 'delete' | 'export'

/**
 * Account actions (GoGo-BE#246 §3), each behind a dialog demanding the audit
 * reason. Delete additionally requires typing the display name — it runs the
 * same erasure as the consumer flow and has no undo.
 *
 * Export (GoGo-BE#256, ADR-0032) issues a secure export for the account holder
 * and answers metadata only: the dialog stays open on the export's state
 * facts. No file is built and no data is shown — the console receives none.
 */
export function UserActionDialog({
  action,
  user,
  onClose,
}: {
  action: UserAction
  user: CmsAppUser
  onClose: () => void
}) {
  const t = useT()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [reason, setReason] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<PrivacyExportAdminStatus | null>(null)
  const describeError = useErrorMessage()

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.appUsers.all })

  const describeRefusal = (cause: unknown): string => {
    if (cause instanceof ApiError) {
      if (cause.code === 'USER_DELETED') return t('users.error.deleted')
      if (cause.status === 429) return t('users.error.exportRate')
    }
    // Contract codes (EXPORT_UNAVAILABLE, SUBJECT_CANNOT_SIGN_IN, …) resolve
    // through `error.<CODE>`; an unknown one falls back to the server text.
    return describeError(cause)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = reason.trim()
      if (action === 'suspend') return suspendAppUser(user.id, trimmed)
      if (action === 'ban') return banAppUser(user.id, trimmed)
      if (action === 'reactivate') return reactivateAppUser(user.id, trimmed)
      if (action === 'delete') return deleteAppUser(user.id, trimmed)
      return exportAppUser(user.id, trimmed)
    },
    onSuccess: (result) => {
      invalidate()
      toast.success(t(`users.done.${action}` as const))
      if (action === 'export' && result && typeof result === 'object' && 'export' in result) {
        // Metadata only: show where the export stands, keep the dialog open.
        void queryClient.invalidateQueries({ queryKey: queryKeys.privacy.all })
        setIssued(result.export)
        return
      }
      onClose()
    },
    onError: (cause) => setError(describeRefusal(cause)),
  })

  const submit = () => {
    setError(null)
    if (reason.trim().length < 3) {
      setError(t('users.reasonRequired'))
      return
    }
    if (action === 'delete' && confirmName !== user.displayName) {
      setError(t('users.deleteConfirmMismatch'))
      return
    }
    mutation.mutate()
  }

  const destructive = action === 'suspend' || action === 'ban' || action === 'delete'

  return (
    <Modal
      open
      onClose={onClose}
      title={t(`users.action.${action}` as const)}
      footer={
        issued ? (
          <div className="flex justify-end gap-2">
            <Button variant="primary" onClick={onClose}>
              {t('action.close')}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              loading={mutation.isPending}
              onClick={submit}
            >
              {t(`users.action.${action}` as const)}
            </Button>
          </div>
        )
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogTarget}>
          {user.displayName}
          {user.email ? <span className={styles.email}> · {user.email}</span> : null}
        </p>
        <p className={styles.dialogHint}>{t(`users.actionHint.${action}` as const)}</p>

        {issued ? <ExportFacts facts={issued} /> : null}

        {action === 'delete' ? (
          <>
            <p className={styles.dangerBox}>
              <span aria-hidden="true">⚠</span>
              {t('users.deleteWarn')}
            </p>
            <TextInput
              label={t('users.deleteConfirmLabel', { name: user.displayName })}
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
            />
          </>
        ) : null}

        {issued ? null : (
          <TextArea
            label={t('users.reason')}
            rows={2}
            required
            hint={t('users.reasonHint')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}

        {error ? (
          <p role="alert" className={styles.dialogError}>
            <span aria-hidden="true">⚠</span>
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
