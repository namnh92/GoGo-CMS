import { useMutation } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { ApiError } from '@/shared/api/errors'
import { Card } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { confirmSuperAdminSso } from './api'
import { styles } from './ssoConfirm.style'

/**
 * GoGo-BE#687 (R4) — the super admin confirms that Cloudflare Access works for
 * its current address. Rendered for the super admin only; the API refuses
 * everyone else and any session not opened through Access, and each refusal is
 * said in words here rather than as a dead button.
 */
export function SsoConfirmCard() {
  const t = useT()
  const mutation = useMutation({ mutationFn: confirmSuperAdminSso })
  // An API older than alpha.71 has no such route: the button would only ever
  // call it again (review F-04). Terminal, so the control goes unavailable.
  const unsupported = mutation.error instanceof ApiError && mutation.error.status === 404

  const errorText = (() => {
    const error = mutation.error
    if (!error) return null
    if (!(error instanceof ApiError)) return t('error.UNKNOWN')
    if (error.code === 'ACCESS_SESSION_REQUIRED') return t('admins.ssoConfirm.needAccess')
    // The contract's two "not the super admin" refusals (review F-03).
    if (error.code === 'ROLE_DENIED' || error.code === 'ADMIN_ONLY')
      return t('admins.ssoConfirm.notSuperAdmin')
    if (error.status === 404) return t('admins.ssoConfirm.unsupported')
    if (error.status === 429) return t('auth.rateLimited')
    return error.message
  })()

  return (
    <Card>
      <div className={styles.body}>
        <div className={styles.text}>
          <span className={styles.title}>{t('admins.ssoConfirm.title')}</span>
          <span className={styles.hint}>{t('admins.ssoConfirm.hint')}</span>
          {mutation.data ? (
            <div role="status" className={styles.ok}>
              <span aria-hidden="true">✓</span>
              <span>
                {mutation.data.alreadyConfirmed
                  ? t('admins.ssoConfirm.already', { email: mutation.data.email })
                  : t('admins.ssoConfirm.done', { email: mutation.data.email })}
              </span>
            </div>
          ) : null}
          {errorText ? (
            <div role="alert" className={styles.error}>
              <span aria-hidden="true">⚠</span>
              <span>{errorText}</span>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={mutation.isPending}
          disabled={mutation.isPending || unsupported}
          onClick={() => mutation.mutate()}
        >
          {t('admins.ssoConfirm.action')}
        </Button>
      </div>
    </Card>
  )
}
