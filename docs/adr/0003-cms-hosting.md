# ADR-0003: CMS chạy trên Cloudflare Worker, proxy `/v1` cùng origin

- **Trạng thái:** Chấp nhận cho môi trường dev (`gogo-cms-dev`)
- **Ngày:** 2026-08-28
- **Phạm vi:** GoGo-CMS · liên quan GoGo-Infra, GoGo-BE

## Bối cảnh

Một project Cloudflare Workers (`gogo-cms-dev`) đã được nối vào repo qua
dashboard. Mọi build đều đỏ:

```
Executing user deploy command: npx wrangler versions upload
✘ [ERROR] Missing entry-point to Worker script or to assets directory
```

Hai nguyên nhân: repo không có `wrangler` config nào, và build command của
project rỗng nên `dist/` chưa từng được tạo (`dist/` nằm trong `.gitignore`).

Sửa hai cái đó thì build xanh, nhưng bản deploy vẫn vô dụng: CMS gọi API theo
`VITE_API_BASE_URL=/v1` — **cùng origin, cố ý**. Phiên đăng nhập là cookie
`HttpOnly; SameSite=Lax` (GoGo-BE ADR-0003). Gọi thẳng sang hostname của BFF sẽ
biến mọi request thành cross-site, buộc cookie phải `SameSite=None` — đúng thứ
mà CSRF protection sinh ra để tránh.

## Quyết định

Worker vừa serve asset tĩnh vừa **proxy `/v1/*` sang GoGo-BE trên cùng origin**.

- `wrangler.jsonc`: `assets.directory = ./dist`,
  `not_found_handling = single-page-application` (React Router sở hữu URL:
  `/audit`, `/places/:id` phải trả app shell khi load trực tiếp hoặc F5), và
  `run_worker_first = ["/v1/*"]` — thiếu dòng này thì SPA fallback nuốt luôn
  `/v1` và mọi lời gọi API "thành công" với HTML.
- Worker forward `cf-connecting-ip` thành `x-forwarded-for`. GoGo-BE ghi **IP
  nhân viên** vào audit entry và rate-limit theo IP; sau proxy, cả hai sẽ thấy
  Worker chứ không thấy người dùng nếu không forward.
- Response API luôn `cache-control: no-store`. Một response API là dữ liệu của
  một phiên; cache ở edge là phát dữ liệu admin này cho admin khác.
- `BE_ORIGIN` không commit vào repo. Chưa set thì Worker trả
  `503 BACKEND_NOT_CONFIGURED` kèm envelope lỗi chuẩn — nói rõ môi trường chưa
  được cấu hình, thay vì 404 đọc như "CMS hỏng".
- `public/_headers`: `X-Frame-Options: DENY`, `nosniff`, `no-referrer`,
  `Cross-Origin-Opener-Policy`. Back-office nhúng được trong iframe là
  clickjacking.

## Phương án đã cân nhắc

| Phương án                                                 | Vì sao không chọn                                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Chỉ serve asset tĩnh, client gọi thẳng `https://api-dev…` | Cross-site → cookie phải `SameSite=None`, mở lại đúng bề mặt CSRF; và cần CORS với credentials cho một app nội bộ |
| Chạy hẳn CMS trên máy dev (đúng infra plan hiện tại)      | Vẫn đúng cho việc phát triển, nhưng không có URL cho người ngoài dev review                                       |
| Ngắt integration, chờ Terraform                           | Sạch nhất về quy trình, nhưng bỏ phí một môi trường preview đã có                                                 |

## Điều kiện bắt buộc trước khi dùng thật

1. **Cloudflare Access đứng trước hostname.** Bản deploy này không tự xác thực
   — GoGo-BE quyết mọi quyền — nhưng một trang đăng nhập admin công khai là lời
   mời credential stuffing. Rule bảo mật của workspace: CMS production bắt buộc
   SSO/MFA.
2. **`TRUST_PROXY` ở GoGo-BE phải tin đúng hop này.** Không thì BE bỏ qua
   `x-forwarded-for` (cố ý: tin mọi hop sẽ khiến `req.ip` do client điều khiển)
   và cột IP trong audit log ghi sai người.
3. **`COOKIE_SECURE=true`** ở môi trường dev đó, vì Worker chạy HTTPS.

## Hệ quả

- Hạ tầng này hiện **tạo bằng tay trong dashboard**, trái yêu cầu #7 của
  `GoGo-Infrastructure-Plan-Spec.md` (hạ tầng phải tái lập bằng Terraform), và
  plan cũng chưa khai hosting cho CMS FE. Config trong repo là nửa tái lập
  được; nửa còn lại (project, biến môi trường, Access policy) phải chuyển về
  `GoGo-Infra` dưới dạng task `INF-*` → [GoGo-Infra#25](https://github.com/namnh92/GoGo-Infra/issues/25).
- Worker là một hop thêm giữa CMS và BFF: mọi thay đổi về cookie, CSRF hay
  header của GoGo-BE phải kiểm lại ở đây.
