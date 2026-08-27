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

  // The nav entry is not offered — `ops` routes ask for rank 2 and an editor
  // is rank 1, so it cannot even read them.
  await expect(page.getByRole('link', { name: 'Cấu hình' })).toHaveCount(0)
  // …and typing the URL lands on permission-denied, never a blank page.
  await page.goto('/settings')
  await expect(page.getByText('Không đủ quyền')).toBeVisible()
})

test('moderator lands on the queue and may read but not edit the catalog', async ({ page }) => {
  await signIn(page, 'moderator@gogo.vn')
  await expect(page).toHaveURL(/\/moderation$/)

  // Reads are hierarchical since GoGo-BE#144, so the catalog opens…
  await page.goto('/places')
  await expect(page.getByRole('heading', { name: 'Quản lý địa điểm' })).toBeVisible()
  // …but writing is exact-match, so nothing on it is actionable.
  await expect(page.getByRole('button', { name: /Thêm địa điểm/ })).toBeDisabled()
})

test('ops admin may read the catalog and still cannot edit a place', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.goto('/places')
  await expect(page.getByRole('heading', { name: 'Quản lý địa điểm' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Thêm địa điểm/ })).toBeDisabled()
})

test('editor may read the moderation queue and not decide on it', async ({ page }) => {
  await signIn(page, 'editor@gogo.vn')
  await page.goto('/moderation')
  await expect(page.getByRole('heading', { name: 'Bảng kiểm duyệt nội dung' })).toBeVisible()
  await page.getByLabel(/Lý do quyết định/).fill('Nội dung vi phạm quy tắc cộng đồng.')
  await expect(page.getByRole('button', { name: 'Đã xử lý' })).toBeDisabled()
})

test('ops admin sees the dashboard and the publish CTA', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await expect(page.getByRole('heading', { name: 'Sức khoẻ hệ thống' })).toBeVisible()
  await page.getByRole('link', { name: 'Nhập liệu' }).click()
  await expect(page.getByRole('heading', { name: 'Quản lý nhập hàng loạt' })).toBeVisible()
})

/**
 * SEC-001 — break-glass is deliberately open to every active admin. A narrower
 * list rebuilds the shared-super_admin problem it exists to prevent.
 */
for (const [email, role] of [
  ['editor@gogo.vn', 'editor'],
  ['moderator@gogo.vn', 'moderator'],
  ['ops@gogo.vn', 'ops_admin'],
] as const) {
  test(`${role} can reach the emergency takedown`, async ({ page }) => {
    await signIn(page, email)
    await page.goto('/places')
    await page.getByRole('button', { name: 'Gỡ khẩn cấp' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // It names the transition and warns, rather than asking "are you sure?".
    await expect(dialog.getByText('suspended')).toBeVisible()
    await expect(dialog.getByText(/ghi audit/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Gỡ ngay' })).toBeDisabled()
  })
}
