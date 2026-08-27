# Ma trận quyền và `RoleGate`

> `RoleGate` **ẩn** thứ một vai trò không dùng được. Nó **không phải** lớp phân
> quyền. Máy chủ đọc lại hàng admin ở mỗi request và là nơi quyết định cuối
> cùng. Nếu UI ẩn nút mà API vẫn cho gọi, đó là bug của GoGo-BE — báo, đừng vá
> ở client.

Nguồn: `README.md` (bảng quyền), `GOGO_SRS.md` §8.8, `GOGO_PLACE_INGESTION_SPEC.md` §9.3.

## Khoá quyền → endpoint

Định nghĩa trong `src/shared/auth/permissions.ts`. Kiểm thử trong
`src/shared/auth/permissions.test.ts`.

| Khoá quyền              | editor | moderator | ops_admin | super_admin | Endpoint                                                            |
| ----------------------- | :----: | :-------: | :-------: | :---------: | ------------------------------------------------------------------- |
| `place.read`            |   ✅   |     —     |    ✅     |     ✅      | `GET /cms/places`, `/stale`, `/duplicates`, `/{id}`                 |
| `place.write`           |   ✅   |     —     |    ✅     |     ✅      | `PATCH /cms/places/{id}`, `PUT .../hours`, `POST .../prices`        |
| `place.transition`      |   ✅   |     —     |    ✅     |     ✅      | `PATCH /cms/places/{id}/status`                                     |
| `place.merge`           |   ✅   |     —     |    ✅     |     ✅      | `POST /cms/places/{id}/merge`                                       |
| `place.verifyFreshness` |   ✅   |     —     |    ✅     |     ✅      | `POST /cms/places/{id}/verify-freshness`                            |
| `import.read`           |   ✅   |     —     |    ✅     |     ✅      | `GET /cms/place-imports*`                                           |
| `import.manage`         |   ✅   |     —     |    ✅     |     ✅      | `POST /cms/place-imports`, `/start`, `/cancel`, `/retry`, `/rows/*` |
| **`import.publish`**    |   ❌   |     —     |    ✅     |     ✅      | `POST /cms/place-imports/{jobId}/publish`                           |
| `moderation.read`       |   —    |    ✅     |    ✅     |     ✅      | `GET /cms/moderation`                                               |
| `moderation.decide`     |   —    |    ✅     |    ✅     |     ✅      | `POST /cms/moderation/{reviews\|reports\|checkins}/{id}`            |
| `submission.decide`     |   ✅   |    ✅     |    ✅     |     ✅      | `POST /cms/place-submissions/{id}/decide`                           |
| `taxonomy.manage`       |   —    |     —     |    ✅     |     ✅      | `POST/PATCH /cms/taxonomies*`                                       |
| `collection.manage`     |   —    |     —     |    ✅     |     ✅      | `POST/PUT/PATCH /cms/collections*`                                  |
| `flag.manage`           |   —    |     —     |    ✅     |     ✅      | `PUT /cms/feature-flags/{key}`                                      |
| `ranking.draft`         |   —    |     —     |    ✅     |     ✅      | `POST /cms/ranking-configs`                                         |
| `ranking.approve`       |   —    |     —     |    ✅     |     ✅      | `POST /cms/ranking-configs/{id}/approve`                            |
| `ranking.activate`      |   —    |     —     |    ✅     |     ✅      | `POST /cms/ranking-configs/{id}/activate`                           |
| `ranking.rollback`      |   —    |     —     |    ✅     |     ✅      | `POST /cms/ranking-configs/{key}/rollback`                          |
| `ops.dashboard`         |   ✅   |    ✅     |    ✅     |     ✅      | `GET /cms/ops/kpis`                                                 |
| `admin.create`          |   —    |     —     |     —     |     ✅      | `POST /cms/auth/admins`                                             |

## Quy tắc không nằm trong bảng

- **Publish import tách khỏi import.** Biên tập viên chuẩn bị lô, vận hành mới
  xuất bản (`GOGO_PLACE_INGESTION_SPEC.md` §9.3). UI vẫn hiện nút publish cho
  editor nhưng ở trạng thái `disabled` để giải thích được, thay vì biến mất.
- **Bốn mắt cho ranking config.** Người tạo không được tự duyệt. API trả
  `403 SELF_APPROVAL`; UI chỉ tránh mời một cú click vô nghĩa.
- **Mất quyền giữa phiên.** Admin bị suspend/hạ quyền mất quyền ở request kế
  tiếp. `401` phát sự kiện `gogo:session-expired` → về màn đăng nhập kèm thông
  báo; `403` render màn permission-denied. Không bao giờ để trang trắng.

## Điểm hạ cánh sau đăng nhập

`landingPathFor()` đưa mỗi vai trò tới màn đầu tiên nó thật sự dùng được:
`moderator → /moderation`, `editor → /places`, `ops_admin`/`super_admin → /`.
