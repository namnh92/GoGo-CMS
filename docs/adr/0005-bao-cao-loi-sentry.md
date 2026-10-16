# ADR-0005: Báo cáo lỗi trình duyệt qua Sentry

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-14
- **Phạm vi:** GoGo-CMS (bundle Vite). Worker Cloudflare (`worker/`) không thuộc ADR này.
- **Áp dụng:** GoGo-Infra ADR-0011 "Client error reporting on Sentry" (D-1…D-11) — ADR này
  không lặp lại chính sách, chỉ ghi cách CMS thực hiện nó. Issue: GoGo-CMS#238.

## Quyết định

- **Thư viện:** `@sentry/react` ghim đúng `10.75.3` (cùng major với `@sentry/node` của GoGo-BE).
- **Một cửa:** chỉ `src/shared/observability/sentry.ts` import SDK (`sentry-usage.test.ts` khoá).
  Init là lệnh đầu tiên của `bootstrap()` trong `src/main.tsx`; `createRoot` nhận
  `onUncaughtError` + `onCaughtError` (`Sentry.reactErrorHandler`). `AppErrorBoundary` gọi thêm
  `captureError(…, { kind: 'boundary' })`; bản trùng do integration `Dedupe` bỏ.
- **Chỉ lỗi:** không tracing, không Replay, không session release-health (bỏ integration
  `BrowserSession`), không client report (`sendClientReports: false`), không breadcrumb console
  (`breadcrumbsIntegration({ console: false })`), `sendDefaultPii: false`.
- **Cấu hình build:** `VITE_SENTRY_DSN` — rỗng hoặc đúng chữ `off` thì không init, mọi helper là
  no-op; giá trị khác phải là DSN (`http` + port chỉ để chạy relay cục bộ; deploy chỉ nhận `https`
  — GoGo-Infra `check-sentry-dsn.sh`), `OFF`/`false` làm build ném lỗi. `environment` lấy từ
  `VITE_APP_ENV` (`production → prod`), không bao giờ từ `import.meta.env.DEV`. `release` =
  `VITE_RELEASE_SHA` (SHA đầy đủ do `deploy-cms-dev` truyền), thiếu thì `local`.
- **Redaction:** `beforeSend` dựng lại `request` từ allowlist (header: `accept accept-language
content-length content-type user-agent x-request-id`, giá trị giữ nguyên), `user` chỉ còn `{ id }`,
  breadcrumb chỉ giữ `fetch/xhr/http` (`url` đã redact, `method`, `status_code`), `navigation`,
  `ui.click` (selector); mọi chuỗi khác qua `redactText` theo thứ tự ưu tiên §4 của ADR-0011, trừ các
  đường opaque (stack frame, `contexts.browser/os/device/app`, `sdk`, `release`, `event_id`…).
- **Không gửi:** `ApiError` (theo `error.name`, không phụ thuộc minify) và `DOMException`
  `AbortError`/`TimeoutError`. Không lọc theo nội dung message.
- **Hợp đồng:** `apiFetchParsed` báo `ContractMismatchError(path, issuePaths)` (`kind: 'contract'`)
  trước khi đổi lỗi zod thành `ApiError{CONTRACT_MISMATCH}`; chỉ template đường dẫn và đường dẫn
  issue, không giá trị, không message của zod.
- **Tag màn hình (GoGo-CMS#241, bổ sung D-7 lần 3 trên GoGo-Infra#208):** `main.tsx` gọi
  `setSentryRoute(routeTemplateOf(router.state.matches))` lúc khởi động và ở mỗi lần điều hướng
  (`router.subscribe`); `beforeSend` gắn `tags.route` sau bước redact. Giá trị ghép từ `path` của
  định nghĩa route React Router (`/places/:id`), không bao giờ từ location; bị từ chối (không gắn
  tag) nếu một segment không phải chữ thường-gạch nối, mã trạng thái 3 chữ số, `:param` hay `*`, hoặc
  nếu `redactText` làm đổi giá trị. Action Discord 6164951 thêm `route` vào `data.tags`.
- **Oracle:** `src/shared/observability/__fixtures__/redaction-cases.v1.json` chép nguyên văn từ
  GoGo-Infra `docs/adr/0011/redaction-cases.v1.json`, **v1, sha256
  `decf6c4336269b086b209a4d27a9c36ca2c392b307c9d76e4b24883a4f4ef6a0`**; `sentry.test.ts` kiểm digest
  và chạy mọi case (`platforms` có `cms` hoặc không ghi), `sentry-perf.test.ts` chạy các dòng C-16.
  File nằm trong `.prettierignore` để formatter không đổi digest.

## Khác với shape / cần biết

- **Không có user id:** `AdminSession` (OpenAPI) không có id của admin, nên `setSentryUser(null)` ở
  đăng nhập và đăng xuất; báo cáo lỗi CMS ẩn danh. Không dùng email hay displayName thay thế (D-8).
- **Template khớp từ OpenAPI:** `apiFetchParsed` chỉ nhận đường dẫn cụ thể. `toPathTemplate` so nó với
  `PATH_TEMPLATES` (mọi path của `openapi/gogo.v1.yaml`; test khoá hai bên khớp nhau) theo từng
  segment, ưu tiên template nhiều literal, và trả template với tên tham số thật
  (`/cms/feature-flags/search` → `/cms/feature-flags/{key}`). Không khớp template nào thì segment
  không phải segment tĩnh của OpenAPI thành `{id}` (phán quyết SA của Fable cho F-07, PR #239).
- **WKT không đóng ngoặc** bị redact tới hết chuỗi (không chỉ hết dòng như GoGo-BE), để WKT nhiều dòng
  không lộ toạ độ ở dòng sau.
- **Tên file test:** Vitest của repo chỉ chạy `*.test.ts`, nên các spec của shape mang tên
  `sentry.test.ts`, `sentry-perf.test.ts`, `sentry-usage.test.ts`.
- **`contexts.trace.trace_id`** (32 hex) không nằm trong danh sách opaque nên bị luật token chung
  thay bằng `[redacted]`; chấp nhận, không nới danh sách opaque.

## Hệ quả

- Không upload source map (D-5): `build.sourcemap` giữ tắt, `dist/` không có `.map`; stack frame của
  bản build là mã đã minify — đếm và gắn được với release, chưa đọc được. Upload bằng
  `@sentry/vite-plugin` với token riêng là phase 2 (issue riêng).
- Hai công tắc (D-11): tắt _lưu_ = vô hiệu client key của project `gogo-cms` trong console (trình
  duyệt vẫn gửi); tắt _gửi_ = build lại với `CMS_SENTRY_DSN=off`.
- Nếu sau này thêm CSP cho CMS: `connect-src` phải có `*.ingest.us.sentry.io`.
- Seer AI không được đọc dữ liệu CMS cho tới khi cổng D-7 (privacy review + DPA) được ghi trên
  GoGo-Infra#208.
