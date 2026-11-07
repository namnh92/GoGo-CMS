# GoGo-CMS#284 — kiểm duyệt dữ liệu wizard

Contract 7.6.0-alpha.1 (BE #807 / #806, merge `0d238eb`). Blob OpenAPI
`b225ba22aa436350fa877de3a37e0be75c7dc307`; SHA-256
`038741aac5098a56ff27117c6de97533baa674837620700dccd94571b8280f41`.
Lệnh owner yêu cầu `git -C /Users/maxnguyen/MyWorks/GoGo/GoGo-BE show origin/re-design:openapi/gogo.v1.yaml`
trả bản 7.5.0 do remote ref local còn cũ. Sandbox chặn fetch vào BE và mạng
shell không phân giải GitHub. Bản vendor lấy nguyên byte từ blob BE local
`cce6b67f:openapi/gogo.v1.yaml`, đã đối chiếu cùng Git blob SHA với file tại
merge `0d238eb` qua GitHub connector; không sửa YAML. Types sinh bằng
`pnpm api:types`; version/digest/operation count/path telemetry đồng bộ.

Màn chi tiết đọc `contribution.enrichment`, `enrichmentItems`, `expectedCredit`
qua schema kiểm tra tương thích kiểu BE sinh tự động. Mỗi fact có ô giữ/bỏ:
price nguyên khoảng + đơn vị, từng purpose/vibe/amenity (false vẫn là fact),
món nên thử, mẹo, từng rating và từng rating tag. Nhãn taxonomy lấy theo
kind/key và locale, vi fallback; nhãn thiếu báo key. Consent không phải fact.
Không suy diễn priceLevel từ khoảng giá. Lựa chọn chỉ thuộc phiên đang mở;
đóng/đổi đóng góp xoá lựa chọn, cảnh báo rời đi khi có bỏ chọn.

Duyệt và gộp gửi `enrichmentSelection` gồm `keptFactKeys` lấy từ
`detail.enrichmentItems.factKeys` và `keptPhotoMediaIds` lấy từ danh sách media
BE trả, đối chiếu ảnh pending. Ảnh thường gửi riêng bằng `approvedPhotoIds`;
không gửi wizard photo-row ids vào mảng này. Bỏ toàn bộ gửi mảng rỗng tường
minh; không bỏ field để fallback hành vi cũ. Reject vẫn chỉ gửi rejectionReason
và ghi chú tùy chọn. Mutation giữ Idempotency-Key, RBAC/CSRF hiện có.

Ảnh menu/bill dùng trình xem ảnh xác thực có sẵn. Copy vi/en nói rõ người dùng
đồng ý công khai, không DLP hay tự che thông tin cá nhân. Ảnh duyệt là ảnh USER
trong phần đánh giá, có ghi công; không vào gallery chính thức/cover. Promote
là thao tác riêng ngoài task này.

CMS gọi `POST /cms/place-submissions/{id}/credit-preview` cho đúng selection,
hiện base/photoBonus/total nguyên từ response. Không còn hằng số hay công thức
50/20 ở client; không coi preview là credit đã cấp. Query key chứa selection
để response cũ không thay số của selection mới. Có loading/error/retry/403;
Loading/lỗi preview hoặc nhãn fact chặn duyệt/gộp tới khi đọc thành công;
403 preview gỡ chọn fact/ảnh. Detail thiếu enrichmentItems chặn
wizard approve/merge thay vì âm thầm áp dụng hành vi cũ. Loading/empty/error,
permission/offline và pressed/loading/disabled dùng component/tokens hiện có.

Observability dùng request/contract mismatch hiện có và path template mới,
không thêm nội dung fact, ảnh hay ghi chú vào telemetry. Audit kept/dropped do
BE ghi. Local gates không phải nghiệm thu cms-dev hay xác nhận ledger.
DEV acceptance cần BE #807: moderator giữ một phần, bỏ toàn bộ, duyệt/gộp,
kiểm tra contributionFacts/userPhotos và tín dụng ledger; thử quyền bị thu hồi.

Rollback: hoàn nguyên UI/types/contract/pins cùng nhau về PR #288, giữ chặn
wizard approval của phiên bản đó. Không cần đổi dữ liệu hay rollback BE.
