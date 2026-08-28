# Ma trận quyền và `RoleGate`

> `RoleGate` **ẩn** thứ một vai trò không dùng được. Nó **không phải** lớp phân
> quyền. Máy chủ đọc lại hàng admin ở mỗi request và là nơi quyết định cuối
> cùng. Nếu UI ẩn nút mà API vẫn cho gọi, đó là bug của GoGo-BE — báo, đừng vá
> ở client.

Nguồn sự thật: `libs/modules/cms/presentation/admin.guard.ts` của GoGo-BE
(BE-IMP-008, GoGo-BE#144) cùng các `@RequireRole(...)` trên từng controller.
Tài liệu này là bản sao — khi hai bên lệch nhau, guard đúng.

## Quy tắc: đọc phân cấp, ghi khớp chính xác

```
allowed = role === 'super_admin'
       || routeRoles.includes(role)
       || (safeMethod && rank[role] >= min(rank of routeRoles))
```

- `safeMethod` = `GET` / `HEAD` / `OPTIONS`.
- Rank: `editor` = `moderator` = **1** · `ops_admin` = **2** · `super_admin` = **3**.
- Bốn vai là **ngang hàng**, không phải một chuỗi: `ops_admin` **không** bao gồm
  `editor`. Đúng cho việc ghi — ops không có việc gì phải sửa nội dung biên tập.
- Nhưng với việc đọc thì sai: ops publish import (tạo place) rồi 403 khi mở
  danh sách place vừa tạo; người trực ca không xem được cả catalog lẫn hàng chờ.
  Nên method an toàn pass theo rank: vai ngang hàng đọc được của nhau, vai cao
  đọc xuống dưới, **không ai đọc lên trên**.

`src/shared/auth/permissions.ts` tái hiện đúng công thức này thay vì chép lại
kết luận đã làm phẳng — bản phẳng chính là thứ đã lệch lần trước.

## Controller → `@RequireRole`

| Controller                         | Route                                                                                                               | `@RequireRole`                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `CmsCatalogController`             | `/cms/places/**`                                                                                                    | `editor`                           |
| `CmsContentController`             | `/cms/taxonomies/**`, `/cms/collections/**`                                                                         | `editor`, `ops_admin`              |
| `CmsModerationController`          | `/cms/moderation/**`                                                                                                | `moderator`                        |
| `CmsSubmissionController`          | `/cms/place-submissions/{id}/decide`                                                                                | `moderator`, `editor`              |
| `CmsOpsController` + ranking/flags | `/cms/ranking-configs/**`, `/cms/feature-flags/**`, `/cms/experiments/**`, `/cms/ops/kpis`, `/cms/search-analytics` | `ops_admin`                        |
| `CmsAuditController`               | `/cms/audit`, `/cms/places/{id}/audit`                                                                              | `editor` (đọc theo rank → mọi vai) |
| `PlaceImportController`            | `/cms/place-imports/**`                                                                                             | `editor`, `ops_admin`              |
| `PlaceImportController#publish`    | `/cms/place-imports/{jobId}/publish`                                                                                | `ops_admin` (handler-level)        |
| `EmergencyController`              | `/cms/emergency/**`                                                                                                 | `editor`, `moderator`, `ops_admin` |
| `CmsAuthController#createAdmin`    | `/cms/auth/admins`                                                                                                  | `super_admin`                      |

## Kết quả

| Hành động                                                         | editor | moderator | ops_admin | super_admin |
| ----------------------------------------------------------------- | :----: | :-------: | :-------: | :---------: |
| **Xem** catalog, stale, duplicates                                |   ✅   |    ✅     |    ✅     |     ✅      |
| **Xem** hàng chờ kiểm duyệt                                       |   ✅   |    ✅     |    ✅     |     ✅      |
| **Xem** collections                                               |   ✅   |    ✅     |    ✅     |     ✅      |
| **Xem** phiên nhập, dòng, báo cáo lỗi                             |   ✅   |    ✅     |    ✅     |     ✅      |
| **Xem** ops KPI, chất lượng tìm kiếm, đánh giá config (rank ≥ 2)  |   ❌   |    ❌     |    ✅     |     ✅      |
| **Xem** nhật ký kiểm toán                                         |   ✅   |    ✅     |    ✅     |     ✅      |
| **Xem** IP nhân viên trong nhật ký (rank ≥ 2)                     |   ❌   |    ❌     |    ✅     |     ✅      |
| Sửa place · đổi trạng thái · giờ · giá · merge · verify freshness |   ✅   |    ❌     |    ❌     |     ✅      |
| Sửa taxonomy, synonym, collection                                 |   ✅   |    ❌     |    ✅     |     ✅      |
| Duyệt review / report / check-in                                  |   ❌   |    ✅     |    ❌     |     ✅      |
| Quyết định đề xuất từ Mobile                                      |   ✅   |    ✅     |    ❌     |     ✅      |
| Tạo/chạy/huỷ/retry import job, xử lý dòng                         |   ✅   |    ❌     |    ✅     |     ✅      |
| **Publish import → catalog**                                      |   ❌   |    ❌     |    ✅     |     ✅      |
| Ranking config (draft/approve/activate/rollback), feature flag    |   ❌   |    ❌     |    ✅     |     ✅      |
| Định nghĩa / dừng thử nghiệm A/B                                  |   ❌   |    ❌     |    ✅     |     ✅      |
| Gỡ khẩn cấp place/review/check-in                                 |   ✅   |    ✅     |    ✅     |     ✅      |
| Tạo admin                                                         |   ❌   |    ❌     |    ❌     |     ✅      |

## Quy tắc không nằm trong bảng

- **Publish import tách khỏi import.** Biên tập viên chuẩn bị lô, vận hành mới
  xuất bản (`GOGO_PLACE_INGESTION_SPEC.md` §9.3).
- **Bốn mắt cho ranking config.** Người tạo không được tự duyệt — API trả
  `403 SELF_APPROVAL`. UI chỉ tránh mời một cú click vô nghĩa.
- **Nhật ký kiểm toán chỉ đọc.** FR-CMS-008: log bất biến. GoGo-BE không phục
  vụ route ghi nào ở đây và trả 404 cho `PATCH`/`PUT`/`DELETE` **kể cả**
  `super_admin`. UI không được có nút nào gợi ý ngược lại.
- **IP nhân viên là PII trong nhật ký.** Chỉ trả cho `ops_admin` trở lên; lý do
  giữ lại là phân biệt "admin đó làm" với "tài khoản admin đó bị chiếm", và lý
  do đó không mở rộng sang vai không làm điều tra sự cố. Với vai khác, trường
  **không tồn tại** — UI không hiện ô trống, vì ô trống đọc như thiếu dữ liệu.
- **Nhánh thử nghiệm chỉ nhận phiên bản đã duyệt.** Thử nghiệm không được là
  đường vòng để đẩy trọng số chưa duyệt ra người dùng; bốn mắt vẫn là cửa.
- **Mất quyền giữa phiên** — kể cả quyền đọc. Guard đọc lại hàng admin mỗi
  request, không tin token. `401` → về login giữ đường dẫn quay lại; `403` →
  màn permission-denied. Không bao giờ trang trắng.

## Điểm hạ cánh sau đăng nhập

`landingPathFor()` đưa mỗi vai tới màn nó **thao tác** được, không phải màn nó
chỉ đọc được: `moderator → /moderation`, `editor → /places`,
`ops_admin`/`super_admin` → `/`.
