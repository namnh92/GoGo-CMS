# GoGo-CMS

Back-office của **GoGo** — nơi đội vận hành quản trị catalog địa điểm, kiểm duyệt nội dung người dùng, nhập dữ liệu hàng loạt và theo dõi sức khoẻ hệ thống.

Repo này là **client thuần**: mọi nghiệp vụ và mọi quyết định phân quyền nằm ở GoGo-BE. CMS không có database riêng, không gọi thẳng provider (Google Places/Sheets), không tự suy ra quyền từ UI.

Tài liệu nguồn (workspace docs): `GOGO_SRS.md` §8.8–8.10, `GOGO_IMPLEMENTATION_WBS.md`, `GOGO_PLACE_INGESTION_SPEC.md` §9–10, `GOGO_FEATURE_IMPROVEMENT_SPEC.md`, `GOGO_ENGINEERING_SKILLS_AND_PLANS.md`.

## Hệ sinh thái GoGo

| Repo                                                        | Phạm vi                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| [GoGo-BE](https://github.com/namnh92/GoGo-BE)               | API BFF, database, search, suggestion, workers, **CMS APIs**     |
| **GoGo-CMS** (repo này)                                     | Back-office web cho Editor / Moderator / Ops Admin / Super Admin |
| [GoGo-WebApp](https://github.com/namnh92/GoGo-WebApp)       | Responsive Web/PWA và Mini Web App                               |
| [GoGo-MobileApp](https://github.com/namnh92/GoGo-MobileApp) | React Native iOS/Android                                         |
| [GoGo-Mockup](https://github.com/namnh92/GoGo-Mockup)       | Prototype, UI/UX fixtures và design validation                   |

## Vì sao tách repo riêng

CMS là ứng dụng nội bộ, dùng bởi nhân sự chứ không phải người dùng cuối. Nó khác app consumer ở ba điểm khiến việc nhét chung repo là sai:

- **Đối tượng và rủi ro khác nhau.** CMS chạm dữ liệu thô, audit log và cấu hình ranking. Production bắt buộc SSO/MFA và session timeout ngắn hơn app consumer.
- **Ưu tiên UI ngược nhau.** App consumer tối ưu cảm xúc và chuyển động; CMS tối ưu mật độ dữ liệu, tốc độ thao tác bàn phím và khả năng đọc bảng lớn.
- **Nhịp phát hành khác nhau.** CMS deploy được bất cứ lúc nào sau backend; app consumer đi theo chu kỳ store/release.

## Stack

React 19 + TypeScript strict · Vite 6 · Tailwind v4 (token qua `@theme`) · TanStack Query (server state) · TanStack Table (data grid) · react-hook-form + zod · API client **generate từ OpenAPI của GoGo-BE** · MSW (mock contract dùng chung cho dev/test/E2E) · Vitest + Playwright · pnpm.

Chi tiết và lý do: [`docs/adr/0001-cms-stack.md`](docs/adr/0001-cms-stack.md).

## Cấu trúc thư mục

```text
GoGo-CMS/
├── src/
│   ├── app/                    # Shell, sidebar, page header, routing, providers, gates
│   ├── features/
│   │   ├── auth/               # login.view + TOTP, xử lý MFA_REQUIRED
│   │   ├── ops/                # dashboard.view — KPI, provider health, alert
│   │   ├── places/             # placeList / placeEditor / duplicateQueue + status
│   │   ├── imports/            # importList / importWizard / jobDetail / candidateDrawer
│   │   ├── moderation/         # moderationQueue.view — review, report, check-in, submission
│   │   ├── taxonomy/           # taxonomy.view — key, nhãn i18n, synonym
│   │   ├── collections/        # collections.view — editorial collection + thứ tự
│   │   ├── ranking/            # settings.view — feature flag, trọng số, health
│   │   └── errors/             # 403 / 404
│   ├── shared/
│   │   ├── api/                # client, error envelope, contracts (zod), generated types
│   │   ├── auth/               # session (cookie-first), permission map, token in-memory
│   │   ├── ui/                 # primitives, DataTable, Drawer/Modal, State, Toast
│   │   ├── i18n/               # vi mặc định, en phụ
│   │   ├── format/             # tiền (minor units), ngày giờ, phần trăm
│   │   └── test/               # MSW handlers, fixtures, render helper
│   └── styles/                 # tokens.css (nơi DUY NHẤT có literal màu) + global.css
├── e2e/                        # Playwright: role matrix, luồng import, a11y
├── docs/                       # permissions, ui-conventions, adr/
└── openapi/                    # Contract vendored từ GoGo-BE + type sinh ra
```

Mỗi màn là một cặp `{screen}.view.tsx` + `{screen}.style.tsx`
(`.claude/rules/core.md` §13); `src/app/routes.tsx` chỉ trỏ tới `.view`.

## Nguyên tắc cốt lõi

- **API là lớp phân quyền cuối cùng.** `RoleGate` chỉ ẩn thứ người dùng không dùng được; nó **không thay** authorization. Mọi hành động phải chịu được request tự chế. Nếu UI ẩn nút mà API vẫn cho gọi, đó là bug của BE — báo, đừng vá ở client.
- **Không hard-code taxonomy, role hay ID provider.** Taxonomy đến từ API dưới dạng stable key; label resolve qua i18n.
- **API client là generated code.** Sinh từ `openapi/gogo.v1.yaml` của GoGo-BE, không sửa tay, không chép DTO qua repo. CI fail khi client lệch version OpenAPI đã khai báo.
- **Tiền là integer minor units.** Phân biệt `total` và `per_person`, format ở lớp hiển thị — không tính toán tiền bằng số thực.
- **Mọi màn async render đủ trạng thái**: loading / empty / error / success, cộng permission-denied và offline/degraded. Mọi CTA có pressed / loading / disabled.
- **Hành động phá huỷ cần xác nhận có ngữ cảnh**: merge place, publish hàng loạt, rollback ranking config phải cho xem trước cái gì sẽ đổi, không phải một dialog "Bạn có chắc không?" trống rỗng.
- **Audit là tính năng, không phải log.** Nơi nào BE ghi audit, CMS phải hiện được ai làm, lúc nào, đổi gì — người vận hành cần đọc lại lịch sử mà không cần mở database.
- **Không PII thừa.** Dashboard và bảng chỉ hiện thứ cần cho việc vận hành; không hiện toạ độ gốc chính xác, không hiện email/điện thoại khi không cần.

## Design

Dùng **cùng bộ semantic token** với app consumer (Coral / Lavender / Mint / Amber / Ivory / Ink) để hệ thống nhất quán, nhưng **bề mặt thì khác**: CMS là công cụ dữ liệu dày đặc, nên nền đục, tương phản cao, khoảng cách chặt.

Glass/blur chỉ dùng cho lớp nổi (drawer, modal, popover) đúng tinh thần "glass là vật liệu phân cấp" — **không** dùng cho bảng, form hay nền trang. Bảng dữ liệu cần đọc được, không cần đẹp mờ ảo.

Bắt buộc: WCAG 2.2 AA trên mọi luồng chính, thao tác bàn phím đầy đủ (bảng lớn dùng chuột là chính nhưng phải dùng được bàn phím), touch target ≥ 44×44, màu không bao giờ là tín hiệu duy nhất.

## Bảo mật

- Production **bắt buộc SSO/MFA** và session timeout ngắn hơn app consumer (security rule của workspace). Hiện BE đã có TOTP; SSO còn chờ chốt IdP — theo dõi ở [GoGo-BE#62](https://github.com/namnh92/GoGo-BE/issues/62).
- Session lưu trong secure `HttpOnly` cookie; không để token nhạy cảm trong `localStorage` khi cookie dùng được.
- Không log token, secret, payload đầy đủ hay PII.
- Upload file import: người vận hành **tự đảm bảo file sạch trước khi upload** — quyết định đã ghi nhận ở `docs/threat-model.md` của GoGo-BE. Backend parse trong tiến trình, không execute và không serve lại file.

## API surface đang có sẵn từ GoGo-BE

41 path dưới `/v1/cms/*`, đã live và có trong Swagger (`/v1/docs`). Nhóm theo màn hình:

| Nhóm            | Endpoint chính                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth            | `POST /cms/auth/login` · `POST /cms/auth/totp/setup` · `POST /cms/auth/admins`                                                                                                 |
| Places          | `GET /cms/places` · `GET/PATCH /cms/places/{id}` · `POST /cms/places/{id}/status` · `PUT .../hours` · `PUT .../prices` · `POST .../verify-freshness` · `GET /cms/places/stale` |
| Duplicates      | `GET /cms/places/duplicates` · `POST /cms/places/{id}/merge`                                                                                                                   |
| Bulk import     | `POST /cms/place-imports` (multipart) · `POST .../google-sheet` · `GET /cms/place-imports` · `GET .../{jobId}` · `GET .../{jobId}/rows` · `POST .../start                      | cancel | retry | publish`·`POST .../rows/{rowId}/confirm-candidate | merge | skip`·`GET .../{jobId}/error-report` |
| Submissions     | `POST /cms/place-submissions/{id}/decide`                                                                                                                                      |
| Taxonomy        | `GET/POST /cms/taxonomies` · `PATCH /cms/taxonomies/{id}` · `POST /cms/taxonomies/{id}/synonyms`                                                                               |
| Collections     | `GET/POST /cms/collections` · `PUT /cms/collections/{id}` · `PATCH .../status` · `PATCH .../items`                                                                             |
| Moderation      | `GET /cms/moderation` · `POST /cms/moderation/reviews\|reports\|checkins/{id}`                                                                                                 |
| Ranking & flags | `POST /cms/ranking-configs` · `POST .../{id}/approve\|activate` · `POST .../{key}/rollback` · `PATCH /cms/feature-flags/{key}`                                                 |
| Ops             | `GET /cms/ops/kpis`                                                                                                                                                            |

Chi tiết từng operation: đọc `openapi/gogo.v1.yaml` hoặc Swagger UI tại `/v1/docs` của môi trường tương ứng. **Không viết tay DTO.**

## Ma trận quyền

Quyền do BE quyết; bảng này để dựng `RoleGate` cho khớp, không phải để thay thế.

**Đọc phân cấp, ghi thì không.** Bốn vai là ngang hàng chứ không phải một chuỗi — `ops_admin` **không** bao gồm `editor`. Đó là đúng cho việc *ghi*: ops không có việc gì phải sửa nội dung biên tập. Nhưng với việc *đọc* thì sai — ops publish import (tạo place) rồi lại 403 khi mở danh sách place vừa tạo, còn người trực ca không xem được cả catalog lẫn hàng chờ kiểm duyệt.

Nên: **method an toàn (GET/HEAD/OPTIONS)** pass khi rank của người gọi ≥ rank thấp nhất route yêu cầu — vai ngang hàng đọc được của nhau, vai cao đọc được xuống dưới, **không ai đọc lên trên**. Mọi **ghi** giữ nguyên khớp vai chính xác.

Rank: `editor` = `moderator` = 1 · `ops_admin` = 2 · `super_admin` = 3 (pass mọi nơi).

| Hành động | editor | moderator | ops_admin | super_admin |
| --- | --- | --- | --- | --- |
| **Xem** catalog, hours, price, import, hàng chờ kiểm duyệt | ✅ | ✅ | ✅ | ✅ |
| **Xem** ranking config, feature flag, ops KPI | ❌ | ❌ | ✅ | ✅ |
| Sửa place, hours, price · đổi trạng thái · merge duplicate | ✅ | ❌ | ❌ | ✅ |
| Tạo/chạy/huỷ/retry import job | ✅ | ❌ | ✅ | ✅ |
| **Publish import → catalog** | ❌ | ❌ | ✅ | ✅ |
| Duyệt review/report/check-in | ❌ | ✅ | ❌ | ✅ |
| Quyết định đề xuất từ Mobile | ✅ | ✅ | ❌ | ✅ |
| Sửa taxonomy, collection | ✅ | ❌ | ✅ | ✅ |
| Ranking config: approve ≠ activate | ❌ | ❌ | ✅ (hai người khác nhau) | ✅ |
| Feature flag | ❌ | ❌ | ✅ | ✅ |
| Tạo admin | ❌ | ❌ | ❌ | ✅ |

Admin bị suspend hoặc hạ quyền **mất quyền ngay lập tức** — kể cả quyền đọc. BE đọc lại hàng admin mỗi request, không tin token. CMS phải xử lý được 403 giữa phiên: hiện màn permission-denied, không văng ra trang trắng.

## Local development

Yêu cầu: Node.js ≥ 20.19, pnpm.

```bash
pnpm install
cp .env.example .env.local     # VITE_USE_MOCK=true để chạy không cần backend
pnpm dev                       # http://localhost:5174
```

**Không cần GoGo-BE để dựng UI.** Với `VITE_USE_MOCK=true`, MSW phục vụ toàn bộ
`/v1/cms/*` từ `src/shared/test/handlers.ts` — kể cả các nhánh lỗi thật:
`MFA_REQUIRED`, `SELF_APPROVAL`, `CANDIDATE_NOT_LISTED`,
`paused_provider_quota`. Đăng nhập dev: mật khẩu bất kỳ + mã 6 số bất kỳ; vai
trò suy ra từ phần local của email — `editor@…`, `moderator@…`, `ops@…`, còn
lại là `super_admin`.

Chạy với backend thật: đặt `VITE_USE_MOCK=false` và `VITE_API_ORIGIN` trỏ tới
GoGo-BE (xem `README.md` của GoGo-BE cho Docker stack một lệnh; tài khoản CMS
seed nằm trong seed data của BE).

| Lệnh             | Việc                                                |
| ---------------- | --------------------------------------------------- |
| `pnpm dev`       | Vite dev server, proxy `/v1` sang `VITE_API_ORIGIN` |
| `pnpm typecheck` | `tsc -b --noEmit`                                   |
| `pnpm lint`      | ESLint (chặn literal màu ngoài file token)          |
| `pnpm test`      | Vitest + Testing Library trên MSW                   |
| `pnpm test:e2e`  | Playwright: role matrix, luồng import, a11y         |
| `pnpm build`     | Production bundle                                   |
| `pnpm api:types` | Sinh lại client từ `openapi/gogo.v1.yaml`           |
| `pnpm api:check` | Chặn CI khi contract/type lệch nhau                 |

## Git

Git Flow: `master` (production, tag `vX.Y.Z`) · `develop` (integration) · `feature|bugfix/GOGO-<số issue>-<tên>` · `hotfix/GOGO-<số issue>-<tên>` · `release/x.y.z`.

PR bắt buộc, CI xanh, ≥1 approval. Squash merge cho `feature/*` và `bugfix/*`. Conventional Commits, subject ≤ 50 ký tự.

Các repo **không** dùng chung version; release manifest ghi lại tính tương thích (backend / CMS / api contract version).

## Backlog

Backlog theo `GOGO_IMPLEMENTATION_WBS.md`, quản lý bằng GitHub issues (label `wbs`), tiêu đề đặt theo task ID:

- **CMS core:** `CMS-001..010` — shell + auth/RBAC → place → source/hours/price/freshness → duplicate merge → taxonomy → collection → moderation → ranking console → import → ops dashboard.
- **Place ingestion UI:** `PI-CMS-001..007` — import history + wizard → column mapping + dry-run → job progress + row error → candidate drawer → duplicate merge/skip → bulk approve/publish → hàng chờ đề xuất Mobile.

Backend cho toàn bộ nhóm này **đã xong và đang chạy** (GoGo-BE `develop`), nên CMS không bị chặn bởi API — trừ SSO (chờ IdP) và dashboard metric (chờ chốt nơi nhận metric).

## Màn hình đã dựng

| Route             | Màn                                                                                    | WBS                             |
| ----------------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| `/login`          | Đăng nhập + TOTP, xử lý `MFA_REQUIRED` / `MFA_SETUP_REQUIRED`                          | CMS-001                         |
| `/`               | Dashboard vận hành: KPI, xu hướng, provider health, activity, alert                    | CMS-010                         |
| `/places`         | Danh sách catalog: tab trạng thái + `Cần xác minh lại` + `Trùng lặp`, lọc, bulk action | CMS-002, CMS-003, CMS-004       |
| `/places/:id`     | Editor: định danh, phân loại, geo, giờ, giá, nguồn, freshness, audit diff              | CMS-002, CMS-003                |
| `/imports`        | Lịch sử phiên nhập, tiến trình, start/cancel/retry, báo cáo lỗi                        | PI-CMS-001, PI-CMS-003, CMS-009 |
| `/imports/new`    | Wizard: nguồn → ánh xạ cột (preview CSV) → chế độ ghi                                  | PI-CMS-001, PI-CMS-002          |
| `/imports/:jobId` | Chi tiết phiên: tổng quan, lọc dòng, xác nhận/gộp/bỏ qua, publish                      | PI-CMS-003..006                 |
| `/moderation`     | Hàng chờ: đánh giá, báo cáo, địa điểm người dùng gửi, check-in                         | CMS-007, PI-CMS-007             |
| `/taxonomy`       | Khoá phân loại theo nhóm, nhãn vi/en, synonym, bật/tắt                                 | CMS-005                         |
| `/collections`    | Bộ sưu tập biên tập: form, trạng thái, thứ tự địa điểm                                 | CMS-006                         |
| `/settings`       | Cờ tính năng, trọng số ranking (bốn mắt + rollback), sức khoẻ nền tảng                 | CMS-008                         |

## Trạng thái

**CMS-001 đã có shell chạy được** cùng lớp UI cho CMS-002..010 và
PI-CMS-001..007 trên mock contract. Việc còn lại trước khi ghép backend thật:

- SSO/IdP chờ chốt ([GoGo-BE#62](https://github.com/namnh92/GoGo-BE/issues/62)); hiện chỉ có mật khẩu + TOTP.
- **Năm read-endpoint UI cần nhưng contract chưa có** (spec chỉ khai báo phía ghi). UI đã dựng và mock theo shape đề xuất; cần GoGo-BE bổ sung rồi chạy lại `pnpm api:types`:

  | Endpoint                     | Dùng ở màn                                                                    |
  | ---------------------------- | ----------------------------------------------------------------------------- |
  | `GET /cms/places/{id}`       | Place Editor                                                                  |
  | `GET /cms/places/{id}/audit` | Drawer nhật ký thay đổi                                                       |
  | `GET /cms/taxonomies`        | Taxonomy (cần `usageCount` + khoá đang tắt, khác `GET /taxonomies` công khai) |
  | `GET /cms/ranking-configs`   | Console ranking (danh sách phiên bản + biên trọng số)                         |
  | `GET /cms/feature-flags`     | Tab cờ tính năng                                                              |

- Response của phần lớn endpoint CMS chưa có `schema` trong OpenAPI nên đang validate bằng zod ở boundary — xem [`docs/adr/0002-boundary-validation.md`](docs/adr/0002-boundary-validation.md).
- Upload ảnh trong Place Editor và autocomplete địa điểm cho Collections còn là placeholder, chờ endpoint tương ứng.
