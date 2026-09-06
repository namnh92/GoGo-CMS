import { useState } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/Field'
import { useToast } from '@/shared/ui/Toast'
import { CheckIcon } from '@/shared/ui/icons'
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

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setDone(false)
    if (await submit(currentPassword)) {
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

export default function ChangePasswordScreen() {
  const t = useT()
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
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </PageBody>
    </>
  )
}
