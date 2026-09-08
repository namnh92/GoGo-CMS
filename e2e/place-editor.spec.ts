import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers'

/**
 * CMS-049 (#128) — the Place Editor epic, walked in a real browser.
 *
 * ## Two things this file deliberately does not test, and where they live
 *
 * **1. "Tạo nháp" — creating a draft.** The issue's flow starts there, and the
 * CMS cannot do it. GoGo-BE has no `POST /cms/places`, and the console has no
 * `/places/new` route: the primary CTA used to navigate there, `places/:id`
 * matched it, `GET /cms/places/new` answered 404, and an editor got an error
 * screen from the main button. A place enters the catalogue through bulk
 * import (`POST /cms/place-imports`, covered by `import-flow.spec.ts`) or a
 * community submission. This PR makes that control say so rather than faking a
 * create path, and the walk below starts from a place that exists — which is
 * what an editor finishing a place actually does.
 *
 * **2. Injected API failures — 400, 409, 500, offline.** They are not missing;
 * they are asserted one layer down, and they have to be. E2E runs the app
 * against MSW **in a service worker** (`VITE_USE_MOCK=true`), so MSW answers a
 * request inside the page before it reaches the network — which is where
 * Playwright's `page.route` and `context.setOffline` intervene. A fault
 * injected there is never seen. The Vitest suites run the same handlers in
 * Node, where a failing response *can* be injected, and that is where the
 * rejected save, the `409 PLACE_MODIFIED` flow, the retry and the offline
 * disable are covered:
 *
 *   - `placeEditor.test.tsx`   — 400 with `field_errors`, request id, draft kept
 *   - `placeContact.test.tsx`  — phone/website rejections, 409 concurrency
 *   - `hoursEditor.test.tsx`   — a rejected PUT leaving the week untouched
 *   - `placeMedia.test.tsx`    — one file failing without losing the others
 *   - `publishChecklist.test.tsx`, `googleLink.test.tsx`
 *
 * What a browser adds over those is what a browser is for: that the screens
 * compose into one page, that the widgets are reachable and operable with real
 * events, and that a role sees the right thing. That is what is below.
 */

const PLACE = '/places/pl-chao-ban'

async function openEditor(page: Page, email = 'editor@gogo.vn') {
  await signIn(page, email)
  await page.goto(PLACE)
  await expect(page.getByRole('heading', { name: /Chào Bạn/ })).toBeVisible()
}

function card(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) })
}

test.describe('the editor composes', () => {
  test('every block of the epic is on the page and operable', async ({ page }) => {
    await openEditor(page)

    // #123 — address and contact are writable; they used to be read-only `<dd>`
    // facts with a comment saying `cmsUpdatePlace` would not accept them.
    for (const label of [/Điện thoại/, /Website/]) {
      await expect(page.getByLabel(label)).toBeEditable()
    }

    /*
     * ADM-106 — the address is the two administrative levels Vietnam currently
     * has, as pickers over GoGo's own dataset.
     *
     * The free-text "Tỉnh/Thành phố" and "Quận/Huyện" boxes this used to assert
     * are gone: the second named a tier dissolved on 2025-07-01, and the first
     * could not express an identity anything downstream could use.
     */
    await expect(page.getByRole('combobox', { name: /Tỉnh \/ thành phố/ })).toBeEnabled()
    await expect(page.getByRole('combobox', { name: /Phường \/ xã/ })).toBeEnabled()
    await expect(page.getByLabel(/Quận\/Huyện/)).toHaveCount(0)
    /*
     * ADM-108 — and no legacy Area picker either. Every stored Area value is a
     * geographic address grouping (three of the four name dissolved districts),
     * so beside these two it was a second, contradictory answer to "where is
     * this place". The column is still stored; nothing offers it as an address.
     */
    await expect(page.getByRole('combobox', { name: /Khu vực/ })).toHaveCount(0)

    // #124, #125, #127, #126.
    await expect(card(page, 'Giờ mở cửa')).toBeVisible()
    await expect(card(page, 'Thư viện ảnh')).toBeVisible()
    await expect(card(page, 'Trước khi xuất bản')).toBeVisible()
    await expect(card(page, 'Liên kết Google Maps')).toBeVisible()
  })
})

