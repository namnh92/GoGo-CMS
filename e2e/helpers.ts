import type { Page } from '@playwright/test'

/**
 * Signs in through the real stepped flow (CMS-034): credentials first, then
 * the MFA step the server's MFA_REQUIRED answer opens. The mock login derives
 * the role from the email local part.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/Email công việc/).fill(email)
  await page.getByLabel(/Mật khẩu/).fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await page.getByLabel(/Mã xác thực/).fill('123456')
  await page.getByRole('button', { name: 'Xác thực & đăng nhập' }).click()
}
