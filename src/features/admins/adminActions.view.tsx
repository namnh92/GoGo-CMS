import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { ApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { Select, TextArea } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Overlay'
import { useToast } from '@/shared/ui/Toast'
import {
  adminAssignableRoleSchema,
  type AdminAssignableRole,
  type CmsAdmin,
} from '@/shared/api/contracts'
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
 * `SELF_ROLE_CHANGE`, `SELF_SUSPEND`, `LAST_SUPER_ADMIN`,
 * `SUPER_ADMIN_SINGLETON` — render as their own explanations rather than a
 * generic failure.
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
  /**
   * The role a change would move this account *to*. A `super_admin` subject has
   * no such value — the role cannot be given up (ADR-0018) — so the picker is
   * not rendered for one and this falls back to the first assignable role,
   * which nothing reads in that case.
   */
  const [role, setRole] = useState<AdminAssignableRole>(() =>
    admin.role === 'super_admin' ? adminAssignableRoleSchema.options[0] : admin.role,
  )
  /** The bootstrapped account: its role is fixed, its credentials are not. */
  const isSuperAdmin = admin.role === 'super_admin'
  /**
   * Two actions have nothing to do on that account and the server refuses both
   * (`LAST_SUPER_ADMIN`): its role cannot be given up and it cannot be
   * suspended, because there is by construction no second super admin to
   * administer the console afterwards. The list does not offer them; this
   * refuses them again rather than sending a request whose only outcome is a
   * 409 — a submit that can only fail is a dead control.
   *
   * Reset and reactivate stay available: credentials are not frozen, and
   * rotating this account's password is the supported path (ADR-0018).
   */
  const refused = isSuperAdmin && (action === 'edit' || action === 'suspend')
  const [error, setError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })

  const describeRefusal = (cause: unknown): string => {
    if (cause instanceof ApiError) {
      if (cause.code === 'SELF_ROLE_CHANGE') return t('admins.error.selfRole')
      if (cause.code === 'SELF_SUSPEND') return t('admins.error.selfSuspend')
      if (cause.code === 'LAST_SUPER_ADMIN') return t('admins.error.lastSuperAdmin')
      if (cause.code === 'SUPER_ADMIN_SINGLETON') return t('admins.error.superAdminSingleton')
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
    if (refused) return
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
            disabled={refused}
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
        {refused ? null : (
          <p className={styles.dialogHint}>{t(`admins.actionHint.${action}` as const)}</p>
        )}

        {refused ? (
          // No picker and no disabled one: there is no value it could hold. The
          // role is fixed for the life of the environment, and saying so is
          // more use than an empty control.
          <p role="alert" className={styles.dialogError}>
            <span aria-hidden="true">⚠</span>
            {t('admins.superAdminLocked')}
          </p>
        ) : null}

        {action === 'edit' && !isSuperAdmin ? (
          <Select
            label={t('admins.col.role')}
            value={role}
            onChange={(event) => setRole(event.target.value as AdminAssignableRole)}
          >
            {adminAssignableRoleSchema.options.map((value) => (
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
