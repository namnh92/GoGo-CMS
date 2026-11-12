# GoGo-CMS#293 — tên khác của địa điểm / ghi chú PR

Refs #293. Phụ thuộc GoGo-BE#887, đã merge qua PR #901 (`c7321100`).
Nhánh `feature/GOGO-293-place-aliases`, base `re-design` tại `9d776b3`.
Không commit, push hay mở PR trong phiên này.

## Hành vi

Form định danh giữ component/layout hiện tại và thêm danh sách chip tên khác.
Thêm bằng nút hoặc Enter; xoá từng chip. Tối đa 20 tên, mỗi tên tối đa 120
ký tự; không nhận tên rỗng, ký tự điều khiển/format hoặc xuống dòng, kể cả
trước trim. Ô tên chưa thêm phải được thêm hoặc xoá trước khi lưu để tránh
mất bản nháp. Chuẩn hoá và gộp tên trùng thuộc BE; response được đọc lại sau lưu.

PATCH chỉ gửi `aliases` khi tập tên thay đổi. Gửi toàn bộ tập thay thế; `[]`
xóa hết; không gửi giữ nguyên. Mỗi lần thay thế, kể cả xoá hết, kèm:

- `aliasProvenance.sourceType: editorial` (literal theo DTO sinh từ OpenAPI).
- `sourceReference` độc lập, bắt buộc, tối đa 500 ký tự.
- `collectedAt`: ngày giờ nhập theo múi giờ người dùng, chuyển ISO UTC khi gửi.
- `expectedUpdatedAt`: phiên bản đã tải; không tự đoán thời gian của BE.

Nguồn phải hỗ trợ toàn bộ tập tên hoặc việc xoá. Gợi ý xác nhận của cơ sở,
website chính thức hoặc khảo sát; không dùng Google, output AI, hội thoại,
hay chỉ mã job/sheet. Client kiểm tra thiếu nguồn/ngày, độ dài và clock skew
5 phút; BE kiểm tra tính độc lập và trả `field_errors`. Không gọi nguồn bên ngoài.

`aliases`, `aliases.N` và `aliasProvenance[.property]` đưa lỗi về control;
path chưa biết vẫn hiện trong panel cùng request ID. 409 giữ chip và nguồn,
hiện khác biệt tên của client/server; tải lại có xác nhận mất thay đổi;
Ghi đè chạy lại validation và dùng phiên bản vừa đọc. Không có retry mù.

Quyền dùng `can('place.write')` hiện có, dựa trên role của phiên do BE trả.
BE DTO không có cờ quyền riêng cho trường: editor và super_admin ghi;
moderator/ops_admin xem chip chỉ đọc. BE tiếp tục là lớp thực thi quyền.
403 khi lưu gỡ control ghi. Loading/error/permission/offline của fetch dùng
AsyncBoundary hiện có. Control tên/nguồn bị khoá khi lưu hoặc offline; dữ
liệu đang sửa được giữ khi lỗi. Copy vi/en, màu/typography từ token, view/style tách.

Không thêm payload tên, nguồn hoặc thời gian thu thập vào telemetry. Audit
`place.aliases_updated` do BE ghi atomically; CMS giữ AuditTrail hiện có.
Các path mới của contract được đưa vào path-template redaction hiện có.

## Contract và fallout tối thiểu

Vendor nguyên byte từ `../be-887/openapi/gogo.v1.yaml`, contract
`10.3.0-alpha.1`; chạy `pnpm api:types`, không sửa tay generated types.
SHA-256: `1fc14c780b82ac9e730beb8a38944e8b3239047ab363be57a151848d94d6a48b`.
Version pin, digest, số operation (330), path templates cùng bản vendor.

Fallout của bước nhảy từ `7.6.0-alpha.1`:

1. Compile: ledger credit chuyển `reason` từ enum đóng sang string mở.
   Resolve nhãn qua i18n, thêm nhãn `assistant_usage_adjustment` và fallback
   cho key chưa biết. Không đổi bố cục màn ledger.
