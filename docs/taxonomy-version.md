# Phiên bản phân loại — GoGo-CMS#285

Màn **Phân loại** đọc `GET /v1/cms/taxonomies/version` để hiện `version` và
`updatedAt` (thời điểm ghi thành công cuối cùng, định dạng theo ngôn ngữ và múi
giờ của người dùng). Đây là phiên bản toàn cục, không phải số lượng khoá hay
phiên bản riêng của nhóm đang chọn.

Sau khi tạo khoá, sửa nhãn/thứ tự, bật/tắt hoặc thêm từ đồng nghĩa, CMS lấy
`version`/`updatedAt` trực tiếp từ response đã kiểm tra schema. Không tự tăng
phiên bản, không suy ra thời gian từ đồng hồ client. Response cũ đến muộn không
được ghi đè phiên bản mới hơn; request đọc đang chạy được huỷ trước khi nhận
metadata từ write. Danh sách được tải lại riêng. Write lỗi giữ metadata đã xác
nhận; đọc metadata lỗi có nút thử lại và không che danh sách. Loading, quyền
đọc/ghi và offline dùng cơ chế chung của CMS. Nhãn vi/en dùng sentence case.

Contract được vendor nguyên byte từ GoGo-BE `origin/re-design` tại
`0d238eb` (BE #807), phiên bản
`7.6.0-alpha.1`; SHA-256:
`038741aac5098a56ff27117c6de97533baa674837620700dccd94571b8280f41`.
Types sinh bằng `pnpm api:types`; drift gate, digest, số operation và danh sách
path telemetry cập nhật đồng bộ. Lỗi schema đi qua observability contract
mismatch hiện có; không thêm payload hay nhãn vào telemetry.

Kiểm thử local: schema metadata, read vi/en, loading/error/retry, response của
create/label/order/enable/disable/synonym, write lỗi và response đến sai thứ tự.
Nghiệm thu DEV cần BE chứa contract trên; kiểm tra mỗi thao tác với phiên bản
và thời gian do server trả về. Local gates không thay nghiệm thu DEV.

Rollback: hoàn nguyên thay đổi CMS và contract/types/drift pin cùng nhau;
không thay đổi dữ liệu hay yêu cầu rollback BE.
