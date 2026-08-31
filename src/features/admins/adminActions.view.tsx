import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { ApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { Select, TextArea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Overlay'
import { useToast } from '@/shared/ui/Toast'
import { adminRoleSchema, type AdminRole, type CmsAdmin } from '@/shared/api/contracts'
import {
  reactivateAdmin,
  resetAdminPassword,
  suspendAdmin,
  updateAdmin,
  type ResetPasswordResult,
} from './api'
import { styles } from './adminList.style'

export type AdminAction = 'edit' | 'suspend' | 'reactivate' | 'reset'

/**
 * The four staff-account mutations (#248), each behind a dialog that demands
 * the reason the audit log will carry. Server refusals the model declares —
 * `SELF_ROLE_CHANGE`, `SELF_SUSPEND`, `LAST_SUPER_ADMIN` — render as their own
 * explanations rather than a generic failure.
 */
export function AdminActionDialog({
  action,
  admin,
  onClose,
}: {
  action: AdminAction
  admin: CmsAdmin
  onClose: () => void
}) {
  const t = useT()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [reason, setReason] = useState('')
  const [role, setRole] = useState<AdminRole>(admin.role)
  const [error, setError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })

  const describeRefusal = (cause: unknown): string => {
    if (cause instanceof ApiError) {
      if (cause.code === 'SELF_ROLE_CHANGE') return t('admins.error.selfRole')
      if (cause.code === 'SELF_SUSPEND') return t('admins.error.selfSuspend')
      if (cause.code === 'LAST_SUPER_ADMIN') return t('admins.error.lastSuperAdmin')
      return cause.message
    }
    return t('error.UNKNOWN')
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = reason.trim()
      if (action === 'edit') return updateAdmin(admin.id, { role, reason: trimmed })
      if (action === 'suspend') return suspendAdmin(admin.id, trimmed)
      if (action === 'reactivate') return reactivateAdmin(admin.id, trimmed)
      return resetAdminPassword(admin.id, trimmed)
    },
    onSuccess: (result) => {
      invalidate()
      if (action === 'reset') {
        // The password exists in this response and nowhere else. It moves into
        // local state for one showing; closing the dialog is the last sight
        // of it.
        setTempPassword((result as ResetPasswordResult).temporaryPassword)
        return
      }
      toast.success(t(`admins.done.${action}` as const))
      onClose()
    },
    onError: (cause) => setError(describeRefusal(cause)),
  })

  const submit = () => {
    setError(null)
    if (reason.trim().length < 3) {
      setError(t('admins.reasonRequired'))
      return
    }
    mutation.mutate()
  }

  // One-time showing of the temporary password, replacing the form entirely.
  if (tempPassword !== null) {
    return (
      <Modal open onClose={onClose} title={t('admins.temp.title')}>
        <div className={styles.tempWrap}>
          <p className={styles.tempWarn}>
            <span aria-hidden="true">⚠</span>
            {t('admins.temp.warn')}
          </p>
          <p className={styles.tempPassword}>{tempPassword}</p>
          <div className={styles.tempActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(tempPassword).then(() => setCopied(true))
              }}
            >
              {copied ? t('admins.temp.copied') : t('admins.temp.copy')}
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              {t('admins.temp.doneButton')}
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t(`admins.action.${action}` as const)}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            variant={action === 'suspend' || action === 'reset' ? 'danger' : 'primary'}
            loading={mutation.isPending}
            onClick={submit}
          >
            {t(`admins.action.${action}` as const)}
          </Button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogTarget}>
          {admin.displayName} · <span className={styles.email}>{admin.email}</span>
        </p>
        <p className={styles.dialogHint}>{t(`admins.actionHint.${action}` as const)}</p>

        {action === 'edit' ? (
          <Select
            label={t('admins.col.role')}
            value={role}
            onChange={(event) => setRole(event.target.value as AdminRole)}
          >
            {adminRoleSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`role.${value}` as const)}
              </option>
            ))}
          </Select>
        ) : null}

        <TextArea
          label={t('admins.reason')}
          rows={2}
          required
          hint={t('admins.reasonHint')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />

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
