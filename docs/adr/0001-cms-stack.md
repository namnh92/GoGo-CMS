# ADR-0001: Stack và cấu trúc của GoGo-CMS

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-08-27
- **Phạm vi:** GoGo-CMS (CMS-001)

## Bối cảnh

CMS là ứng dụng nội bộ, client thuần trên `/v1/cms/*` của GoGo-BE. Yêu cầu
khác app consumer: mật độ dữ liệu cao, bảng lớn, thao tác bàn phím, phát hành
độc lập theo backend chứ không theo chu kỳ store.

## Quyết định

| Mối quan tâm | Lựa chọn                              | Lý do                                                                 |
| ------------ | ------------------------------------- | --------------------------------------------------------------------- |
| Build        | Vite 6 + React 19 + TS strict         | Nhanh, cùng hệ với GoGo-WebApp                                        |
| Server state | TanStack Query                        | Cache, invalidate, polling job import                                 |
| Data grid    | TanStack Table                        | Sort/selection headless, không áp style                               |
| Form         | react-hook-form + zod (`zodResolver`) | Một schema cho cả form và boundary                                    |
| Routing      | react-router-dom 7                    | Route file mỏng, `lazy()` theo màn                                    |
| Style        | Tailwind v4 + `@theme` token          | Token là CSS variable, đồng bộ với mobile                             |
| Client state | React context (session, i18n, toast)  | Ít state client; không cần store riêng                                |
| Mock         | MSW                                   | Chạy toàn bộ CMS không cần backend, dùng lại cho Vitest và Playwright |

Không dùng thư viện component dựng sẵn: bề mặt CMS đủ hẹp và yêu cầu a11y đủ
cụ thể để tự sở hữu primitive rẻ hơn là uốn một design system bên ngoài.

## Hệ quả

- Mọi màn theo `{screen}.view.tsx` + `{screen}.style.tsx` (`core.md` §13).
- MSW là một phần của sản phẩm dev, không phải đồ chơi: fixture phản ánh đúng
  contract, kể cả nhánh lỗi (`MFA_REQUIRED`, `SELF_APPROVAL`,
  `CANDIDATE_NOT_LISTED`, `paused_provider_quota`).
- Thêm thư viện thay thế cho một trong các mục trên cần ADR mới.
