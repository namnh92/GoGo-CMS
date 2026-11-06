# Xác minh địa điểm — GoGo-CMS#275

Refs #275 · REDESIGN-G02-VERIFY · owner D1 06/11/2026.

Từ chi tiết Địa điểm, chọn **Xác minh địa điểm** để mở
`/places/:id/verification`. Route vẫn thuộc mục Địa điểm trong navigation hiện
có (`src/app/nav.ts` đã match `/places/**`); không tạo hàng chờ chưa có API.

Xác minh chỉ xác nhận danh tính và vị trí địa điểm. Không chứng nhận chất
lượng, an toàn; không phải freshness, duyệt publish hoặc ánh xạ hành chính.
Màn hiển thị tên, địa chỉ, toạ độ được API cung cấp, trạng thái và thời điểm
xác minh. Đổi danh tính/vị trí đáng kể có thể làm BE thu hồi badge.

## Contract và quyền

Dùng nguyên OpenAPI 6.0 và generated `setVenueVerification` / `SetVenueVerification`
trong repo; không sửa spec hoặc generated schema. `GET /v1/cms/places/{id}` cung
cấp `verification.etag`; `PUT /v1/cms/places/{id}/verification` gửi nguyên ETag
trong `If-Match`. ETag bao gồm cả revision danh tính và revision xác minh.

- Moderator/super_admin quyết định. Editor/ops_admin đọc, không có form ghi.
  BE vẫn là lớp cưỡng chế quyền; 403 khi đang thao tác thay form bằng permission-denied.
- Verify: `status: verified`, `evidenceType` từ enum contract (`site_visit`,
  `official_registry`, `venue_document`), `evidenceReference`, `reason`.
- Revoke: `status: unverified`, `reason`. Không gửi bằng chứng cũ cho một quyết
  định thu hồi. Bằng chứng và lý do giới hạn 500 ký tự; khoảng trắng bị trim.
- Preview hiển thị địa điểm, badge trước/sau, bằng chứng khi verify và lý do.
  Mỗi preview có một idempotency key; retry cùng preview giữ nguyên key và body.
  Cookie, CSRF, refresh session dùng HTTP client chung. Không tự retry mutation.
- 412/428: đóng preview, khoá ghi; người dùng phải tải lại và kiểm tra địa điểm.
  Revision mới reset form, tránh áp quyết định cũ lên danh tính mới.
- Sau 2xx, invalidate các query `places` (detail/list/audit). Không đổi badge
  optimistic. Chặn ghi tiếp cho tới khi nhận revision mới.
- Thiếu verification/ETag: hiển thị unavailable, không giả định unverified.
  Có skeleton loading, lỗi đọc có retry, offline khoá ghi và lỗi mutation hiển thị
  request ID/field errors từ BFF.

Nút audit dùng endpoint và `AuditTrail` hiện có, hiển thị 20 sự kiện gần nhất,
actor, thời điểm và diff. Detail/mutation response không có nội dung bằng chứng
lịch sử; CMS không dựng hoặc giữ lại nội dung đó trong bộ nhớ lâu dài. Tham chiếu
được render dưới dạng văn bản, không tự mở URL. Không thêm log hoặc telemetry
chứa bằng chứng/lý do/toạ độ; đường API đã có trong registry redaction hiện có.

## Bàn giao gate cho Claude

Chưa chạy test, typecheck, lint, build, format check hoặc acceptance; chưa commit/push.
Không dùng network/AWS/DB/Google hoặc cài package.

Các test đã viết:

- `placeVerification.test.tsx`: verify→revoke, body/header, preview, quyền đọc/ghi,
  kiểm tra đầu vào, thiếu contract, xung đột 412, retry mạng giữ key, 403, lỗi đọc.
- `permissions.test.ts`: moderator/super_admin và tách quyền freshness.
- `venueVerification.contract.test.ts`: response giữ ETag, từ chối concurrency/state sai.
- `client.test.ts`: If-Match/idempotency/CSRF giữ nguyên sau 401→refresh→replay.

Claude chạy các gate repo trên revision cuối. AC triển khai còn chờ: verify một
place test trên cms-dev bằng moderator, xem badge và verifiedAt trên app, revoke
với lý do rồi kiểm tra badge app biến mất sau khi refresh dữ liệu. Ghi actor,
request ID, revision, audit, thời điểm và bằng chứng quan sát thực tế; không coi
unit test hoặc badge CMS là acceptance của app. Kiểm tra thêm BE từ chối editor /
ops_admin gửi PUT trực tiếp, và material identity edit làm mất badge.

Không có quyết định owner còn thiếu trong phạm vi client. `RTK.md` được prompt
tham chiếu nhưng không có tại repo/workspace cha; đã đọc quy tắc workspace và repo.