2. Runtime liên quan cùng DTO: `delta` giờ là integer khác 0 trong phạm vi
   safe integer, thay cho chỉ `50 | -1`. Boundary nhận signed adjustments,
   từ chối 0/số lẻ/ngoài phạm vi; test cũ về delta cập nhật theo contract.
3. Contract gate: cập nhật version/digest/330 operation và danh sách path mới (thêm 11, bỏ 1)
   (thứ tự theo spec) để giữ redaction khớp contract. README cập nhật nguồn.

Fallout do thêm field: locator test provider-status dùng `/Tên/` nay khớp
cả tên hiển thị và alias: đổi sang đúng nhãn `Tên hiển thị`. Không đổi màn
provider-status.

Thay đổi đặc thù alias: read boundary giữ `aliases`; request dùng Pick từ
`CmsUpdatePlaceBody` sinh tự động; form/mock/test fixtures hỗ trợ aliases và
provenance. Không thêm alias vào DTO tạo mới.

## Deviation cho owner — stitch-design §0

Theo chỉ dẫn owner trong task GoGo-CMS#293 ngày 2026-11-12: chưa có màn
Stitch cho trường alias; dùng component/layout của form hiện tại và ghi
lệch ở ghi chú PR. Trường mới đặt sau tên/trạng thái, trước mô tả, dùng chip,
TextInput, Button và token hiện có. Áp dụng cùng cấu trúc cho Light/Dark.
Chưa có ảnh Stitch cặp Light/Dark để so; không tuyên bố khớp Stitch 100%.
Owner cần duyệt vị trí, mật độ chip và vùng nguồn trước nghiệm thu giao diện.

## Kiểm thử và nghiệm thu

Unit/component bao phủ đọc alias, thêm/xoá/xoá hết, bounds, provenance,
field_errors, các role, 403 giữa phiên, loading/disabled/offline, conflict
và Ghi đè, bản nháp chưa thêm, i18n. Kiểm thử ledger chỉ bao phủ fallout DTO.
Kết quả gates và mutation proof ở bên dưới.

Nghiệm thu DEV chưa chạy: cần editor lưu/thêm/xoá/xoá hết trên BE chứa
`c7321100`, thử thiếu/Google source, stale version, moderator/ops_admin chỉ
đọc và super_admin override. Test local không thay nghiệm thu DEV hoặc
review độc lập. Không sửa/ghi dữ liệu DEV trong phiên này.

Rollback UI: hoàn nguyên field/model alias, giữ contract mới và phần tương
thích ledger khi BE vẫn chạy 10.3. Console cũ không gửi aliases thì BE giữ
nguyên dữ liệu; rollback UI không xoá alias đã lưu. Không cần migration CMS.

## File thay đổi

- `README.md`
- `docs/place-aliases.md`
- `openapi/gogo.v1.yaml`
- `scripts/check-openapi-drift.mjs`
- `src/features/places/api.ts`
- `src/features/places/placeAliases.integration.test.tsx`
- `src/features/places/placeAliases.style.tsx`
- `src/features/places/placeAliases.test.ts`
- `src/features/places/placeAliases.ts`
- `src/features/places/placeAliases.view.tsx`
- `src/features/places/placeEditor.view.tsx`
- `src/features/places/placeForm.ts`
- `src/features/places/providerStatus.test.tsx`
- `src/features/users/assistantCredits.api.ts`
- `src/features/users/assistantCredits.contract.test.ts`
- `src/features/users/assistantCredits.test.tsx`
- `src/features/users/assistantCredits.view.tsx`
- `src/shared/api/cmsPlaceContract.ts`
- `src/shared/api/contract.test.ts`
- `src/shared/api/contracts.ts`
- `src/shared/api/schema.d.ts`
- `src/shared/i18n/en.ts`
- `src/shared/i18n/vi.ts`
- `src/shared/observability/pathTemplates.ts`
- `src/shared/test/fixtures.ts`
- `src/shared/test/handlers.ts`

