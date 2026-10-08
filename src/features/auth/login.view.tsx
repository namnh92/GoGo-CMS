import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { useSession } from '@/shared/auth/session'
import { landingPathFor } from '@/shared/auth/permissions'
import { getAppEnvironment } from '@/shared/config/env'
import { ApiError } from '@/shared/api/errors'
import { Button, IconButton } from '@/shared/ui/Button'
import { TextInput } from '@/shared/ui/Field'
import { CheckCircleIcon, ClockIcon, EyeIcon, EyeOffIcon, LogoMark } from '@/shared/ui/icons'
import { Skeleton } from '@/shared/ui/State'
import { useChangeOwnPassword } from './useChangeOwnPassword'
import { useAuthMethods } from './useAuthMethods'
import { useSuperAdminPasswordGate } from './useSuperAdminPasswordGate'
import { SsoConfirmCard } from '@/features/admins/ssoConfirm.view'
import { styles } from './login.style'

// One schema, used by the form resolver. Never duplicated for the request.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type LoginForm = z.infer<typeof loginSchema>

/**
 * One credentials step. GoGo-BE#687 D-4 removed TOTP: the second factor is
 * Cloudflare Access admitting this mailbox, and the browser carries that
 * assertion on the login request itself. The API answers
 * `ACCESS_ASSERTION_REQUIRED` when the assertion is missing or names another
 * mailbox — said here as "sign in to Access with this address", never as a
 * wrong password.
 *
 * A forced password change (#248) is its own step: the server answers login
 * with `mustChangePassword` when a temporary password is outstanding, and
 * every other CMS route refuses 403 `PASSWORD_CHANGE_REQUIRED` until it is
 * replaced — so the console routes here rather than into a dead shell.
 *
 * GoGo-BE#679 / ADR-0032 — which doors exist comes from the API
 * (`GET /cms/auth/methods`), read at runtime. Single sign-on through Cloudflare
 * Access is an explicit button, never automatic: an exchange on mount would
 * sign an operator straight back in after logout or an idle timeout. Where the
 * password door is closed the form is not rendered at all.
 */
type Step = 'credentials' | 'change-password'

const BULLETS = ['places', 'moderation', 'observability', 'rbac'] as const

