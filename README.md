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
│   │   ├── places/             # placeList / placeEditor / duplicateQueue / areaCombobox + status
│   │   ├── imports/            # importList / importWizard / jobDetail / candidateDrawer
│   │   ├── moderation/         # moderationQueue.view — review, report, check-in, submission
│   │   ├── taxonomy/           # taxonomy.view — key, nhãn i18n, synonym
│   │   ├── collections/        # collections.view — editorial collection + thứ tự
│   │   ├── ranking/            # settings.view — feature flag, trọng số, health
│   │   └── errors/             # 403 / 404
│   ├── shared/
│   │   ├── api/                # client, error envelope, contracts (zod), generated types
│   │   ├── auth/               # session (cookie-first), permission map, token in-memory
│   │   ├── ui/                 # primitives, DataTable, Combobox, Drawer/Modal, State, Toast
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

| Nhóm            | Endpoint chính                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | `POST /cms/auth/login` · `POST /cms/auth/refresh` · `POST /cms/auth/totp/setup\|confirm` · `POST /cms/auth/admins`                                                                     |
| Places          | `GET /cms/places` · `GET/PATCH /cms/places/{id}` · `PATCH .../status` · `PUT .../hours` · `POST .../prices` · `POST .../verify-freshness` · `GET /cms/places/stale` · `GET /cms/areas` |
| Duplicates      | `GET /cms/places/duplicates` · `POST /cms/places/{id}/merge`                                                                                                                           |
| Bulk import     | `POST /cms/place-imports` (multipart) · `POST .../google-sheet` · `GET /cms/place-imports` · `GET .../{jobId}` · `GET .../{jobId}/rows` · `POST .../start                              | cancel | retry | publish`·`POST .../rows/{rowId}/confirm-candidate | merge | skip`·`GET .../{jobId}/error-report` |
| Submissions     | `GET /cms/place-submissions` · `POST /cms/place-submissions/{id}/decide`                                                                                                               |
| Taxonomy        | `GET/POST /cms/taxonomies` · `PATCH /cms/taxonomies/{id}` · `POST /cms/taxonomies/{id}/synonyms`                                                                                       |
| Collections     | `GET/POST /cms/collections` · `PATCH .../status` · `GET/PUT .../{id}/items`                                                                                                            |
| Moderation      | `GET /cms/moderation` · `POST /cms/moderation/reviews\|reports\|checkins/{id}`                                                                                                         |
| Ranking & flags | `GET/POST /cms/ranking-configs` · `GET .../{id}/evaluate` · `POST .../{id}/approve\|activate` · `POST .../{key}/rollback` · `GET /cms/feature-flags` · `PUT .../{key}`                 |
| Thử nghiệm A/B  | `GET /cms/experiments` · `PUT /cms/experiments/{key}`                                                                                                                                  |
| Audit           | `GET /cms/audit` · `GET /cms/places/{id}/audit`                                                                                                                                        |
| Ops             | `GET /cms/ops/kpis` · `GET /cms/search-analytics`                                                                                                                                      |

Chi tiết từng operation: đọc `openapi/gogo.v1.yaml` hoặc Swagger UI tại `/v1/docs` của môi trường tương ứng. **Không viết tay DTO.**

## Ma trận quyền

