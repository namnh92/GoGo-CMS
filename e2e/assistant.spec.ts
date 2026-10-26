import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers'

/**
 * GoGo-CMS#249 — the GoGo AI back office against the MSW contract mock:
 * role-gated navigation, publish with a previewed diff, the feedback queue
 * and the kill switch, plus axe on each screen.
 */

const VOTING = '/assistant/documents/0f6a1e2b-1111-4000-8000-000000000001'

async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  )
}

test('editor opens the guide from the nav, edits the draft, and is not offered publish', async ({
  page,
}) => {
  await signIn(page, 'editor@gogo.vn')
  await expect(page).toHaveURL(/\/places$/)
  await page.getByRole('link', { name: 'Tài liệu nguồn (GoGo guide)' }).click()
  await expect(page.getByRole('heading', { name: 'Tài liệu nguồn GoGo AI' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Công tắc tắt trợ lý' })).toHaveCount(0)
  expect(await axeViolations(page)).toEqual([])

  await page.getByText('plans.voting').click()
  await expect(page.getByText('Bản nháp v3 · lần sửa 2')).toBeVisible()
  await page.getByLabel(/^Mô tả/).fill('Cách bình chọn và chốt kế hoạch nhóm.')
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
  await expect(page.getByText('Bản nháp v3 · lần sửa 3')).toBeVisible()
  await expect(page.getByRole('button', { name: /Xuất bản bản nháp/ })).toHaveCount(0)
  expect(await axeViolations(page)).toEqual([])

  // GoGo-BE#713 Q8: the feedback queue is outside rank-read for an editor.
  await expect(page.getByRole('link', { name: 'Phản hồi câu trả lời' })).toHaveCount(0)
  await page.goto('/assistant/feedback')
  await expect(page.getByText('Không đủ quyền')).toBeVisible()
})

test('ops admin publishes a draft after reading the diff', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.goto(VOTING)
  await page.getByRole('button', { name: 'Xuất bản bản nháp v3' }).click()
  const dialog = page.getByRole('dialog', { name: 'Xuất bản v3?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('region', { name: 'Khác biệt nội dung' })).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
  await dialog.getByRole('button', { name: 'Xuất bản v3' }).click()
  await expect(page.getByText('Đã xuất bản v3.')).toBeVisible()

  await page.getByRole('tab', { name: 'Nhật ký thay đổi' }).click()
  await expect(page.getByText('assistant_document.published').first()).toBeVisible()
})

test('moderator reads the feedback queue and gets no kill switch', async ({ page }) => {
  await signIn(page, 'moderator@gogo.vn')
  await page.getByRole('link', { name: 'Phản hồi câu trả lời' }).click()
  await expect(page.getByRole('heading', { name: 'Phản hồi câu trả lời GoGo AI' })).toBeVisible()
  await expect(page.getByText(/Hội thoại #c9f1a2b3/)).toBeVisible()
  await expect(page.getByText('Bị cắt ngắn')).toBeVisible()
  await expect(page.getByText(/Câu hỏi của người dùng không hiển thị trong v1/)).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  await expect(page.getByRole('link', { name: 'Công tắc tắt trợ lý' })).toHaveCount(0)
  await page.goto('/assistant/kill-switch')
  await expect(page.getByText('Không đủ quyền')).toBeVisible()
})

test('ops admin turns the assistant on through a previewed confirmation', async ({ page }) => {
  await signIn(page, 'ops@gogo.vn')
  await page.getByRole('link', { name: 'Công tắc tắt trợ lý' }).click()
  await expect(page.getByText('Đang tắt')).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
  await page.getByRole('button', { name: 'Bật trợ lý' }).click()
  const dialog = page.getByRole('dialog', { name: 'Bật GoGo AI?' })
  await expect(dialog.getByText('assistant.enabled')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Bật trợ lý' })).toBeDisabled()
  // Checked while the confirm is still locked: right after it unlocks, axe
  // can catch the button mid colour-transition.
  expect(await axeViolations(page)).toEqual([])
  await dialog.getByLabel(/Lý do thay đổi/).fill('Ra mắt nội bộ cho nhóm vận hành')
  await dialog.getByRole('button', { name: 'Bật trợ lý' }).click()
  await expect(page.getByText('Đang bật')).toBeVisible()
  await expect(page.getByText('feature_flag.set').first()).toBeVisible()
  await expect(page.getByText(/Ra mắt nội bộ cho nhóm vận hành/)).toBeVisible()
})
