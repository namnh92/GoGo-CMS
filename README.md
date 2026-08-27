# GoGo-CMS

Back-office của **GoGo** — nơi đội vận hành quản trị catalog địa điểm, kiểm duyệt nội dung người dùng, nhập dữ liệu hàng loạt và theo dõi sức khoẻ hệ thống.

Repo này là **client thuần**: mọi nghiệp vụ và mọi quyết định phân quyền nằm ở GoGo-BE. CMS không có database riêng, không gọi thẳng provider (Google Places/Sheets), không tự suy ra quyền từ UI.

Tài liệu nguồn (workspace docs): `GOGO_SRS.md` §8.8–8.10, `GOGO_IMPLEMENTATION_WBS.md`, `GOGO_PLACE_INGESTION_SPEC.md` §9–10, `GOGO_FEATURE_IMPROVEMENT_SPEC.md`, `GOGO_ENGINEERING_SKILLS_AND_PLANS.md`.

## Hệ sinh thái GoGo

| Repo | Phạm vi |
| --- | --- |
| [GoGo-BE](https://github.com/namnh92/GoGo-BE) | API BFF, database, search, suggestion, workers, **CMS APIs** |
| **GoGo-CMS** (repo này) | Back-office web cho Editor / Moderator / Ops Admin / Super Admin |
| [GoGo-WebApp](https://github.com/namnh92/GoGo-WebApp) | Responsive Web/PWA và Mini Web App |
| [GoGo-MobileApp](https://github.com/namnh92/GoGo-MobileApp) | React Native iOS/Android |
| [GoGo-Mockup](https://github.com/namnh92/GoGo-Mockup) | Prototype, UI/UX fixtures và design validation |

## Vì sao tách repo riêng

CMS là ứng dụng nội bộ, dùng bởi nhân sự chứ không phải người dùng cuối. Nó khác app consumer ở ba điểm khiến việc nhét chung repo là sai:

- **Đối tượng và rủi ro khác nhau.** CMS chạm dữ liệu thô, audit log và cấu hình ranking. Production bắt buộc SSO/MFA và session timeout ngắn hơn app consumer.
- **Ưu tiên UI ngược nhau.** App consumer tối ưu cảm xúc và chuyển động; CMS tối ưu mật độ dữ liệu, tốc độ thao tác bàn phím và khả năng đọc bảng lớn.
- **Nhịp phát hành khác nhau.** CMS deploy được bất cứ lúc nào sau backend; app consumer đi theo chu kỳ store/release.

## Stack định hướng

React + TypeScript strict · Vite · TanStack Query (server state) · TanStack Table (data grid) · react-hook-form + zod · API client **generate từ OpenAPI của GoGo-BE** · Vitest + Playwright + axe · pnpm.

> Stack chốt tại Sprint 0 của CMS (CMS-001). README này mô tả định hướng, không phải bằng chứng code đã tồn tại.

## Cấu trúc thư mục

```text
GoGo-CMS/
├── src/
│   ├── app/                    # Shell, routing, providers, error boundaries
│   ├── features/
│   │   ├── auth/               # Login, TOTP, SSO, session, role gate
│   │   ├── places/             # List, detail, edit, status workflow, freshness
│   │   ├── duplicates/         # Merge candidate, merge/skip
│   │   ├── imports/            # Bulk import wizard, job progress, row errors
│   │   ├── submissions/        # Hàng chờ đề xuất từ Mobile
│   │   ├── taxonomy/           # Taxonomy, synonym, localization
│   │   ├── collections/        # Editorial collection, banner
│   │   ├── moderation/         # Review / report / check-in queue
│   │   ├── ranking/            # Ranking config, feature flag, A-B
│   │   └── ops/                # Dashboard KPI
│   └── shared/
│       ├── api/                # Generated client + query hooks + error mapping
│       ├── auth/               # Session store, RoleGate, permission map
│       ├── ui/                 # Tokens, primitives, DataTable, Form, Drawer
│       ├── i18n/               # vi mặc định, en phụ
│       └── test/               # MSW handlers, fixtures
├── e2e/                        # Playwright: role matrix + luồng import
└── openapi/                    # Contract vendored từ GoGo-BE + type sinh ra
```

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

| Nhóm | Endpoint chính |
| --- | --- |
| Auth | `POST /cms/auth/login` · `POST /cms/auth/totp/setup` · `POST /cms/auth/admins` |
| Places | `GET /cms/places` · `GET/PATCH /cms/places/{id}` · `POST /cms/places/{id}/status` · `PUT .../hours` · `PUT .../prices` · `POST .../verify-freshness` · `GET /cms/places/stale` |
| Duplicates | `GET /cms/places/duplicates` · `POST /cms/places/{id}/merge` |
| Bulk import | `POST /cms/place-imports` (multipart) · `POST .../google-sheet` · `GET /cms/place-imports` · `GET .../{jobId}` · `GET .../{jobId}/rows` · `POST .../start|cancel|retry|publish` · `POST .../rows/{rowId}/confirm-candidate|merge|skip` · `GET .../{jobId}/error-report` |
| Submissions | `POST /cms/place-submissions/{id}/decide` |
| Taxonomy | `GET/POST /cms/taxonomies` · `PATCH /cms/taxonomies/{id}` · `POST /cms/taxonomies/{id}/synonyms` |
| Collections | `GET/POST /cms/collections` · `PUT /cms/collections/{id}` · `PATCH .../status` · `PATCH .../items` |
| Moderation | `GET /cms/moderation` · `POST /cms/moderation/reviews\|reports\|checkins/{id}` |
| Ranking & flags | `POST /cms/ranking-configs` · `POST .../{id}/approve\|activate` · `POST .../{key}/rollback` · `PATCH /cms/feature-flags/{key}` |
| Ops | `GET /cms/ops/kpis` |

Chi tiết từng operation: đọc `openapi/gogo.v1.yaml` hoặc Swagger UI tại `/v1/docs` của môi trường tương ứng. **Không viết tay DTO.**

## Ma trận quyền

Quyền do BE quyết; bảng này để dựng `RoleGate` cho khớp, không phải để thay thế.

| Hành động | editor | moderator | ops_admin | super_admin |
| --- | --- | --- | --- | --- |
| Xem/sửa place, hours, price | ✅ | — | ✅ | ✅ |
| Đổi trạng thái place, merge duplicate | ✅ | — | ✅ | ✅ |
| Tạo/chạy/huỷ/retry import job | ✅ | — | ✅ | ✅ |
| **Publish import → catalog** | ❌ | — | ✅ | ✅ |
| Duyệt review/report/check-in | — | ✅ | ✅ | ✅ |
| Quyết định đề xuất từ Mobile | ✅ | ✅ | ✅ | ✅ |
| Taxonomy, collection, feature flag | — | — | ✅ | ✅ |
| Ranking config: approve ≠ activate | — | — | ✅ (hai người khác nhau) | ✅ |
| Tạo admin | — | — | — | ✅ |

Admin bị suspend hoặc hạ quyền **mất quyền ngay lập tức** — BE đọc lại hàng admin mỗi request, không tin token. CMS phải xử lý được 403 giữa phiên: hiện màn permission-denied, không văng ra trang trắng.

## Local development (dự kiến — chốt tại Sprint 0)

Yêu cầu: Node.js LTS, pnpm, và một GoGo-BE đang chạy.

```bash
pnpm install
cp .env.example .env.local     # VITE_API_BASE_URL trỏ tới BFF
pnpm api:types                 # sinh client từ openapi/gogo.v1.yaml
pnpm dev
```

Lệnh chuẩn mục tiêu: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm build` · `pnpm api:check`.

Chạy BE local: xem `README.md` của GoGo-BE (Docker stack một lệnh). Tài khoản CMS seed dùng cho dev nằm trong seed data của BE.

## Git

Git Flow: `master` (production, tag `vX.Y.Z`) · `develop` (integration) · `feature|bugfix/GOGO-<số issue>-<tên>` · `hotfix/GOGO-<số issue>-<tên>` · `release/x.y.z`.

PR bắt buộc, CI xanh, ≥1 approval. Squash merge cho `feature/*` và `bugfix/*`. Conventional Commits, subject ≤ 50 ký tự.

Các repo **không** dùng chung version; release manifest ghi lại tính tương thích (backend / CMS / api contract version).

## Backlog

Backlog theo `GOGO_IMPLEMENTATION_WBS.md`, quản lý bằng GitHub issues (label `wbs`), tiêu đề đặt theo task ID:

- **CMS core:** `CMS-001..010` — shell + auth/RBAC → place → source/hours/price/freshness → duplicate merge → taxonomy → collection → moderation → ranking console → import → ops dashboard.
- **Place ingestion UI:** `PI-CMS-001..007` — import history + wizard → column mapping + dry-run → job progress + row error → candidate drawer → duplicate merge/skip → bulk approve/publish → hàng chờ đề xuất Mobile.

Backend cho toàn bộ nhóm này **đã xong và đang chạy** (GoGo-BE `develop`), nên CMS không bị chặn bởi API — trừ SSO (chờ IdP) và dashboard metric (chờ chốt nơi nhận metric).

## Trạng thái

**Sprint 0 — chưa có code.** Repo mới khởi tạo: README + backlog. Bước kế tiếp là CMS-001 (shell, auth, RBAC, app skeleton), sau đó chạy song song hai nhánh: quản trị catalog (CMS-002..005) và bulk import (PI-CMS-001..006).
