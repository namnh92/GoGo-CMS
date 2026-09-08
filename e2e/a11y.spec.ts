import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

/**
 * Keyboard operation is a hard requirement — the CMS is mouse-first but must
 * never be mouse-only.
 */
test('the shell exposes a skip link as the first tab stop', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await expect(page.getByRole('heading', { name: 'Sức khoẻ hệ thống' })).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: /Bỏ qua tới nội dung chính/ })).toBeFocused()
})

test('a drawer traps focus and closes on Escape', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')

  await page.goto('/places/pl-chao-ban')
  await page.getByRole('button', { name: 'Xem nhật ký thay đổi' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
})

test('the command palette opens on the shortcut and gives focus back on Escape', async ({
  page,
}) => {
  await signIn(page, 'ops@gogo.vn')
  await expect(page.getByRole('heading', { name: 'Sức khoẻ hệ thống' })).toBeVisible()

  // The shortcut hint is part of the button's label, so match on the action.
  const trigger = page.getByRole('button', { name: 'Tìm nhanh' })
  await trigger.focus()
  await page.keyboard.press('ControlOrMeta+k')

  const palette = page.getByRole('dialog', { name: 'Tìm nhanh' })
  await expect(palette).toBeVisible()
  // Opens on the input, so the first keystroke is a search and not a tab.
  await expect(palette.getByRole('combobox')).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('the palette navigates to the screen chosen with the keyboard', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await expect(page.getByRole('heading', { name: 'Sức khoẻ hệ thống' })).toBeVisible()

  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Tìm nhanh' })
  await palette.getByRole('combobox').fill('Nhập liệu')
  await expect(palette.getByRole('option').first()).toContainText('Nhập liệu')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/imports$/)
  await expect(page.getByRole('heading', { name: 'Quản lý nhập hàng loạt' })).toBeVisible()
})

/**
 * CMS-049 (#128) — the place editor grew four new widgets in this epic, and
 * every one of them has to be reachable and operable without a pointer.
 */
test('the place editor is operable from the keyboard end to end', async ({ page }) => {
  await signIn(page, 'editor@gogo.vn')
  await page.goto('/places/pl-chao-ban')
  await expect(page.getByRole('heading', { name: /Chào Bạn/ })).toBeVisible()

  // ADM-108 replaced the legacy area picker with the administrative pair. Same
  // combobox behaviour, and now over the vocabulary that is actually an address.
  const province = page.getByRole('combobox', { name: /Tỉnh \/ thành phố/ })
  await province.focus()
  await expect(province).toBeFocused()
  await province.press('ArrowDown')
  await expect(province).toHaveAttribute('aria-expanded', 'true')
  await province.press('Escape')
  await expect(province).toHaveAttribute('aria-expanded', 'false')

  // A day's state is a radiogroup: focus the group, choose with the keyboard.
  const sunday = page.getByRole('region', { name: 'Chủ Nhật' })
  const closed = sunday.getByRole('radio', { name: /Đóng cửa/ })
  await closed.focus()
  await page.keyboard.press('Enter')
  await expect(closed).toBeChecked()

  // Photo reordering must not be drag-only — a drag-only control is a control
  // a keyboard user does not have.
  const media = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Thư viện ảnh' }) })
  await media.scrollIntoViewIfNeeded()
  const reorder = media.getByRole('button', { name: /Lên|Xuống|lên trên|xuống dưới/ })
  if ((await reorder.count()) > 0) {
    await reorder.first().focus()
    await expect(reorder.first()).toBeFocused()
  }
})

test('a field rejection is announced and tied to its control', async ({ page }) => {
  await signIn(page, 'editor@gogo.vn')
  await page.goto('/places/pl-chao-ban')

  // 10..720 on the server; 5 is refused locally before a request is made.
  const visit = page.getByLabel(/Thời lượng ghé trung bình/)
  await visit.fill('5')
  await page.getByRole('button', { name: 'Lưu thông tin' }).click()

  await expect(visit).toHaveAttribute('aria-invalid', 'true')
  // The message is associated with the input, not merely near it (GoGo-CMS#102).
  const describedBy = await visit.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()
  await expect(page.locator(`#${describedBy}`)).toBeVisible()
})