## Mutation proof

Tạm chèn 14 lỗi có chủ đích vào production code, mỗi lần chạy test nhắm đúng
hành vi rồi phục hồi nguyên byte file. Mỗi lần trả exit **1** với assertion
failure; không có compile/import failure dùng thay bằng chứng. Tất cả **18/18**
test alias (5 unit + 13 component/integration) đã thực sự đỏ ít nhất một lần.
Sau khi phục hồi, 18/18 test xanh. Không giữ mutation trong source.

Lệnh chung: `pnpm exec vitest run <test-files> -t '<target>'`.

| ID  | Lỗi tạm chèn                      | Test đỏ                                                     | Exit |
| --- | --------------------------------- | ----------------------------------------------------------- | ---- |
| M01 | Thêm không đổi tập chip           | `adds a chip` (1)                                           | 1    |
| M02 | Xoá không đổi tập chip            | `removes the last chip` (1)                                 | 1    |
| M03 | Nới maxLength thành 121           | `boundary values / refuses overlong` (2)                    | 1    |
| M04 | Bỏ mapping lỗi alias theo index   | `maps list / maps BE indexed` (2)                           | 1    |
| M05 | Hiện control ghi với role chỉ đọc | `renders aliases read-only` (2)                             | 1    |
| M06 | Bỏ disabled khi saving/offline    | `disables alias controls` (1)                               | 1    |
| M07 | Bỏ aliases/provenance khỏi PATCH  | `sends a whole replacement` (1)                             | 1    |
| M08 | Bỏ kiểm tra evidence              | `requires reference` (1)                                    | 1    |
| M09 | Bỏ alias khỏi diff conflict       | `keeps chips on a version conflict / rechecks evidence` (2) | 1    |
| M10 | Không gỡ quyền sau 403            | `removes write controls` (1)                                | 1    |
| M11 | Bỏ super_admin override           | `super-admin override` (1)                                  | 1    |
| M12 | Làm sai copy tiếng Anh            | `uses English copy` (1)                                     | 1    |
| M13 | Read boundary làm mất aliases     | `preserves aliases when parsing` (1)                        | 1    |
| M14 | Bỏ chặn bản nháp chưa thêm        | `does not silently discard` (1)                             | 1    |

Log chi tiết giữ local tại `/tmp/cms-293-mutations/M01.log` … `M14.log`;
`summary.json` ghi test cụ thể và exit code; script phục hồi trong `finally`
ở `/tmp/cms-293-mutate.py`. Gates local ở `/tmp/cms-293-final-*.log`.

## Gates cuối — 2026-11-12

| Lệnh                                         | Exit | Kết quả                                        |
| -------------------------------------------- | ---- | ---------------------------------------------- |
| `pnpm api:types`                             | 0    | Regenerate từ spec 10.3.0-alpha.1              |
| `pnpm typecheck`                             | 0    | Không lỗi                                      |
| `pnpm lint`                                  | 0    | 0 lỗi, 20 warning trong file không sửa         |
| `pnpm test`                                  | 0    | 110 file, 1.691 test pass; gồm 18 alias test   |
| `pnpm build`                                 | 0    | Thành công; Vite cảnh báo chunk lớn hơn 500 kB |
| `pnpm api:check`                             | 0    | Version và generated types đồng bộ             |
| `git diff --check`                           | 0    | Không lỗi whitespace                           |
| `cmp` vendor với file BE được owner chỉ định | 0    | Nguyên byte                                    |

Mutation harness exit 0: 14/14 mutant bị test bắt (từng test run exit 1),
18/18 alias test có bằng chứng đỏ và xanh. Mọi mutation đã phục hồi.
HEAD vẫn `9d776b3`; 26 file thay đổi, chưa commit. Không có merge, deploy,
DEV acceptance hoặc review độc lập được tuyên bố từ kết quả local này.
