import type { Page } from '@playwright/test'

/**
 * Signs in through the one credentials step (GoGo-BE#687 D-4 removed the TOTP
 * step). The mock login derives the role from the email local part.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/Email công việc/).fill(email)
  await page.getByLabel(/Mật khẩu/).fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
}