export default function LoginScreen() {
  const t = useT()
  const { locale, setLocale } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    session,
    login,
    signInWithAccess,
    expired,
    signOutIncomplete,
    passwordChanged,
    currentEpoch,
  } = useSession()
  const methods = useAuthMethods()
  /**
   * Review of PR #235 (round 3, F-02): the forced change after a password
   * sign-in is a super-admin password action too. Once the switch is known to
   * be on — read, or learned from a 403 SUPER_ADMIN_SSO_ONLY to the change,
   * which `useChangeOwnPassword` writes into the shared `methods` answer — the
   * form is replaced by the one action the API accepts in this state: the SSO
   * confirmation (`@AllowWhilePasswordChangePending` on GoGo-BE).
   */
  const forcedNoPassword =
    useSuperAdminPasswordGate(session?.role === 'super_admin').state === 'ssoOnly'
  /** Set by a failed exchange; `adminOnly` also offers to switch identity. */
  const [ssoError, setSsoError] = useState<{
    message: string
    adminOnly?: boolean
    reload?: boolean
  } | null>(null)
  const [ssoPending, setSsoPending] = useState(false)
  const environment = getAppEnvironment()
  // Set by RequireAuth when it bounced an authenticated route.
  const returnTo = (location.state as { from?: string } | null)?.from

  const [step, setStep] = useState<Step>('credentials')
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  // Shared with the self-service screen (CMS-032): same floor, same
  // confirmation, same refusals — the only difference is where the current
  // password comes from.
  const changePassword = useChangeOwnPassword()
  /** Where to land once the obligation is cleared. */
  const pendingDestination = useRef<string>('/')

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    // An alert left by an earlier attempt (e.g. SUPER_ADMIN_SSO_ONLY for the
    // super admin's address) is about that attempt, not this one (review F-05).
    setSsoError(null)
    try {
      const session = await login({ email: values.email, password: values.password })
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
      if (error.code === 'ACCESS_ASSERTION_REQUIRED') {
        // GoGo-BE#687 D-4 — answered before the password is compared: Access
        // did not admit this address on this request. Not a credential problem.
        setFormError(t('auth.accessAssertionRequired'))
        return
      }
      if (error.code === 'SUPER_ADMIN_SSO_ONLY') {
        // GoGo-BE#687 — this account is the super admin, which signs in only
        // through Access. Said beside the single sign-on button, which is the
        // way in; the password form stays for the other roles.
        setSsoError({ message: t('auth.sso.superAdminOnly') })
        void methods.refetch()
        return
      }
      if (error.code === 'PASSWORD_LOGIN_DISABLED') {
        // The door closed under an open form. Re-read which doors exist; the
        // form goes away with the answer.
        // Said beside the single sign-on button, since the form this error
        // would sit in is about to go.
        setSsoError({ message: t('auth.sso.passwordDisabled') })
        void methods.refetch()
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

  const startSso = async () => {
    setSsoError(null)
    setFormError(null)
    setSsoPending(true)
    try {
      const session = await signInWithAccess()
      // A reset outstanding is routed by RequireAuth to /account/password,
      // which asks for the current password itself. The change step on this
      // screen cannot be used: it submits the password typed into this form,
      // and a single sign-on typed none.
      navigate(returnTo ?? landingPathFor(session.role), { replace: true })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setSsoError({ message: t('error.UNKNOWN') })
      } else if (error.code === 'ADMIN_ONLY') {
        setSsoError({ message: t('auth.sso.adminOnly'), adminOnly: true })
      } else if (error.code === 'ACCESS_ASSERTION_MISSING') {
        setSsoError({
          message: import.meta.env.DEV ? t('auth.sso.missingLocal') : t('auth.sso.missing'),
        })
      } else if (error.code === 'ACCESS_ASSERTION_INVALID') {
        setSsoError({ message: t('auth.sso.invalid'), reload: true })
      } else if (
        error.code === 'ACCESS_SSO_NOT_CONFIGURED' ||
        error.code === 'PASSWORD_LOGIN_DISABLED'
      ) {
        setSsoError({ message: t('auth.sso.changed') })
        void methods.refetch()
      } else if (error.code === 'ACCESS_KEYS_UNAVAILABLE') {
        setSsoError({ message: t('auth.sso.unavailable') })
      } else if (error.status === 429) {
        setSsoError({ message: t('auth.rateLimited') })
      } else {
        setSsoError({ message: error.message })
      }
    } finally {
      setSsoPending(false)
    }
  }

  const passwordOpen = methods.data?.password === true
  const ssoOpen = methods.data?.accessSso === true

  const submitChangePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const epoch = currentEpoch()
    // The temporary password the operator just signed in with proves the caller
    // is the person it was handed to.
    if (await changePassword.submit(getValues('password'))) {
      // Discharge the obligation before navigating, or the route guard bounces
      // straight back to the change screen (#101).
      passwordChanged(epoch)
      navigate(pendingDestination.current, { replace: true })
    }
  }

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

          {/* The credential may still be live on the server (#100). Saying so
              is the only thing the console can do about it. */}
          {signOutIncomplete ? (
            <p role="status" className={`${styles.alert} mb-4`}>
              <span aria-hidden="true">⚠</span>
              {t('auth.signOutIncomplete')}
            </p>
          ) : null}

          {/*
            The two branches are keyed, and the keys are what makes them two
            forms rather than one (#103).

            Without a key React reconciles by position and type. Both branches
            are a `<form>` holding a `div` of fields, so it keeps the DOM nodes
            and diffs their props: the email box *becomes* the new-password box.
            One input element then changes `type`, `autoComplete` and its
            controlled/uncontrolled contract underneath the browser — the
            situation password managers and autofill get wrong, and the cause of
            the uncontrolled→controlled warning this screen used to print.

            Distinct keys make React unmount the credentials subtree and mount a
            fresh one, so no node ever carries a value typed on the other side of
            a credentials boundary.
          */}
          {step === 'change-password' && forcedNoPassword ? (
            <div key="change-password-sso" className="flex flex-col gap-4">
              <p role="status" className={styles.alert}>
                <span aria-hidden="true">ℹ</span>
                <span>{t('account.password.superAdminSsoOnlyForced')}</span>
              </p>
              <SsoConfirmCard />
            </div>
          ) : step === 'change-password' ? (
            <form key="change-password" onSubmit={submitChangePassword} noValidate>
              <div className={styles.fields}>
                <TextInput
                  label={t('auth.change.newPassword')}
                  type="password"
                  autoComplete="new-password"
                  required
                  hint={t('auth.change.hint')}
                  value={changePassword.newPassword}
                  onChange={(event) => changePassword.setNewPassword(event.target.value)}
                />
                <TextInput
                  label={t('auth.change.confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={changePassword.confirmPassword}
                  onChange={(event) => changePassword.setConfirmPassword(event.target.value)}
                />
              </div>
              {(changePassword.error ?? formError) ? (
                <p role="alert" className={`${styles.alertDanger} mt-4`}>
                  <span aria-hidden="true">⚠</span>
                  {changePassword.error ?? formError}
                </p>
              ) : null}
              <div className="mt-4 flex flex-col gap-2">
                <Button type="submit" variant="primary" loading={changePassword.pending}>
                  {t('auth.change.submit')}
                </Button>
              </div>
            </form>
          ) : step === 'credentials' && methods.isPending ? (
            <div className={styles.fields} aria-busy="true" aria-label={t('auth.sso.loading')}>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : step === 'credentials' && methods.isError ? (
            <div>
              <p role="alert" className={styles.alertDanger}>
                <span aria-hidden="true">⚠</span>
                {t('auth.sso.methodsError')}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="primary"
                  loading={methods.isFetching}
                  disabled={methods.isFetching}
                  onClick={() => void methods.refetch()}
                >
                  {t('auth.sso.retry')}
                </Button>
              </div>
            </div>
          ) : step === 'credentials' && !passwordOpen && !ssoOpen ? (
            <p role="alert" className={styles.alertDanger}>
              <span aria-hidden="true">⚠</span>
              {t('auth.sso.noMethod')}
            </p>
          ) : (
            <>
              {step === 'credentials' && ssoOpen ? (
                <div className={styles.ssoBlock}>
                  <Button
                    type="button"
                    variant="primary"
                    loading={ssoPending}
                    disabled={isSubmitting}
                    onClick={() => void startSso()}
                  >
                    {ssoPending ? t('auth.submitting') : t('auth.sso.button')}
                  </Button>
                  <p className={styles.ssoHint}>{t('auth.sso.hint')}</p>
                  {methods.data?.superAdminSsoOnly ? (
                    <p className={styles.ssoHint}>{t('auth.sso.superAdminHint')}</p>
                  ) : null}
                  {ssoError ? (
                    <div role="alert" className={styles.alertDanger}>
                      <span aria-hidden="true">⚠</span>
                      <span>
                        {ssoError.message}
                        {ssoError.adminOnly ? (
                          <>
                            {' '}
                            <a className={styles.ssoLink} href="/cdn-cgi/access/logout">
                              {t('auth.sso.switchIdentity')}
                            </a>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  {ssoError?.reload ? (
                    // Access issues a fresh assertion only on a navigation; a
                    // second exchange from this page would send the stale one.
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => window.location.reload()}
                    >
                      {t('auth.sso.reload')}
                    </Button>
                  ) : null}
                  {passwordOpen ? (
                    <p className={styles.ssoDivider}>{t('auth.sso.orPassword')}</p>
                  ) : null}
                </div>
              ) : null}
              {passwordOpen ? (
                <form key="credentials" onSubmit={onSubmit} noValidate>
                  <div className={styles.fields}>
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

                  {formError ? (
                    <p role="alert" className={`${styles.alertDanger} mt-4`}>
                      <span aria-hidden="true">⚠</span>
                      {formError}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2">
                    {/* One filled CTA per screen: beside single sign-on, the password
                    submit steps down to secondary. */}
                    <Button
                      type="submit"
                      variant={ssoOpen ? 'secondary' : 'primary'}
                      loading={isSubmitting}
                      disabled={ssoPending}
                    >
                      {isSubmitting ? t('auth.submitting') : t('auth.continue')}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          )}

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
