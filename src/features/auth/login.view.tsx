import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { useSession } from '@/shared/auth/session'
import { landingPathFor } from '@/shared/auth/permissions'
import { ApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/Field'
import { LogoMark } from '@/shared/ui/icons'
import { styles } from './login.style'

// One schema, used by the form resolver. Never duplicated for the request.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional()
    .or(z.literal('')),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginScreen() {
  const t = useT()
  const { locale, setLocale } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const { login, expired } = useSession()
  // Set by RequireAuth when it bounced an authenticated route.
  const returnTo = (location.state as { from?: string } | null)?.from
  const [formError, setFormError] = useState<string | null>(null)
  const [mfaRequired, setMfaRequired] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', totp: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const session = await login({
        email: values.email,
        password: values.password,
        totp: values.totp || undefined,
      })
      navigate(returnTo ?? landingPathFor(session.role), { replace: true })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(t('error.UNKNOWN'))
        return
      }
      if (error.code === 'MFA_REQUIRED') {
        setMfaRequired(true)
        setFormError(t('auth.mfaRequired'))
        return
      }
      if (error.code === 'MFA_SETUP_REQUIRED') {
        setFormError(t('auth.mfaSetupRequired'))
        return
      }
      if (error.status === 429) {
        setFormError(t('auth.rateLimited'))
        return
      }
      if (error.status === 401) {
        setFormError(t('auth.badCredentials'))
        return
      }
      setFormError(error.message)
    }
  })

  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          <LogoMark size={30} />
          <span className={styles.brandName}>{t('app.name')}</span>
          <span className={styles.brandTag}>{t('app.suffix')}</span>
        </div>

        <h1 className={styles.title}>{t('auth.title')}</h1>
        <p className={styles.subtitle}>{t('auth.subtitle')}</p>

        {expired ? (
          <p role="status" className={`${styles.alert} mt-4`}>
            <span aria-hidden="true">⚠</span>
            {expired === 'idle' ? t('auth.idleTimeout') : t('auth.sessionExpired')}
          </p>
        ) : null}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <TextInput
            label={t('auth.email')}
            type="email"
            autoComplete="username"
            required
            error={errors.email ? t('auth.badCredentials') : undefined}
            {...register('email')}
          />
          <TextInput
            label={t('auth.password')}
            type="password"
            autoComplete="current-password"
            required
            error={errors.password ? t('auth.badCredentials') : undefined}
            {...register('password')}
          />
          <TextInput
            label={t('auth.totp')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            hint={t('auth.totpHint')}
            required={mfaRequired}
            error={errors.totp ? t('auth.totpHint') : undefined}
            {...register('totp')}
          />

          {formError ? (
            <p role="alert" className={styles.alertDanger}>
              <span aria-hidden="true">⚠</span>
              {formError}
            </p>
          ) : null}

          <Button type="submit" variant="primary" loading={isSubmitting}>
            {isSubmitting ? t('auth.submitting') : t('auth.submit')}
          </Button>
        </form>

        <p className={styles.footNote}>{t('auth.securityNote')}</p>

        <div className={styles.localeRow}>
          {(['vi', 'en'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={`${styles.localeButton} ${locale === code ? styles.localeActive : ''}`}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
