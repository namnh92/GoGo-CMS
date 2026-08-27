import { expect, test } from '@playwright/test'

/**
 * PI-CMS-001..006 walked end to end against the mock: history → wizard →
 * job detail → candidate confirmation → publish.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/Email công việc/).fill('ops@gogo.vn')
  await page.getByLabel(/Mật khẩu/).fill('correct-horse-battery')
  await page.getByLabel(/Mã xác thực/).fill('123456')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
})

test('a quota-paused job reads as an interruption, not a data error', async ({ page }) => {
  await page.goto('/imports')
  await expect(page.getByText('Nhà cung cấp hết hạn mức')).toBeVisible()
  await expect(page.getByText(/Dữ liệu của bạn còn nguyên/)).toBeVisible()
})

test('the wizard defaults to dry run and requires the mapped fields', async ({ page }) => {
  await page.goto('/imports/new')
  await expect(page.getByRole('heading', { name: 'Tạo phiên nhập mới' })).toBeVisible()

  await page
    .getByRole('button', { name: /Google Sheet/ })
    .first()
    .click()
  await page
    .getByLabel(/Đường dẫn Google Sheet/)
    .fill('https://docs.google.com/spreadsheets/d/abc123')
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await page.getByRole('button', { name: 'Tiếp tục' }).click()

  // dry_run is preselected — a writing mode has to be chosen on purpose.
  await expect(page.getByRole('radio', { name: /Chạy thử/ })).toBeChecked()
})

test('an ambiguous row is resolved by picking a surfaced candidate', async ({ page }) => {
  await page.goto('/imports')
  await page.getByText('hcm_q3_cafe_batch4.xlsx').click()

  await expect(page.getByRole('heading', { name: 'hcm_q3_cafe_batch4.xlsx' })).toBeVisible()
  await page.getByRole('button', { name: 'Chọn chi nhánh' }).first().click()

  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText(/Dữ liệu và ảnh từ Google/)).toBeVisible()

  await drawer.getByText('Cộng Cà Phê – Nguyễn Thị Minh Khai').click()
  await drawer.getByRole('button', { name: 'Chọn chi nhánh' }).click()
  await expect(drawer).toBeHidden()
})

test('publishing shows what will change before it runs', async ({ page }) => {
  await page.goto('/imports')
  await page.getByText('hcm_q3_cafe_batch4.xlsx').click()
  await page.getByRole('button', { name: 'Xuất bản vào catalog' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Những thay đổi sẽ xảy ra')).toBeVisible()
  await expect(dialog.getByText(/Khoá phân loại lạ sẽ bị bỏ qua/)).toBeVisible()
})
