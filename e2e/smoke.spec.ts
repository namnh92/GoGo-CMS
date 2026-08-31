import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

/**
 * Render smoke over every route.
 *
 * The role matrix checks who may do what; this checks that each screen draws
 * at all against the mock contract, with no console error and nothing stuck in
 * a loading state — the failure mode a shape change produces, and the one a
 * per-feature test can miss because it only mounts one screen.
 */

const SCREENS: [string, RegExp][] = [
  ['/', /Sức khoẻ hệ thống/],
  ['/places', /Quản lý địa điểm/],
  ['/places/pl-chao-ban', /Chào Bạn Cafe/],
  ['/imports', /Quản lý nhập hàng loạt/],
  ['/imports/new', /nhập/i],
  ['/moderation', /Bảng kiểm duyệt/],
  ['/moderation/reviews', /Đánh giá của người dùng/],
  ['/submissions', /Đề xuất địa điểm từ app/],
  ['/taxonomy', /Hệ thống phân loại/],
  ['/collections', /Bộ sưu tập/],
  ['/recommendations', /Gợi ý biên tập/],
  ['/plan-templates', /Mẫu lịch trình/],
  ['/banners', /Banner trang chủ/],
  ['/banners/bn-tet-hero', /Hero Tết 2026/],
  ['/safety-rules', /Luật Trust & Safety/],
  ['/campaigns', /Chiến dịch thông báo/],
  ['/campaigns/cp-dang-gui', /Khảo sát trải nghiệm/],
  ['/settings', /Vận hành và cấu hình/],
  ['/settings/accounts', /Tài khoản CMS/],
  ['/roles', /Vai trò & quyền/],
  ['/audit', /Nhật ký kiểm toán/],
  ['/search-quality', /Chất lượng tìm kiếm/],
]

test('every screen renders for a super admin with no console error', async ({ page }) => {
  const problems: string[] = []

  // Listeners attach after sign-in: the stepped flow (CMS-034) answers the
  // first credentials POST with 401 MFA_REQUIRED by design, and the browser
  // logs every 401 as a console error. That 401 is the contract working, not
  // a defect — the screens after it still must produce none.
  await signIn(page, 'boss@gogo.vn')
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  await expect(page.getByRole('heading', { level: 1, name: /Sức khoẻ hệ thống/ })).toBeVisible()

  for (const [path, marker] of SCREENS) {
    await page.goto(path)
    // Scope to the content region: the nav carries the same words, so matching
    // anywhere would screenshot a still-loading page.
    await expect(page.getByRole('main').getByText(marker).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('main').getByText('Đang tải…')).toHaveCount(0)
    // Nothing may sit in a permanent loading or error state.
    await expect(page.getByText('Không tải được dữ liệu')).toHaveCount(0)
  }

  expect(problems).toEqual([])
})

test('settings A/B tab and config evaluation render live', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')

  await page.goto('/settings')
  await page.getByRole('tab', { name: /Thử nghiệm A\/B/ }).click()
  await expect(page.getByText('suggestion.scoring.ab', { exact: true })).toBeVisible()
  await expect(page.getByText(/Nhóm đối chứng: 80/)).toBeVisible()

  await page.getByRole('button', { name: 'Đánh giá' }).first().click()
  await expect(page.getByText('Giữ nguyên hạng nhất')).toBeVisible()
  await expect(page.getByText(/Bỏ qua 2 lượt/)).toBeVisible()
})

test('place editor shows the two ratings apart and media provenance', async ({ page }) => {
  await signIn(page, 'editor@gogo.vn')

  await page.goto('/places/pl-chao-ban')
  await expect(page.getByText('Xếp hạng provider', { exact: true })).toBeVisible()
  await expect(page.getByText('Xếp hạng GoGo', { exact: true })).toBeVisible()
  // No composite score exists anywhere, so no figure may be shown for one.
  await expect(page.getByText('Điểm tổng hợp', { exact: true })).toHaveCount(0)
  await expect(page.getByText('ChIJ_chao_ban_cafe')).toBeVisible()
  await expect(page.getByText('Dữ liệu © Google')).toBeVisible()
})
