import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signIn } from './helpers'

/**
 * CMS-056 (#270): `public` offered by the server's word, device counts apart.
 * The flag-off cell is in Vitest: MSW answers from a service worker here, out of
 * `page.route`'s reach.
 */
test('public is offered when the server allows it, and its counts read apart', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.goto('/campaigns')
  await page.getByRole('button', { name: 'Tạo chiến dịch' }).click()
  const drawer = page.getByRole('dialog')
  const audience = drawer.getByLabel(/Đối tượng/)
  await expect(audience.locator('option[value="public"]')).toHaveCount(1)
  await audience.selectOption('public')
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  )
  await page.keyboard.press('Escape')

  await page.goto('/campaigns/cp-cong-khai')
  await expect(page.getByText('Thiết bị provider đã nhận')).toBeVisible()
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([])
})
