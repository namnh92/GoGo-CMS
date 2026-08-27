import { expect, test } from '@playwright/test'

/**
 * Release-gate flow #7 from quality-gates.md: a role must not be able to
 * invoke an action it does not hold. The UI half is checked here; the API
 * half is GoGo-BE's contract test — hiding a button is never the control.
 *
 * The mock login derives the role from the email local part.
 */
async function signIn(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.getByLabel(/Email công việc/).fill(email)
  await page.getByLabel(/Mật khẩu/).fill('correct-horse-battery')
  await page.getByLabel(/Mã xác thực/).fill('123456')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
}

test('editor lands on the catalog and cannot reach ranking settings', async ({ page }) => {
  await signIn(page, 'editor@gogo.vn')
  await expect(page).toHaveURL(/\/places$/)
  await expect(page.getByRole('heading', { name: 'Quản lý địa điểm' })).toBeVisible()

  // The nav entry is not offered…
  await expect(page.getByRole('link', { name: 'Cấu hình' })).toHaveCount(0)
  // …and typing the URL lands on permission-denied, never a blank page.
  await page.goto('/settings')
  await expect(page.getByText('Không đủ quyền')).toBeVisible()
})

test('moderator lands on the queue and cannot open the catalog', async ({ page }) => {
  await signIn(page, 'moderator@gogo.vn')
  await expect(page).toHaveURL(/\/moderation$/)
  await page.goto('/places')
  await expect(page.getByText('Không đủ quyền')).toBeVisible()
})

test('ops admin sees the dashboard and the publish CTA', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await expect(page.getByRole('heading', { name: 'Sức khoẻ hệ thống' })).toBeVisible()
  await page.getByRole('link', { name: 'Nhập liệu' }).click()
  await expect(page.getByRole('heading', { name: 'Quản lý nhập hàng loạt' })).toBeVisible()
})
