import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

/**
 * ADM-108 — an editor cannot mistake legacy Area for the canonical hierarchy,
 * because no current screen shows them the legacy one.
 *
 * The audit that settled it: every stored Area value is a geographic address
 * grouping — `hcm_q1` "Quận 1, TP.HCM", `hcm_q3` "Quận 3, TP.HCM",
 * `hcm_thuduc` "TP. Thủ Đức", `hn_hoankiem` "Hoàn Kiếm, Hà Nội" — and
 * `service_areas` stores a centre, a radius and a parent city for each. Three of
 * the four name districts, a tier dissolved on 2025-07-01. Beside
 * `province_code` / `commune_code` it is a second answer to the same question,
 * and an out-of-date one.
 *
 * These two walks are also where the screenshots on the PR come from.
 */

const AREA_WORDING = /khu vực|hcm_q1|hcm_q3|hcm_thuduc|hn_hoankiem/i
const DISTRICT_LEVEL = /quận\/huyện|\bdistrict\b/i

test('the place list groups by province and commune, and offers no Area', async ({ page }) => {
  // Wide enough that the table is not cut off in the evidence shot.
  await page.setViewportSize({ width: 1600, height: 1000 })
  await signIn(page, 'editor@gogo.vn')
  await page.goto('/places')

  const hierarchy = page.getByRole('region', { name: 'Tỉnh/Thành phố → Phường/Xã' })
  await expect(hierarchy).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Địa chỉ hành chính' })).toBeVisible()

  // No filter, no column, no stray key in a cell.
  await expect(page.getByRole('combobox', { name: AREA_WORDING })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: /Khu vực/ })).toHaveCount(0)
  await expect(page.getByText(AREA_WORDING)).toHaveCount(0)
  await expect(page.getByText(DISTRICT_LEVEL)).toHaveCount(0)

  await page.screenshot({ path: 'test-results/adm-108-place-list.png' })
})

test('the add form offers exactly two administrative selectors', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await signIn(page, 'editor@gogo.vn')
  await page.goto('/places/new')

  await expect(page.getByLabel(/Tỉnh \/ thành phố/)).toBeVisible()
  await expect(page.getByLabel(/Phường \/ xã/)).toBeVisible()
  // A third box would be either a dissolved tier or a competing vocabulary.
  await expect(page.getByText(AREA_WORDING)).toHaveCount(0)
  await expect(page.getByText(DISTRICT_LEVEL)).toHaveCount(0)

  /*
   * The form scrolls inside its own container, so a page shot from the top
   * would show the link panel and nothing else. Scroll the pair into view: the
   * address section is what is being evidenced — two selectors, no third box.
   */
  await page.getByLabel(/Phường \/ xã/).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/adm-108-add-place.png' })
})
