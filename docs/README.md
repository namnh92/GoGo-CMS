# docs/

Tài liệu thuộc riêng GoGo-CMS. Tài liệu sản phẩm và kiến trúc chung nằm ở
workspace GoGo (`GOGO_SRS.md`, `GOGO_IMPLEMENTATION_WBS.md`,
`GOGO_PLACE_INGESTION_SPEC.md`…).

- [`permissions.md`](permissions.md) — ma trận quyền và cách `RoleGate` map sang từng endpoint.
- [`ui-conventions.md`](ui-conventions.md) — token, cấu trúc màn, DataTable, form, drawer, trạng thái dùng chung.
- [`adr/0001-cms-stack.md`](adr/0001-cms-stack.md) — stack và cấu trúc thư mục.
- [`adr/0002-boundary-validation.md`](adr/0002-boundary-validation.md) — vì sao response đi qua zod trong khi client là generated code.
- [`adr/0005-bao-cao-loi-sentry.md`](adr/0005-bao-cao-loi-sentry.md) — báo cáo lỗi trình duyệt qua Sentry: chỉ lỗi, redaction, oracle ghim sha256.
