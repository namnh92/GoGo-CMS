import { useState } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/Field'
import { useToast } from '@/shared/ui/Toast'
import { CheckIcon } from '@/shared/ui/icons'
import { useSession } from '@/shared/auth/session'
import { SsoConfirmCard } from '@/features/admins/ssoConfirm.view'
import { useChangeOwnPassword } from './useChangeOwnPassword'
import { styles } from './changePassword.style'

/**
 * CMS-032 — changing your own password without anyone resetting it first.
 *
 * The console already called `POST /cms/auth/change-password`, in exactly one
 * place: the forced step after a temporary password, reachable only when
 * `mustChangePassword` is true. So the supported rotation path had no entry
 * point for anyone who simply wanted to rotate — including the one account that
 * cannot be reset by anybody else, since a reset requires `super_admin` and an
 * environment has exactly one (GoGo-BE ADR-0018).
 *
 * Every role, no gate: everyone has a password, and this is the one screen that
 * is about the caller rather than about a resource.
 */
function ChangePasswordForm() {
  const t = useT()
  const toast = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [done, setDone] = useState(false)
  const {
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    pending,
    submit,
    reset,
  } = useChangeOwnPassword()
  const { passwordChanged, currentEpoch } = useSession()

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setDone(false)
    // Captured before the await: a slow answer must not discharge the
    // obligation of whoever signed in meanwhile (#101).
    const epoch = currentEpoch()
    if (await submit(currentPassword)) {
      // An operator sent here by the forced-change guard (#101) is now free;
      // for everyone else this is a no-op.
      passwordChanged(epoch)
      // The session that made the call survives, so there is nowhere to send
      // the operator: they stay here and the page says what happened.
      setCurrentPassword('')
      reset()
      setDone(true)
      toast.success(t('account.password.done'))
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {/* Said before the submit, not after: a rotation is also how someone
          answers a suspected compromise, and they need to know their other
          devices are about to be signed out — and that this tab is not. */}
      <p className={styles.note}>
        <span aria-hidden="true">ℹ</span>
        <span>{t('account.password.sessionNote')}</span>
      </p>

      <TextInput
        label={t('account.password.current')}
        type="password"
        autoComplete="current-password"
        required
        hint={t('account.password.currentHint')}
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <TextInput
        label={t('auth.change.newPassword')}
        type="password"
        autoComplete="new-password"
        required
        hint={t('auth.change.hint')}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      <TextInput
        label={t('auth.change.confirmPassword')}
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />

      {error ? (
        <p role="alert" className={styles.alertDanger}>
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      ) : null}

      {done ? (
        <p role="status" className={styles.success}>
          <span aria-hidden="true">✓</span>
          <span>{t('account.password.doneHint')}</span>
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          iconLeft={<CheckIcon size={14} />}
        >
          {t('account.password.submit')}
        </Button>
      </div>
    </form>
  )
}

/**
 * GoGo-BE#687 — the super admin has no password: it signs in through Access
 * only and the API refuses a change with `SUPER_ADMIN_SSO_ONLY`, so a form here
 * would be a dead control (review F-01). The sidebar does not link here for it;
 * reached by address, this says so in words instead.
 *
 * `forced`: `RequireAuth` sends an account owing a password change here and
 * nowhere else (#101), and this account cannot discharge that obligation with
 * a password. The way out the API provides is the Access confirmation
 * (`confirm-sso` is reachable while a change is owed). The accounts page where
 * that control normally lives is unreachable from here, so the control is
 * rendered on this screen as well.
 */
function SuperAdminSsoOnlyNote({ forced }: { forced: boolean }) {
  const t = useT()
  return (
    <div className={styles.form}>
      <p role="status" className={styles.note}>
        <span aria-hidden="true">ℹ</span>
        <span>
          {forced
            ? t('account.password.superAdminSsoOnlyForced')
            : t('account.password.superAdminSsoOnly')}
        </span>
      </p>
      {forced ? <SsoConfirmCard /> : null}
    </div>
  )
}

export default function ChangePasswordScreen() {
  const t = useT()
  const { session } = useSession()
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('account.password.title') }]}
        title={t('account.password.title')}
        showSearch={false}
      />
      <PageBody>
        <Card className={styles.panel}>
          <CardHeader title={t('account.password.title')} hint={t('account.password.subtitle')} />
          <CardBody>
            {session?.role === 'super_admin' ? (
              <SuperAdminSsoOnlyNote forced={session?.mustChangePassword === true} />
            ) : (
              <ChangePasswordForm />
            )}
          </CardBody>
        </Card>
      </PageBody>
    </>
  )
}