test.describe('opening hours in a real browser', () => {
  test('a day group fills the week and a single day is edited after it', async ({ page }) => {
    await openEditor(page)

    await page.getByRole('button', { name: 'Tất cả các ngày' }).click()
    await page.getByLabel('Giờ mở', { exact: true }).fill('08:00')
    await page.getByLabel('Giờ đóng', { exact: true }).fill('22:00')
    await page.getByRole('button', { name: /Áp dụng cho 7 ngày/ }).click()

    // Days that already carry hours are named before they are replaced — a
    // preview, not a bare "are you sure".
    const confirmTitle = page.getByText('Thay lịch những ngày đã có dữ liệu')
    if (await confirmTitle.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Thay lịch' }).click()
    }

    // Every day now carries the applied window.
    for (const day of ['Thứ Hai', 'Thứ Bảy', 'Chủ Nhật']) {
      await expect(
        page.getByRole('region', { name: day }).getByLabel(`Giờ đóng ngày ${day}`),
      ).toHaveValue('22:00')
    }

    // Saturday alone changes, and nothing else moves.
    const saturday = page.getByRole('region', { name: 'Thứ Bảy' })
    await saturday.getByLabel('Giờ đóng ngày Thứ Bảy').fill('23:30')
    await expect(saturday.getByLabel('Giờ đóng ngày Thứ Bảy')).toHaveValue('23:30')
    await expect(
      page.getByRole('region', { name: 'Thứ Hai' }).getByLabel('Giờ đóng ngày Thứ Hai'),
    ).toHaveValue('22:00')
  })

  test('a half-typed time survives, which the old grid discarded', async ({ page }) => {
    await openEditor(page)

    const monday = page.getByRole('region', { name: 'Thứ Hai' })
    const open = monday.getByLabel('Giờ mở ngày Thứ Hai')
    await open.fill('')
    await open.pressSequentially('9')
    // The old editor parsed on every keystroke and dropped what did not parse,
    // so `9` never appeared on screen.
    await expect(open).toHaveValue('9')
    await open.pressSequentially(':30')
    await expect(open).toHaveValue('9:30')
  })

  test('closed, no-data and open-24h are three different answers', async ({ page }) => {
    await openEditor(page)

    const sunday = page.getByRole('region', { name: 'Chủ Nhật' })
    await sunday.getByRole('radio', { name: /Đóng cửa/ }).click()
    await expect(sunday.getByRole('radio', { name: /Đóng cửa/ })).toBeChecked()

    const wednesday = page.getByRole('region', { name: 'Thứ Tư' })
    await wednesday.getByRole('radio', { name: /Chưa có dữ liệu/ }).click()
    // Said in words, so two empty boxes are never read as "closed".
    await expect(wednesday.getByText(/Chưa có dữ liệu khác với đóng cửa/)).toBeVisible()

    const saturday = page.getByRole('region', { name: 'Thứ Bảy' })
    await saturday.getByRole('radio', { name: /Mở 24 giờ/ }).click()
    await expect(saturday.getByRole('radio', { name: /Mở 24 giờ/ })).toBeChecked()
  })
})

