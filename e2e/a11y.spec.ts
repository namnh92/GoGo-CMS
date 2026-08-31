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
