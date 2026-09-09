import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

/**
 * PI-CMS-008 / GoGo-BE#528 — reviewing a contribution end to end in a browser.
 *
 * The screen this replaces could approve, reject or merge a Google Place ID.
 * What is checked here is the difference a person would notice: the queue names
 * what it can and admits what it cannot, opening a proposal is free, Google
 * costs a deliberate click, supplementing is a separate save, and a merge
 * target is picked out of the catalogue rather than typed as a UUID.
 */

const FRESH = '/submissions/9a1d0c00-0000-4000-8000-000000000001'

test('the queue admits when it has no name, and never fakes one', async ({ page }) => {
  await signIn(page, 'moderator@gogo.local')
  await page.goto('/submissions')

  await expect(page.getByText('Chưa có tên')).toBeVisible()
  await expect(page.getByText(/GoGo không lưu tên Google/)).toBeVisible()
  // A name GoGo does hold is shown, and it says where it came from.
  await expect(page.getByText('Cà phê Ngọc Hà')).toBeVisible()
  await expect(page.getByText('Tên do kiểm duyệt viên đặt')).toBeVisible()
})

test('a reviewer sees the place, supplements it, and neither step approves it', async ({
  page,
}) => {
  await signIn(page, 'moderator@gogo.local')
  await page.goto(FRESH)

  const drawer = page.getByRole('dialog', { name: /Kiểm duyệt đề xuất/ })
  await expect(drawer).toBeVisible()

  // What the contributor sent is on screen without asking Google anything.
  await expect(drawer.getByText('Quán mới mở, view đẹp')).toBeVisible()
  await expect(drawer.getByText(/Chưa tải dữ liệu Google/)).toBeVisible()

  // Google is a click, and the cost of that click is stated next to it.
  await expect(drawer.getByText(/một truy vấn Google Place Details/)).toBeVisible()
  await drawer.getByRole('button', { name: 'Tải dữ liệu Google' }).click()
  await expect(drawer.getByText('Bảo tàng Hà Nội')).toBeVisible()
  await expect(drawer.getByText(/Thành phố Hà Nội · Phường Từ Liêm/)).toBeVisible()

  // Supplementing is its own save; the decision buttons are untouched by it.
  await expect(drawer.getByRole('button', { name: 'Lưu bổ sung' })).toBeDisabled()
  await drawer.getByLabel(/Tên hiển thị/).fill('Bảo tàng Hà Nội')
  await expect(drawer.getByText('Có bổ sung chưa lưu')).toBeVisible()
  await drawer.getByRole('button', { name: 'Lưu bổ sung' }).click()
  await expect(page.getByText(/Chưa duyệt đề xuất/)).toBeVisible()
})

test('merging picks a place from the catalogue and shows it before confirming', async ({
  page,
}) => {
  await signIn(page, 'moderator@gogo.local')
  await page.goto(FRESH)

  const drawer = page.getByRole('dialog', { name: /Kiểm duyệt đề xuất/ })
  const merge = drawer.getByRole('button', { name: 'Gộp' })

  await drawer.getByLabel(/Lý do quyết định/).fill('trùng địa điểm đã có')
  // A reason alone is not enough: nothing to merge into yet.
  await expect(merge).toBeDisabled()

  await drawer.getByLabel(/Tìm địa điểm để gộp vào/).fill('Chào')
  await drawer.getByRole('button', { name: /Chào Bạn/ }).click()
  await expect(drawer.getByText(/Sẽ gộp vào: Chào Bạn/)).toBeVisible()
  await expect(merge).toBeEnabled()
})

test('an unsaved supplement cannot be lost by closing the drawer', async ({ page }) => {
  await signIn(page, 'moderator@gogo.local')
  await page.goto(FRESH)

  const drawer = page.getByRole('dialog', { name: /Kiểm duyệt đề xuất/ })
  await drawer.getByLabel(/Mô tả/).fill('Sân vườn, hợp nhóm bạn.')
  // Two "Đóng": the drawer's own close glyph in the header and the footer
  // button. Either must be guarded; this takes the footer one.
  await drawer.getByRole('button', { name: 'Đóng', exact: true }).last().click()

  await expect(page.getByRole('dialog', { name: /Rời trang/ })).toBeVisible()
  await expect(drawer).toBeVisible()
})
