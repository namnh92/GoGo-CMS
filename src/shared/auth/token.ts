/**
 * In-memory only, on purpose.
 *
 * `POST /v1/cms/auth/login` also sets the `gogo_at` HttpOnly cookie, which is
 * what actually authenticates a same-origin CMS deployment. The `accessToken`
 * in the response body is kept here as the fallback for split-origin dev
 * setups where the cookie cannot be sent. It never touches localStorage,
 * sessionStorage or the URL, so a reload simply re-authenticates by cookie.
 */
let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}
