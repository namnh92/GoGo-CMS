import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers'

/**
 * GoGo-CMS#246. The token test proves the pairs; this proves the screens use
 * them. White on the old coral CTA measured 4.09:1 and nothing failed, because
 * no test looked at a rendered button.
 *
 * Only `color-contrast` is asserted: the other axe rules are worth having, but
 * each one is its own fix and its own issue.
 */
async function contrastViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  return result.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
  )
}

test('login has no colour-contrast violations', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Tiếp tục' })).toBeVisible()
  expect(await contrastViolations(page)).toEqual([])
})

test('the place list has no colour-contrast violations', async ({ page }) => {
  await signIn(page, 'editor@gogo.vn')
  await page.goto('/places')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  expect(await contrastViolations(page)).toEqual([])
})

test('imports has no colour-contrast violations', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.goto('/imports')
  await expect(page.getByRole('heading', { name: 'Quản lý nhập hàng loạt' })).toBeVisible()
  expect(await contrastViolations(page)).toEqual([])
})
