# GoGo-CMS#284 — kiểm duyệt dữ liệu wizard

Màn chi tiết đóng góp đọc `contribution.enrichment` qua schema kiểm tra tương
thích kiểu BE sinh tự động. Hiển thị giá theo khoảng + đơn vị (miễn phí riêng),
mục đích, mood, tiện ích có/không, món nên thử, mẹo và hai đánh giá tùy chọn.
Nhãn taxonomy lấy theo cặp kind/key từ CMS, dùng locale hiện tại rồi vi.
Không có nhãn thì báo nhãn chưa có kèm key; không suy diễn nhãn từ tiếng Anh.
Loading, lỗi/thử lại, 403, rỗng và offline dùng trạng thái chung của CMS.

Ảnh menu/bill được ghép bằng mediaId, dùng trình xem ảnh xác thực hiện có và
chọn giữ/bỏ từng ảnh. Copy vi/en nói rõ người dùng đồng ý công khai, không DLP
hay tự che thông tin cá nhân. Ảnh duyệt là ảnh người dùng trong phần đánh giá,
có ghi công, không vào gallery chính thức/cover; promote là thao tác riêng.
Không thêm API hay nút promote ngoài phạm vi task này.

## Chưa thể hoàn thành yêu cầu giữ/bỏ từng fact

Contract vendor nguyên byte theo lệnh owner yêu cầu từ BE `origin/re-design`
tại `6cee1378d81d6c13409bd7aa0afd9cb4e6dba811`, version `7.5.0-alpha.1`
(gồm thay đổi #802 tại `1cd439d`). Request `decidePlaceSubmission` chỉ có
`approvedPhotoIds`, không có chọn fact hoặc enrichment đã kiểm duyệt.
`SubmissionReviewDraft` cũng không nhận dữ liệu service/space/tips/amenities;
`ContributionEnrichmentDraft` nói rõ dữ liệu không tự sao chép khi approve.
Vì vậy UI chỉ đọc fact, ghi rõ lý do và chặn approve/merge đóng góp wizard
ở cả nút và mutation. Reject dùng đúng contract; đóng góp cũ vẫn duyệt/gộp
với `approvedPhotoIds`. Không gửi field ngoài hợp đồng, không coi local state
là dữ liệu đã lưu. Cần BE bổ sung hợp đồng giữ/bỏ fact và đích ghi từng fact
trước khi có thể nghiệm thu #284 end-to-end.

Contract cũng không có `priceLevel` trong enrichment: chỉ có min/max/currency/unit.
Không tự ánh xạ khoảng giá thành một mức giá.

## Tín dụng

Detail và decision không trả amount/actual award. Preview dùng công thức tại
BE `1cd439d:libs/modules/shared/assistant-credits.ts:30`: approve có base 50,
giữ ít nhất một menu/bill có bonus 20 một lần; merge chỉ bonus, reject 0.
Guest không nhận tín dụng. Ảnh thường không kích hoạt bonus. UI ghi rõ đây là
mức dự kiến theo contract, máy chủ quyết định cấp thực tế/idempotency. Khi BE
trả số tín dụng thì phải dùng response thay công thức fallback này.

Rollback: bỏ panel/credit preview nhưng giữ nguyên contract và cơ chế chọn ảnh;
không gỡ chặn wizard approval cho tới khi có contract lưu lựa chọn từng fact.
Gate local không phải nghiệm thu cms-dev hay xác nhận máy chủ cấp credit.