test.describe('photos', () => {
  test('a file picked in the browser lands pending, never published', async ({ page }) => {
    await openEditor(page)

    const media = card(page, 'Thư viện ảnh')
    await media.scrollIntoViewIfNeeded()
    // The visible control is a label over an `sr-only` input; setting files on
    // the input is what a real pick does.
    await media
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'mat-tien.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('a small but well-typed jpeg'),
      })

    // Uploading is not deciding it may be published (GoGo-BE#191).
    await expect(media.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('publish checklist', () => {
  test('separates what the server blocks from what it merely suggests', async ({ page }) => {
    await openEditor(page)

    const checklist = card(page, 'Trước khi xuất bản')
    await expect(checklist.getByText(/Máy chủ chỉ chặn hai điều này/)).toBeVisible()
    // A checklist that looks like a gate but is not one teaches editors to
    // distrust every checklist, so it says which half is which.
    await expect(checklist.getByText(/Không chặn xuất bản/)).toBeVisible()
  })
})

test.describe('coordinates and the Google link', () => {
  test('the location panel is a coordinate readout, not a broken map', async ({ page }) => {
    await openEditor(page)

    await expect(page.getByText(/không phải bản đồ nhúng/)).toBeVisible()
    const link = page.getByRole('link', { name: /Google Maps/ })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('href', /google\.com\/maps\/search/)
  })

  test('a pasted link is compared, and the blocked preview says why', async ({ page }) => {
    await openEditor(page)

    const panel = card(page, 'Liên kết Google Maps')
    await panel.scrollIntoViewIfNeeded()
    await panel
      .getByLabel('Dán link Google Maps')
      .fill('https://www.google.com/maps?place_id=ChIJ_somewhere_else')
    await expect(panel.getByText('Khác với Place ID địa điểm đang lưu')).toBeVisible()

    // Blocked by GoGo-BE#341, and rendered as unavailable with the reason
    // rather than as a button that could only fail (`core.md` §16).
    await expect(panel.getByText('So sánh từng trường với Google: chưa mở')).toBeVisible()
    await expect(panel.getByRole('button', { name: /^So sánh/ })).toHaveCount(0)
  })
})

test.describe('roles', () => {
  test('a moderator reads the editor and can change nothing on it', async ({ page }) => {
    await openEditor(page, 'moderator@gogo.vn')

    // Read is hierarchical; every write is an exact role match.
    await expect(page.getByLabel('Tên hiển thị')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Lưu thông tin' })).toBeDisabled()
    await expect(
      page.getByRole('region', { name: 'Thứ Hai' }).getByLabel('Giờ mở ngày Thứ Hai'),
    ).toBeDisabled()
    // ADM-108 removed the legacy area picker; the administrative pair is the
    // address, and it is disabled for a moderator like everything else here.
    await expect(page.getByLabel(/Tỉnh \/ thành phố/)).toBeDisabled()
  })

  test('an ops admin reads the editor and cannot edit a place either', async ({ page }) => {
    await openEditor(page, 'ops@gogo.vn')
    await expect(page.getByRole('button', { name: 'Lưu thông tin' })).toBeDisabled()
  })

  test('the add-place CTA opens the create form instead of 404-ing', async ({ page }) => {
    await signIn(page, 'editor@gogo.vn')
    await page.goto('/places')

    // The regression this guards: `/places/new` matched `places/:id`, so the
    // primary CTA opened the editor for a place id of "new" and the screen
    // answered 400 (#128). It then shipped disabled until GoGo-BE#452 gave it
    // a create endpoint to call.
    await page.getByRole('button', { name: 'Thêm địa điểm' }).click()

    await expect(page).toHaveURL(/\/places\/new$/)
    await expect(page.getByRole('heading', { name: 'Thêm địa điểm' })).toBeVisible()
    await expect(page.getByLabel(/Tên hiển thị/)).toBeVisible()
    // Not the editor: no place has been created yet, so there is nothing to save.
    await expect(page.getByRole('button', { name: 'Lưu thông tin' })).toHaveCount(0)
  })

  /**
   * GoGo-CMS#157. The screen used to open on a latitude box; the whole point of
   * the link is that an editor never types one. This walks the path a person
   * actually takes — paste, look, accept, create — and checks the boxes carry
   * Google's answer rather than checking that a request was sent.
   */
  test('a Google Maps link fills the form and creates the draft', async ({ page }) => {
    await signIn(page, 'editor@gogo.vn')
    await page.goto('/places/new')

    await page
      .getByLabel('Link Google Maps')
      .fill('https://www.google.com/maps/place/?q=place_id:ChIJcafe&place_id=ChIJcafe')
    await page.getByRole('button', { name: 'Tìm địa điểm' }).click()

    await expect(page.getByText('Google trả về địa điểm này')).toBeVisible()
    // Google requires its attribution to travel with anything it supplied.
    await expect(page.getByText('Dữ liệu bản đồ ©2026 Google')).toBeVisible()

    await page.getByRole('button', { name: 'Dùng dữ liệu này' }).click()

    await expect(page.getByLabel(/Tên hiển thị/)).toHaveValue('Cà Phê Bên Đường')
    await expect(page.getByLabel(/Vĩ độ/)).toHaveValue('10.7951153')
    await expect(page.getByLabel(/Kinh độ/)).toHaveValue('106.7221002')

    await page.getByRole('button', { name: 'Tạo địa điểm' }).click()
    await expect(page).toHaveURL(/\/places\/created-/)
  })

  /**
   * GoGo-CMS#160. The address-bar URL is what people actually copy, and it
   * names a building rather than one of the three places inside it. The answer
   * is a list; the bug was that the list did nothing.
   */
  test('an ambiguous link offers the branches, and the picked one resolves', async ({ page }) => {
    await signIn(page, 'editor@gogo.vn')
    await page.goto('/places/new')

    await page
      .getByLabel('Link Google Maps')
      .fill('https://www.google.com/maps/place/Highlands+Coffee')
    await page.getByRole('button', { name: 'Tìm địa điểm' }).click()

    await expect(page.getByText('Link khớp với nhiều chi nhánh')).toBeVisible()
    await page.getByRole('button', { name: /88 Hai Bà Trưng/ }).click()

    await expect(page.getByText('Google trả về địa điểm này')).toBeVisible()
    await page.getByRole('button', { name: 'Dùng dữ liệu này' }).click()
    await expect(page.getByLabel(/Tên hiển thị/)).toHaveValue('Highlands Coffee Hai Bà Trưng')
  })

  test('a link GoGo already holds opens that place instead of duplicating it', async ({ page }) => {
    await signIn(page, 'editor@gogo.vn')
    await page.goto('/places/new')

    await page
      .getByLabel('Link Google Maps')
      .fill('https://www.google.com/maps?place_id=ChIJalreadyhere')
    await page.getByRole('button', { name: 'Tìm địa điểm' }).click()

    await expect(page.getByText('GoGo đã có địa điểm này')).toBeVisible()
    await page.getByRole('button', { name: 'Mở địa điểm đã có' }).click()

    await expect(page).not.toHaveURL(/\/places\/new$/)
  })
})
