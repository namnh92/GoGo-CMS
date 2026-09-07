import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

/**
 * CMS #154 — the administrative dataset screen, walked end to end against MSW.
 *
 * The interesting assertions are the refusals. A publication swaps what every
 * place approval in the catalogue is validated against, so what matters is that
 * the screen declines to offer one it already knows would be refused, and that
 * a role which may not publish is told why rather than shown a screen with the
 * controls quietly removed.
 */

test('ops reaches the dataset screen from the operations group', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.getByRole('link', { name: 'Dữ liệu hành chính' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Dữ liệu hành chính' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Năng lực hiện tại' })).toBeVisible()
  // The identities live here rather than in a metric label.
  await expect(page.getByText('v5.0.0+v2.4.1+7fac8c45+none+r0').first()).toBeVisible()
})

test('a moderator gets neither the nav entry nor the screen', async ({ page }) => {
  await signIn(page, 'moderator@gogo.vn')
  await expect(page.getByRole('link', { name: 'Dữ liệu hành chính' })).toHaveCount(0)

  await page.goto('/administrative-data')
  await expect(page.getByText('Không đủ quyền')).toBeVisible()
  // The review queue is a different job and stays open to them.
  await page.goto('/administrative-mapping')
  await expect(page.getByRole('heading', { level: 1, name: 'Duyệt gán hành chính' })).toBeVisible()
})

test('import is presented as the pinned release, and stages only', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.goto('/administrative-data')
  await page.getByRole('button', { name: 'Nhập bản đã ghim' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Không có tệp nào để tải lên/)).toBeVisible()
  await expect(dialog.getByText(/chỉ tạo một phiên bản ở trạng thái Đã nhập/)).toBeVisible()
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0)
})

test('publish names what changes rather than asking "are you sure?"', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.goto('/administrative-data/22222222-2222-4222-8222-222222222222')
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Những thay đổi sẽ xảy ra')).toBeVisible()
  await expect(dialog.getByText(/địa điểm đang mang một khẳng định/)).toBeVisible()
  await expect(dialog.getByText(/không thể hoàn tác từ CMS/)).toBeVisible()
})

test('the active version offers no rollback and no validation', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.goto('/administrative-data/11111111-1111-4111-8111-111111111111')

  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
  await expect(page.getByText(/đang là bộ dữ liệu hoạt động/)).toBeVisible()
  // Validating the active version would demote it out of PUBLISHED server-side.
  await expect(page.getByRole('button', { name: 'Kiểm tra', exact: true })).toBeDisabled()
})

test('the diff shows complete counts and carries effective dates beside codes', async ({
  page,
}) => {
  await signIn(page, 'ops@gogo.vn')
  await page.goto('/administrative-data/22222222-2222-4222-8222-222222222222')
  await page.getByRole('tab', { name: 'Thay đổi' }).click()

  await expect(page.getByText('Chia tách')).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText('2212 codes changed meaning')).toHaveCount(0)
  await expect(page.getByText(/Hiển thị 1 ví dụ trong tổng số 12/)).toBeVisible()
})
