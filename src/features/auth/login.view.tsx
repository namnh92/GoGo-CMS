import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { useSession } from '@/shared/auth/session'
import { landingPathFor } from '@/shared/auth/permissions'
import { getAppEnvironment } from '@/shared/config/env'
import { changeOwnPassword } from '@/features/admins/api'
import { ApiError } from '@/shared/api/errors'
import { Button, IconButton } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/Field'
import {
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  LogoMark,
} from '@/shared/ui/icons'
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

/**
 * Credentials first, MFA second — the server drives the second step.
 *
 * The client never guesses whether an account has MFA: it submits email and
 * password, and only `MFA_REQUIRED` opens the code step. That keeps a DEV
 * account without MFA on a one-step path, and means the form cannot leak
 * which accounts are enrolled before a valid password is proven.
 *
 * A forced password change (#248) is its own step: the server answers login
 * with `mustChangePassword` when a temporary password is outstanding, and
 * every other CMS route refuses 403 `PASSWORD_CHANGE_REQUIRED` until it is
 * replaced — so the console routes here rather than into a dead shell.
 */
type Step = 'credentials' | 'mfa' | 'change-password'

const BULLETS = ['places', 'moderation', 'observability', 'rbac'] as const

export default function LoginScreen() {
  const t = useT()
  const { locale, setLocale } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const { login, expired } = useSession()
  const environment = getAppEnvironment()
  // Set by RequireAuth when it bounced an authenticated route.
  const returnTo = (location.state as { from?: string } | null)?.from

  const [step, setStep] = useState<Step>('credentials')
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changing, setChanging] = useState(false)
  /** Where to land once the obligation is cleared. */
  const pendingDestination = useRef<string>('/')
  const otpRef = useRef<HTMLInputElement | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', totp: '' },
  })

  // The whole point of the step is the code, so focus lands on it.
  useEffect(() => {
    if (step === 'mfa') otpRef.current?.focus()
  }, [step])

  const backToCredentials = () => {
    setStep('credentials')
    setValue('totp', '')
    setFormError(null)
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const session = await login({
        email: values.email,
        password: values.password,
        totp: values.totp || undefined,
      })
      const destination = returnTo ?? landingPathFor(session.role)
      if (session.mustChangePassword) {
        // A temporary password is outstanding: every other CMS route answers
        // 403 until it is replaced, so the console goes here first.
        pendingDestination.current = destination
        setStep('change-password')
        setFormError(null)
        return
      }
      navigate(destination, { replace: true })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(t('error.UNKNOWN'))
        return
      }
      if (error.code === 'MFA_REQUIRED') {
        // The password checked out; only the second factor is missing. A wrong
        // code lands here again, which is the correct place to say so.
        if (step === 'credentials') setStep('mfa')
        else setFormError(t('auth.totpHint'))
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
        // Never trapped behind a code prompt for a password problem.
        setStep('credentials')
        setFormError(t('auth.badCredentials'))
        return
      }
      setFormError(error.message)
    }
  })

  const submitChangePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (newPassword.length < 12) {
      setFormError(t('auth.change.tooShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      setFormError(t('auth.change.mismatch'))
      return
    }
    setChanging(true)
    try {
      await changeOwnPassword({
        // The temporary password the operator just signed in with proves the
        // caller is the person it was handed to.
        currentPassword: getValues('password'),
        newPassword,
      })
      navigate(pendingDestination.current, { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PASSWORD_UNCHANGED') {
        setFormError(t('auth.change.unchanged'))
      } else if (error instanceof ApiError && error.status === 401) {
        setFormError(t('auth.badCredentials'))
      } else if (error instanceof ApiError) {
        setFormError(error.message)
      } else {
        setFormError(t('error.UNKNOWN'))
      }
    } finally {
      setChanging(false)
    }
  }

  const totpField = register('totp')

  return (
    <div className={styles.root}>
      {/* Brand panel — decorative for a screen reader; the form is the page. */}
      <aside className={styles.brand} aria-hidden="true">
        <div className={styles.brandTop}>
          {/* Solid ivory plate: the coral brandmark is invisible on the coral
              gradient without it. */}
          <div className={styles.brandLogoBox}>
            <LogoMark size={34} />
          </div>
          <div>
            <div className={styles.brandWordmark}>{t('app.name')}</div>
            <div className={styles.brandSuffix}>{t('app.suffix')}</div>
          </div>
        </div>

        <div>
          <h2 className={styles.brandHeadline}>{t('auth.brandHeadline')}</h2>
          <p className={styles.brandLede}>{t('auth.brandLede')}</p>
        </div>

        <div className={styles.brandBullets}>
          {BULLETS.map((key) => (
            <div key={key} className={styles.brandBullet}>
              <CheckCircleIcon size={16} />
              {t(`auth.bullet.${key}` as const)}
            </div>
          ))}
        </div>

        <p className={styles.brandFoot}>
          {t('auth.brandFoot', { env: t(`env.${environment}` as const) })}
        </p>
      </aside>

      <div className={styles.form}>
        <main className={styles.formInner}>
          {/* The panel carries the brand on wide screens; below lg it moves here. */}
          <div className={styles.mobileBrand}>
            <LogoMark size={26} />
            <span className={styles.mobileWordmark}>{t('app.name')}</span>
            <span className={styles.mobileSuffix}>{t('app.suffix')}</span>
          </div>

          {step === 'credentials' ? (
            <div className={styles.stepHead}>
              <h1 className={styles.title}>{t('auth.title')}</h1>
              <p className={styles.subtitle}>{t('auth.subtitle')}</p>
            </div>
          ) : step === 'mfa' ? (
            <div className={styles.stepHead}>
              <div className={styles.stepBadge}>
                <LockIcon size={22} />
              </div>
              <h1 className={styles.title}>{t('auth.mfaTitle')}</h1>
              <p className={styles.subtitle}>{t('auth.mfaSubtitle')}</p>
            </div>
          ) : (
            <div className={styles.stepHead}>
              <div className={styles.stepBadge}>
                <ClockIcon size={22} />
              </div>
              <h1 className={styles.title}>{t('auth.change.title')}</h1>
              <p className={styles.subtitle}>{t('auth.change.subtitle')}</p>
            </div>
          )}

          {expired ? (
            <p role="status" className={`${styles.alert} mb-4`}>
              <span aria-hidden="true">⚠</span>
              {expired === 'idle' ? t('auth.idleTimeout') : t('auth.sessionExpired')}
            </p>
          ) : null}

          {step === 'change-password' ? (
            <form onSubmit={submitChangePassword} noValidate>
              <div className={styles.fields}>
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
              </div>
              {formError ? (
                <p role="alert" className={`${styles.alertDanger} mt-4`}>
                  <span aria-hidden="true">⚠</span>
                  {formError}
                </p>
              ) : null}
              <div className="mt-4 flex flex-col gap-2">
                <Button type="submit" variant="primary" loading={changing}>
                  {t('auth.change.submit')}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              {/* Both steps live in one form: fields hide, values persist, and
                the request always carries everything the server needs. */}
              <div className={styles.fields} hidden={step !== 'credentials'}>
                <TextInput
                  label={t('auth.email')}
                  type="email"
                  autoComplete="username"
                  required
                  error={errors.email ? t('auth.badCredentials') : undefined}
                  {...register('email')}
                />
                <div className={styles.passwordWrap}>
                  <TextInput
                    label={t('auth.password')}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    error={errors.password ? t('auth.badCredentials') : undefined}
                    {...register('password')}
                  />
                  <IconButton
                    label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </IconButton>
                </div>
              </div>

              <div className={styles.fields} hidden={step !== 'mfa'}>
                <TextInput
                  label={t('auth.totp')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="w-full"
                  hint={t('auth.totpHint')}
                  required={step === 'mfa'}
                  error={errors.totp ? t('auth.totpHint') : undefined}
                  {...totpField}
                  ref={(node) => {
                    totpField.ref(node)
                    otpRef.current = node
                  }}
                />
              </div>

              {formError ? (
                <p role="alert" className={`${styles.alertDanger} mt-4`}>
                  <span aria-hidden="true">⚠</span>
                  {formError}
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-2">
                <Button type="submit" variant="primary" loading={isSubmitting}>
                  {isSubmitting
                    ? t('auth.submitting')
                    : step === 'credentials'
                      ? t('auth.continue')
                      : t('auth.verifySubmit')}
                </Button>
                {step === 'mfa' ? (
                  <button type="button" className={styles.backButton} onClick={backToCredentials}>
                    {t('auth.backToCredentials')}
                  </button>
                ) : null}
              </div>
            </form>
          )}

          {step === 'mfa' ? <p className={styles.otpCompat}>{t('auth.totpApps')}</p> : null}

          {step === 'credentials' ? (
            <p
              className={`${styles.envNote} ${
                environment === 'production' ? styles.envProduction : styles.envDev
              }`}
            >
              <span aria-hidden="true">ℹ</span>
              <span>
                <strong>{t(`env.${environment}` as const)}</strong>
                {' — '}
                {environment === 'production' ? t('auth.envNoteProduction') : t('auth.envNoteDev')}
              </span>
            </p>
          ) : null}

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
        </main>
      </div>
    </div>
  )
}
