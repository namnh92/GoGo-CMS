# ADR-0002: Validate response bằng zod ở boundary

- **Trạng thái:** Chấp nhận (tạm thời — có điều kiện gỡ bỏ)
- **Ngày:** 2026-08-27
- **Phạm vi:** GoGo-CMS

## Bối cảnh

Quy tắc workspace: _API client là generated code, không viết tay DTO_. Client
được sinh từ `openapi/gogo.v1.yaml` bằng `openapi-typescript`.

Tuy nhiên, phần lớn endpoint `/v1/cms/*` trong spec hiện chỉ mô tả response
bằng `description` dạng văn xuôi, không có `schema`:

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
3. Các schema zod này **mirror spec một-một** và phải cập nhật cùng lúc khi
   contract đổi. Chúng không phải nguồn sự thật — spec mới là.
4. `pnpm api:check` chặn CI khi spec vendored lệch version hoặc khi
   `schema.d.ts` cũ so với spec.

## Điều kiện gỡ bỏ

Khi GoGo-BE bổ sung `schema` cho response của các endpoint CMS, thay
`apiFetchParsed` bằng type generated và xoá schema zod tương ứng. Zod vẫn giữ
lại cho các boundary không do OpenAPI mô tả (deep-link param, storage).

## Hệ quả

- Có hai chỗ mô tả cùng một shape cho tới khi spec đầy đủ — chi phí đã biết,
  đổi lại lỗi contract lộ ra sớm và có thông điệp đọc được.
- Trường tuỳ chọn dùng `nullish()`: backend thiếu field thì ô hiển thị "—" chứ
  không làm trắng màn hình.