Quyền do GoGo-BE quyết. Quy tắc từ `AdminGuard` (GoGo-BE#144): **đọc phân cấp,
ghi khớp chính xác** — method an toàn pass khi rank người gọi ≥ rank thấp nhất
route yêu cầu (`editor` = `moderator` = 1, `ops_admin` = 2, `super_admin` = 3),
mọi ghi vẫn cần đúng vai.

Bảng đầy đủ, kèm ánh xạ controller → `@RequireRole`, ở
[`docs/permissions.md`](docs/permissions.md).

| Hành động                                                 | editor | moderator | ops_admin | super_admin |
| --------------------------------------------------------- | :----: | :-------: | :-------: | :---------: |
| **Xem** catalog, import, hàng chờ kiểm duyệt, collections |   ✅   |    ✅     |    ✅     |     ✅      |
| **Xem** ops KPI, chất lượng tìm kiếm                      |   ❌   |    ❌     |    ✅     |     ✅      |
| **Xem** nhật ký kiểm toán                                 |   ✅   |    ✅     |    ✅     |     ✅      |
| **Xem** IP nhân viên trong nhật ký                        |   ❌   |    ❌     |    ✅     |     ✅      |
| Sửa place, giờ, giá · đổi trạng thái · merge              |   ✅   |    ❌     |    ❌     |     ✅      |
| Sửa taxonomy, collection                                  |   ✅   |    ❌     |    ✅     |     ✅      |
| Duyệt review/report/check-in                              |   ❌   |    ✅     |    ❌     |     ✅      |
| Quyết định đề xuất từ Mobile                              |   ✅   |    ✅     |    ❌     |     ✅      |
| Tạo/chạy/huỷ/retry import job                             |   ✅   |    ❌     |    ✅     |     ✅      |
| **Publish import → catalog**                              |   ❌   |    ❌     |    ✅     |     ✅      |
| Ranking config, feature flag, thử nghiệm A/B              |   ❌   |    ❌     |    ✅     |     ✅      |
| Gỡ khẩn cấp                                               |   ✅   |    ✅     |    ✅     |     ✅      |
| Tạo admin                                                 |   ❌   |    ❌     |    ❌     |     ✅      |

Admin bị suspend hoặc hạ quyền **mất quyền ngay lập tức**, kể cả quyền đọc — BE
đọc lại hàng admin mỗi request, không tin token. CMS xử lý 403 giữa phiên bằng
màn permission-denied, không văng ra trang trắng.

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
**DEV remote** — `https://api-dev.gogo.id.vn`. Không cần clone GoGo-BE, không
cần PostgreSQL/Redis trên máy: DEV là môi trường được deploy, không phải thứ
mỗi người tự dựng (GoGo-Infra INF-038/INF-042). Tài khoản CMS ở đó là dữ liệu
seed của môi trường DEV, dùng chung.

Dựng GoGo-BE tại chỗ vẫn được, nhưng là **chế độ gỡ lỗi tuỳ chọn** — khi cần
sửa BE cùng lúc, hoặc cần một database bỏ đi được. Hệ quả phải biết trước: đó
là một database khác, seed khác, migration có thể khác — UI chạy đúng ở đó
không nói được gì về DEV. Cách dựng nằm trong `README.md` của GoGo-BE.

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

## Deploy (môi trường dev)

CMS được serve bởi một Cloudflare Worker, và Worker đó **proxy `/v1` sang
GoGo-BE trên cùng origin**. Đây không phải chi tiết triển khai tuỳ hứng: phiên
đăng nhập là cookie `HttpOnly; SameSite=Lax`, gọi thẳng sang hostname của BFF sẽ
biến mọi request thành cross-site và buộc cookie phải `SameSite=None` — đúng thứ
CSRF protection sinh ra để tránh. Lý do đầy đủ:
[`docs/adr/0003-cms-hosting.md`](docs/adr/0003-cms-hosting.md).

Trong repo: `wrangler.jsonc`, `worker/index.ts`, `public/_headers`.
Chạy thử Worker tại chỗ (cần `pnpm build` trước):

```bash
pnpm build
pnpm cf:dev --var BE_ORIGIN:https://api-dev.gogo.id.vn
```

Worker chạy tại chỗ, backend thì không — đó là thứ đang được kiểm: proxy `/v1`
cùng origin và cookie phiên. Trỏ `BE_ORIGIN` vào `http://localhost:3000` chỉ
đúng khi đang chủ ý gỡ lỗi GoGo-BE tại chỗ.

**Ba thứ phải set ngoài repo** — thiếu thứ nào thì bản deploy chạy nhưng sai:

| Ở đâu                 | Việc                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare project    | Build command `pnpm build`, deploy command `npx wrangler versions upload`                                                                                                               |
| Cloudflare project    | Biến `BE_ORIGIN` = origin GoGo-BE của môi trường đó — dev đã set `https://api-dev.gogo.id.vn` (31/08/2026). Chưa set thì `/v1/*` trả `503 BACKEND_NOT_CONFIGURED` chứ không im lặng 404 |
| Cloudflare Zero Trust | **Access** trước hostname. Bản deploy không tự xác thực; để trang đăng nhập admin công khai là mở sẵn bề mặt credential stuffing                                                        |

Và ở GoGo-BE của môi trường đó: `COOKIE_SECURE=true`, `TRUST_PROXY` tin đúng hop
Cloudflare. Không thì BE bỏ qua `x-forwarded-for` và **cột IP nhân viên trong
nhật ký kiểm toán ghi sai người** — hỏng đúng thứ SEC-002 dựng ra để điều tra.

Đưa toàn bộ về Terraform: [GoGo-Infra#25](https://github.com/namnh92/GoGo-Infra/issues/25).

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

| Route             | Màn                                                                                                                                               | WBS                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `/login`          | Đăng nhập + TOTP, xử lý `MFA_REQUIRED` / `MFA_SETUP_REQUIRED`                                                                                     | CMS-001                         |
| `/`               | Dashboard vận hành: KPI, xu hướng, provider health, activity, alert                                                                               | CMS-010                         |
| `/places`         | Danh sách catalog: tab trạng thái + `Cần xác minh lại` + `Trùng lặp`, lọc, bulk action                                                            | CMS-002, CMS-003, CMS-004       |
| `/places/:id`     | Editor: định danh, khu vực khám phá, địa chỉ hành chính + liên hệ, phân loại, geo, giờ, giá, nguồn, provenance từng trường, freshness, audit diff | CMS-002, CMS-003, CMS-044       |
| `/imports`        | Lịch sử phiên nhập, tiến trình, start/cancel/retry, báo cáo lỗi                                                                                   | PI-CMS-001, PI-CMS-003, CMS-009 |
| `/imports/new`    | Wizard: nguồn → ánh xạ cột (preview CSV) → chế độ ghi                                                                                             | PI-CMS-001, PI-CMS-002          |
| `/imports/:jobId` | Chi tiết phiên: tổng quan, lọc dòng, xác nhận/gộp/bỏ qua, publish                                                                                 | PI-CMS-003..006                 |
| `/moderation`     | Hàng chờ: đánh giá, báo cáo, địa điểm người dùng gửi, check-in                                                                                    | CMS-007, PI-CMS-007             |
| `/taxonomy`       | Khoá phân loại theo nhóm, nhãn vi/en, synonym, bật/tắt                                                                                            | CMS-005                         |
| `/collections`    | Bộ sưu tập biên tập: form, trạng thái, đọc/ghi thứ tự địa điểm                                                                                    | CMS-006, CMS-012                |
| `/audit`          | Nhật ký kiểm toán: lọc, rà soát gỡ khẩn cấp, diff before/after                                                                                    | CMS-014                         |
| `/search-quality` | Chất lượng tìm kiếm: tỷ lệ zero-result kèm mẫu số, truy vấn hỏng                                                                                  | CMS-015                         |
| `/settings`       | Cờ tính năng, trọng số ranking (bốn mắt + rollback), thử nghiệm A/B, đánh giá offline                                                             | CMS-008, CMS-013                |
| `/costs/manual`   | Chi phí thủ công: phí cố định nhập tay → dòng MANUAL trong Cost Center, có audit                                                                  | COST-CMS-010                    |

## Trạng thái

**CMS-001 đã có shell chạy được** cùng lớp UI cho CMS-002..015 và
PI-CMS-001..007. Toàn bộ đã được đối chiếu với GoGo-BE `develop` — RBAC, tham số
truy vấn và shape response đều đọc từ controller và từ
`openapi/gogo.v1.yaml` vendored, không đoán.

### Nối với các endpoint GoGo-BE#175 (CMS-012..015)

Sáu thứ CMS cần đọc trước đây chỉ có đường ghi; UI chạy trên shape tự chế và
MSW. GoGo-BE#175 đã mở hết, và **shape thật khác shape đã đoán ở nhiều chỗ** —
nên đây là việc đọc lại contract, không phải đổi URL:

| Endpoint                                          | Điều làm UI phải sửa theo                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /cms/places/{id}` → `CmsPlaceDetail`         | Hai rating tách riêng, **không** có điểm tổng hợp; hours/prices mang nguồn + lần xác minh; sources mang attribution; media là storage key + trạng thái kiểm duyệt; `provenance` là map theo tên trường — **trường vắng mặt là chưa ghi nhận nguồn**, không được mặc định thành GoGo                                                                           |
| `PATCH /cms/places/{id}`                          | `null` xoá một trường, thiếu khoá là giữ nguyên — chỉ gửi khoá thật sự đổi để không nhận vơ provenance; `expectedUpdatedAt` là optimistic concurrency, lệch thì `409 PLACE_MODIFIED` kèm `updatedAt` hiện tại trong `field_errors[0].message`; `phone`/`website` do máy chủ chuẩn hoá (E.164, http/https) — client gửi nguyên văn rồi hiển thị `field_errors` |
| `GET /cms/areas` → `CmsArea[]`                    | Từ vựng của `areaKey` (`service_areas`), **không phải taxonomy**; `known: false` là khoá địa điểm đang giữ mà danh mục không có (cột chưa bao giờ là khoá ngoại); `includeInactive=true` để hiện lại khu vực đã ngừng                                                                                                                                         |
| `GET /cms/audit`, `GET /cms/places/{id}/audit`    | `actorRole`, `breakGlass`, `authorizationPath`, `requestId`, cursor                                                                                                                                                                                                                                                                                           |
| `GET /cms/taxonomies` → `CmsTaxonomy[]`           | Trả cả khoá đang tắt, kèm `usageCount`                                                                                                                                                                                                                                                                                                                        |
| `GET /cms/ranking-configs` → `CmsRankingConfig[]` | `bounds` đi kèm từng version; `createdBy`/`approvedBy` là object                                                                                                                                                                                                                                                                                              |
| `GET /cms/feature-flags` → `CmsFeatureFlag[]`     | Có `payload` và người sửa cuối; không có rollout %                                                                                                                                                                                                                                                                                                            |
| `GET /cms/collections/{id}/items`                 | Đọc được danh sách trước khi `PUT` ghi đè toàn bộ                                                                                                                                                                                                                                                                                                             |

Không còn schema `⚠ Aspirational` nào trong `src/`.

Ba màn mới mở khoá theo:

- **Nhật ký kiểm toán** (`/audit`) — lọc theo tài nguyên/hành động/actor/thời
  gian, và nút **Chỉ gỡ khẩn cấp** cho việc rà soát sự cố. Chỉ đọc: FR-CMS-008
  quy định log bất biến, BE không phục vụ route ghi nào. IP nhân viên chỉ trả
  cho `ops_admin` trở lên — với vai khác trường **không tồn tại**, nên UI không
  hiện ô trống.
- **Thử nghiệm A/B + đánh giá offline** (`/settings`) — chia tỷ lệ theo phiên
  bản ranking config đã duyệt (bản nháp hiện nhưng không chọn được), và
  `GET .../{id}/evaluate` chạy lại phiên bản ứng viên trên snapshot đã lưu. Kết
  quả luôn kèm số lượt bị bỏ và lý do; bỏ mà không nói sẽ đọc thành đồng thuận.
- **Chất lượng tìm kiếm** (`/search-quality`) — tỷ lệ zero-result kèm mẫu số.
  Dựng từ tổng hợp theo ngày nên **không có** chi tiết từng request; truy vấn
  dưới ngưỡng 5 lượt được đếm trong `hiddenBelowFloor` nhưng không nêu tên.

### Lệch còn lại đã xử lý ở phía UI

- `GET /cms/ops/kpis` chỉ có sáu số tổng hợp trên cửa sổ cố định. Dashboard bỏ
  biểu đồ chuỗi thời gian, provider health và activity feed — những thứ không
  đo được; ô zero-result trỏ sang `/search-quality`, nơi có mẫu số.
- Chưa có endpoint sức khoẻ theo từng nhà cung cấp; tab "Sức khoẻ nền tảng"
  hiện đúng một chỉ số contract có (`providerErrorsLast7d`).
- Các endpoint còn lại (`/cms/moderation`, `/cms/ops/kpis`, `/cms/collections`,
  `/cms/places/stale`, `/cms/places/duplicates`) vẫn chưa khai báo `schema` cho
  response nên client generate ra `unknown` → tiếp tục validate bằng zod ở
  boundary. Điều kiện gỡ ở
  [`docs/adr/0002-boundary-validation.md`](docs/adr/0002-boundary-validation.md).

### Gỡ khẩn cấp (break-glass, SEC-001)

Ba route `/cms/emergency/*` (GoGo-BE#149) đã có UI (#19). Thiết kế cố ý bất đối
xứng: **gỡ xuống** mở cho mọi vai admin đang active vì đảo ngược được và giảm
thiệt hại; **đưa lên lại** vẫn giữ vai đặc quyền và đi qua màn thường.

Điểm vào: hàng trong catalog và Place Editor (chỉ bật khi `published`), và chi
tiết một báo cáo trong bảng kiểm duyệt — dùng `targetType`/`targetId` của
report. Hàng chờ kiểm duyệt không dùng được cho việc này vì nó chỉ liệt kê
review `pending`, còn route nhắm vào review `published`.

Dialog nêu rõ chuyển trạng thái, bắt lý do ≥ 10 ký tự (đúng ngưỡng máy chủ) và
nói thẳng rằng thao tác được ghi audit kèm vai/IP/request id và bắn cảnh báo.
`409 NOT_TAKEDOWNABLE` và `429` (20/giờ, burst 5/phút) đều có thông điệp riêng.

### Chưa dựng UI

- SSO chờ IdP ([GoGo-BE#62](https://github.com/namnh92/GoGo-BE/issues/62)); hiện chỉ mật khẩu + TOTP.
- **Thêm/sửa ảnh địa điểm.** `CmsPlaceDetail` đọc được media (storage key +
  trạng thái kiểm duyệt) nhưng không có route CMS nào tải lên hay gắn ảnh vào
  place: `POST /uploads` là endpoint của người dùng cuối và `PATCH /cms/places/{id}`
  không nhận media. Place Editor vì thế **liệt kê** media chứ không mời một nút
  chỉ có thể thất bại. → [GoGo-BE#191](https://github.com/namnh92/GoGo-BE/issues/191)
