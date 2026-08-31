import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useT } from '@/shared/i18n/i18n'
import { RoleGate } from '@/app/RequireAuth'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { adminRoleSchema } from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/errors'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextInput } from '@/shared/ui/Field'
import { useToast } from '@/shared/ui/Toast'
import { useErrorMessage } from '@/shared/ui/State'
import { CheckIcon } from '@/shared/ui/icons'
import { createAdmin, newAdminSchema, type NewAdminInput } from './api'
import { styles } from './newAccount.style'

/** Field names the server may reject, mapped to the form control that owns them. */
const FORM_FIELDS = new Set<keyof NewAdminInput>(['displayName', 'email', 'password', 'role'])

/**
 * A rejected field has two possible authors. Zod speaks English and describes
 * the shape, so its message is replaced by the translated one; the server
 * describes *this* account ("email already taken") and must be shown verbatim,
 * because only it knows why. Marking server errors keeps the two apart instead
 * of guessing from the text.
 */
const SERVER_ERROR = 'server'

function fieldMessage(
  error: { type?: string | number; message?: string } | undefined,
  fallback: string,
): string | undefined {
  if (!error) return undefined
  return error.type === SERVER_ERROR && error.message ? error.message : fallback
}

function CreatedPanel({ displayName, onAnother }: { displayName: string; onAnother: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  return (
    <div className={styles.success} role="status">
      <p className={styles.successTitle}>
        <span aria-hidden="true">✓ </span>
        {t('admins.created', { name: displayName })}
      </p>
      {/* There is no account list to send anyone to: `GET /cms/auth/admins`
          does not exist yet (GoGo-BE#220). Saying so beats a dead link. */}
      <p className={styles.successBody}>{t('admins.createdHint')}</p>
      <div className={styles.successActions}>
        <Button variant="primary" onClick={onAnother}>
          {t('admins.createAnother')}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/settings')}>
          {t('admins.backToSettings')}
        </Button>
      </div>
    </div>
  )
}

function NewAccountForm() {
  const t = useT()
  const toast = useToast()
  const describeError = useErrorMessage()
  const [formError, setFormError] = useState<ApiError | null>(null)
  const [createdName, setCreatedName] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewAdminInput>({
    resolver: zodResolver(newAdminSchema),
    defaultValues: { displayName: '', email: '', password: '', role: 'editor' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await createAdmin(values)
      // Only the display name travels onward. The password is never toasted,
      // never logged, never put in a route — it leaves this function with the
      // request and nowhere else.
      setCreatedName(values.displayName)
      toast.success(t('admins.created', { name: values.displayName }))
      reset()
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      if (apiError) {
        // The envelope names the offending field; put the message where the
        // operator is looking instead of in a banner above the form.
        let matched = false
        for (const fieldError of apiError.fieldErrors) {
          if (!FORM_FIELDS.has(fieldError.field as keyof NewAdminInput)) continue
          setError(fieldError.field as keyof NewAdminInput, {
            type: SERVER_ERROR,
            message: fieldError.message,
          })
          matched = true
        }
        if (matched) return
      }
      setFormError(apiError)
    }
  })

  if (createdName !== null) {
    return <CreatedPanel displayName={createdName} onAnother={() => setCreatedName(null)} />
  }

  // A demotion mid-session surfaces here, not as a blank page: the route gate
  // passed on mount, the API is the one that decides on submit.
  if (formError?.isForbidden) {
    return (
      <div className={styles.alertDanger} role="alert">
        <span aria-hidden="true">⚠</span>
        <span>{t('state.deniedHint')}</span>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError ? (
        <p className={styles.alertDanger} role="alert">
          <span aria-hidden="true">⚠</span>
          <span>
            {describeError(formError)}
            {formError.requestId ? (
              <span className={styles.requestId}>
                {t('state.requestId')}: {formError.requestId}
              </span>
            ) : null}
          </span>
        </p>
      ) : null}

      <div className={styles.grid}>
        <TextInput
          label={t('admins.field.displayName')}
          required
          autoComplete="off"
          error={fieldMessage(errors.displayName, t('admins.error.displayName'))}
          {...register('displayName')}
        />
        <TextInput
          label={t('admins.field.email')}
          type="email"
          required
          autoComplete="off"
          error={fieldMessage(errors.email, t('admins.error.email'))}
          {...register('email')}
        />
      </div>

      <TextInput
        label={t('admins.field.password')}
        type="password"
        required
        // New credential, never the operator's own: keep password managers from
        // offering the signed-in account's password here.
        autoComplete="new-password"
        hint={t('admins.field.passwordHint')}
        error={fieldMessage(errors.password, t('admins.error.password'))}
        {...register('password')}
      />

      <Select
        label={t('admins.field.role')}
        required
        hint={t('admins.field.roleHint')}
        error={fieldMessage(errors.role, t('admins.error.role'))}
        {...register('role')}
      >
        {/* Straight off the contract enum, so the picker cannot drift from the
            roles the server actually grants. */}
        {adminRoleSchema.options.map((role) => (
          <option key={role} value={role}>
            {t(`role.${role}` as const)}
          </option>
        ))}
      </Select>

      <div className={styles.note}>
        <span aria-hidden="true">ℹ</span>
        <span>{t('admins.rbacNote')}</span>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          iconLeft={<CheckIcon size={14} />}
        >
          {t('admins.submit')}
        </Button>
      </div>
    </form>
  )
}

export default function NewAccountScreen() {
  const t = useT()
  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('settings.breadcrumb'), to: '/settings' },
          { label: t('admins.new') },
        ]}
        title={t('admins.new')}
        showSearch={false}
      />
      <PageBody>
        {/* Hiding the form is a courtesy; `POST /cms/auth/admins` is
            super-admin-only on the server and stays the real gate. */}
        <RoleGate permission="admin.create">
          <Card className={styles.panel}>
            <CardHeader title={t('admins.formTitle')} hint={t('admins.formHint')} />
            <CardBody>
              <NewAccountForm />
            </CardBody>
          </Card>
        </RoleGate>
      </PageBody>
    </>
  )
}
