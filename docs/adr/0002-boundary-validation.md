# ADR-0002: Validate response bằng zod ở boundary

- **Trạng thái:** Chấp nhận (tạm thời — có điều kiện gỡ bỏ)
- **Ngày:** 2026-08-27
- **Phạm vi:** GoGo-CMS

## Bối cảnh

Quy tắc workspace: _API client là generated code, không viết tay DTO_. Client
được sinh từ `openapi/gogo.v1.yaml` bằng `openapi-typescript`.

Tuy nhiên phần lớn endpoint `/v1/cms/*` trong spec chỉ mô tả response bằng
`description` dạng văn xuôi, không có `schema`.

**Cập nhật 2026-08-28 (GoGo-BE#175).** Bảy operation đọc mà console dùng nhiều
nhất đã có schema thật: `CmsPlaceDetail`, `CmsTaxonomy`, `CmsRankingConfig`,
`CmsFeatureFlag`, `CmsAuditEntry`/`CmsAuditPage`, `CmsRankingEvaluation`,
`CmsSearchAnalytics`, `CmsExperiment` — cộng `CmsPlaceListItem` có từ
GoGo-BE#141. Phần còn thiếu schema là các endpoint như `GET /cms/moderation`,
`/cms/ops/kpis`, `/cms/collections`, `/cms/places/stale`, `/cms/places/duplicates`.

```yaml
/cms/places:
  get:
    responses:
      '200': { description: Places with freshness and confidence }
```

Kết quả: `openapi-typescript` chỉ có thể suy ra `unknown`. Các nhóm có schema
đầy đủ (`ImportJob`, `ImportRow`, `ImportCandidate`, `IngestMessage`,
`ErrorEnvelope`, `AdminRole`, `ModerationDecision`) thì sinh type bình thường.

## Quyết định

1. **Request body luôn dùng type generated** (`src/shared/api/generated.ts`).
   Không viết tay body DTO ở bất kỳ đâu.
2. **Response đi qua `apiFetchParsed(schema, …)`** với zod schema trong
   `src/shared/api/contracts.ts` / `contracts-import.ts`. Lệch shape ném
   `CONTRACT_MISMATCH` ngay tại boundary thay vì thành `undefined` trong một ô
   bảng.
3. Các schema zod này **mirror hiện thực của GoGo-BE một-một** — đọc từ
   controller/service, không phải đoán. Vài shape vì thế xấu hơn một DTO:
   `/cms/places/stale` và `/cms/places/duplicates` trả về mảng trần các dòng
   SQL `snake_case`, `/cms/collections` trả mảng trần. Lớp `api.ts` của từng
   feature chuẩn hoá, để phần xấu dừng lại ở boundary.
4. `pnpm api:check` chặn CI khi spec vendored lệch version hoặc khi
   `schema.d.ts` cũ so với spec.

## Bổ sung 2026-09-06 (CMS-043, GoGo-CMS#122): giới hạn của request body

Điểm 1 nói về **shape**, và shape của request body vẫn lấy từ type generated.
Nhưng OpenAPI vendored chỉ mô tả kiểu, **không mô tả giới hạn**:

```yaml
avgVisitMinutes: { type: integer } # không có minimum/maximum
addressText: { type: string } # không có maxLength
```

Trong khi `placeEditSchema` ở `cms.controllers.ts` bắt `avgVisitMinutes` trong
`10..720` và `addressText` tối đa 400 ký tự. Vì spec không diễn đạt được, CMS
đã tự chép giới hạn vào form và chép sai (`0..1440`, `300`, `80`) — sai lệch
này chỉ lộ ra thành `400 VALIDATION_FAILED` trước mặt biên tập viên.

Nên: giới hạn của request body cho `/cms/places` sống **một chỗ duy nhất**,
`src/shared/api/cmsPlaceContract.ts`, mirror một-một từ `cms.controllers.ts`
đúng như điểm 3. Form dựng rule từ đó, mock MSW validate theo đó và trả đúng
envelope `VALIDATION_FAILED` của `ZodValidationPipe`, và
`cmsPlaceContract.test.ts` viết thẳng các con số ra để lệch là đỏ test.

Gỡ bỏ khi OpenAPI khai báo `minimum`/`maximum`/`maxLength` cho các body này —
lúc đó giới hạn sinh ra được từ spec và bản mirror thành thừa.

## Shape "khát vọng" — đã hết

Trước GoGo-BE#175, năm schema mô tả endpoint **chưa tồn tại** và được đánh dấu
`⚠ Aspirational`. Cả năm giờ là endpoint thật, và shape thật **khác** shape đã
đoán ở nhiều chỗ (rating tách hai nguồn, `bounds` đi kèm từng config, admin là
object chứ không phải chuỗi tên). Đó là lý do quy tắc "đọc từ controller, không
đoán" tồn tại — và cũng là lý do không được để shape tự chế nằm lại trong
`contracts.ts`: không còn `⚠ Aspirational` nào trong `src/`.

## Điều kiện gỡ bỏ

Theo dõi ở [GoGo-BE#163](https://github.com/namnh92/GoGo-BE/issues/163) — đã
đóng cho bảy operation kể trên, phần còn lại vẫn mở dưới dạng các endpoint chưa
khai báo schema.

Vẫn **chưa** thay `apiFetchParsed` bằng type generated cho nhóm đã có schema, vì
hai lý do:

1. Nhóm còn lại vẫn cần zod, nên bỏ nó ở vài chỗ chỉ tạo ra hai lối đọc response
   song song trong cùng một codebase — khó đọc hơn là giữ một lối.
2. Type generated là kiểm tra lúc biên dịch; nó không bắt được server thật trả
   thiếu field. `CONTRACT_MISMATCH` tại boundary là thứ duy nhất bắt được lệch
   thật lúc chạy, và đó chính là loại lỗi vừa xảy ra.

Điều kiện gỡ bỏ vì vậy chặt hơn: **khi toàn bộ `/cms/*` có schema**, đổi cả loạt
sang type generated và giữ zod ở các boundary không do OpenAPI mô tả (deep-link
param, storage).

## Hệ quả

- Có hai chỗ mô tả cùng một shape cho tới khi spec đầy đủ — chi phí đã biết,
  đổi lại lỗi contract lộ ra sớm và có thông điệp đọc được.
- Trường tuỳ chọn dùng `nullish()`: backend thiếu field thì ô hiển thị "—" chứ
  không làm trắng màn hình.
