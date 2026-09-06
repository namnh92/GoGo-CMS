import { useState } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { ApiError } from '@/shared/api/errors'
import { changeOwnPassword } from '@/features/admins/api'

/**
 * `POST /cms/auth/change-password`, and the two rules around it that are the
 * same wherever it is called from.
 *
 * Two screens reach this endpoint and they differ in one thing only: where the
 * *current* password comes from. On the forced step after a reset it is the
 * temporary password the operator has just signed in with; on the self-service
 * screen they type it. Everything else — the length floor, the confirmation
 * match, which refusals get their own sentence — is identical, so it lives here
 * rather than in two copies that drift.
 *
 * **Sessions.** The server keeps the session that made the call and revokes
 * every other session of that account (GoGo-BE ADR-0018). Both halves are
 * deliberate: the caller authenticated a moment ago and is still working, and a
 * password change is also how someone answers a suspected compromise — which is
 * worth nothing if the other sessions live on. Callers must say so before the
 * submit, not after.
 *
 * The 12-character floor is the server's. It is checked here too so the refusal
 * arrives without a round trip, never to define a different bound.
 */
export function useChangeOwnPassword() {
  const t = useT()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const reset = () => {
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
  }

  /**
   * Returns whether the change went through. The caller decides what happens
   * next — the login screen continues into the console, the account screen
   * stays where it is and confirms.
   */
  const submit = async (currentPassword: string): Promise<boolean> => {
    setError(null)
    if (newPassword.length < 12) {
      setError(t('auth.change.tooShort'))
      return false
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.change.mismatch'))
      return false
    }
    setPending(true)
    try {
      await changeOwnPassword({ currentPassword, newPassword })
      return true
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'PASSWORD_UNCHANGED') {
        setError(t('auth.change.unchanged'))
      } else if (cause instanceof ApiError && cause.status === 429) {
        // Five per five minutes per actor. Distinct from a wrong password:
        // waiting fixes this one and retyping does not.
        setError(t('auth.rateLimited'))
      } else if (cause instanceof ApiError && cause.status === 401) {
        setError(t('auth.badCredentials'))
      } else if (cause instanceof ApiError) {
        setError(cause.message)
      } else {
        setError(t('error.UNKNOWN'))
      }
      return false
    } finally {
      setPending(false)
    }
  }

  return {
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    setError,
    pending,
    submit,
    reset,
  }
}
