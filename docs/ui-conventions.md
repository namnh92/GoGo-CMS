# Quy ước UI của GoGo-CMS

Mục tiêu: **mật độ dữ liệu và tốc độ thao tác**, không phải cảm xúc. Cùng bộ
token thương hiệu với app consumer, khác bề mặt.

## Token và màu

- Token nằm ở `src/styles/tokens.css`. Giá trị mirror
  `GoGo-MobileApp/src/shared/ui/tokens.ts` để màu thương hiệu giống hệt nhau
  trên mobile, web và CMS.
- **Không có literal màu (hex hoặc rgba) ngoài file token.** ESLint chặn hex
  literal trong `.ts/.tsx`.
- Logo: `LogoMark` trong `src/shared/ui/icons.tsx` — cùng hình học với splash
  của mobile (hai đĩa coral chồng nhau, thấu kính trắng ở giữa).
- Glass/blur chỉ dùng ở `Drawer` và `Modal`. Bảng, form và nền trang luôn đục.

## Cấu trúc màn hình

Theo `.claude/rules/core.md` §13:

```
src/features/<feature>/<screen>.view.tsx    // component, không chứa class dài
src/features/<feature>/<screen>.style.tsx   // export `styles` (chuỗi class)
```

`src/app/routes.tsx` chỉ trỏ tới `.view`, không chứa logic.

## Trạng thái bắt buộc

Mọi màn async đi qua `AsyncBoundary` để không màn nào "quên" một nhánh:

| Trạng thái        | Component                            | Ghi chú                                             |
| ----------------- | ------------------------------------ | --------------------------------------------------- |
| loading           | `LoadingState` / `TableSkeleton`     | `role="status"`, `aria-live="polite"`               |
| empty             | `EmptyState`                         | phân biệt "chưa có dữ liệu" với "bộ lọc không khớp" |
| error             | `ErrorState`                         | hiện mã lỗi đã dịch + `request_id`                  |
| permission-denied | `PermissionDeniedState`              | tự động khi `403`                                   |
| offline/degraded  | `OfflineState` + banner ở `AppShell` | CTA ghi bị khoá                                     |

CTA: mọi `Button` có `loading` (đặt `aria-busy`) và `disabled`.

## Bảng dữ liệu

- `DataTable` bọc TanStack Table: header dính, `aria-sort`, hàng bấm được bằng
  `Enter`/`Space`, tone hàng theo mức độ (không chỉ bằng màu).
- Chọn nhiều → `BulkActionBar` nổi ở đáy, kèm nút bỏ chọn.
- Phân trang bằng cursor/offset qua `Pagination`; tổng số đọc được cho screen
  reader qua vùng `aria-live`.

## Chọn từ danh mục do máy chủ sở hữu

`Combobox` (`src/shared/ui/Combobox.tsx`) là lựa chọn đơn có tìm kiếm trên một
danh mục **được fetch**. `<Select>` không làm được việc này: danh sách đến từ
mạng nên tự nó có bốn trạng thái, và một `<select>` không có chỗ nào để nói ra
chúng.

- Bốn trạng thái phải phân biệt được bằng lời: `pending`, `success` (kể cả
  "danh mục rỗng" và "không khớp truy vấn" — hai câu khác nhau), `error` (kèm
  `Thử lại`) và `denied` (**không** có nút thử lại: 403 không phải lỗi để bấm
  lại).
- Lưu **stable key**, tìm theo nhãn tiếng Việt. Nhãn hiển thị do phía gọi
  resolve, vì chỉ phía gọi biết một khoá không tra được là đã ngừng hay là
  ngoài danh mục.
- **Giá trị bản ghi đang giữ luôn hiển thị được**, kể cả khi danh mục không còn
  liệt kê nó. Mất giá trị của chính bản ghi trong bộ chọn dựng ra để hiện nó là
  lỗi nặng nhất của loại control này.
- Bàn phím: Lên/Xuống/Home/End/Enter/Escape, `aria-activedescendant`,
  `role="combobox"` + popup `role="listbox"`; lựa chọn kèm dấu ✓ chứ không chỉ
  bằng màu.

Ví dụ đang dùng: `AreaCombobox` (`src/features/places/areaCombobox.tsx`) trên
`GET /cms/areas`, dùng chung cho editor địa điểm và bộ lọc danh sách — một từ
vựng, một danh sách khoá.

## Xác nhận hành động phá huỷ

`ConfirmDialog` **bắt buộc** nhận danh sách `changes`. Một dialog "Bạn có chắc
không?" trống là bug. Ba nơi dùng: gộp địa điểm, xuất bản lô import, quay lui
ranking config.

## Accessibility

- WCAG 2.2 AA trên mọi luồng chính; màu không bao giờ là tín hiệu duy nhất
  (`StatusBadge` luôn kèm icon/shape).
- Touch target ≥ 44×44 kể cả ở layout dày.
- `Drawer`/`Modal`: focus trap, `Escape` để đóng, trả focus về nơi mở.
- Skip link là tab stop đầu tiên của shell.
- Motion 140–320ms, tôn trọng `prefers-reduced-motion`.

## i18n và định dạng

- vi là catalogue nguồn (`src/shared/i18n/vi.ts`), en là phụ và fallback về vi
  theo từng khoá.
- Tiền là **integer minor units** + currency; chỉ format ở lớp hiển thị
  (`src/shared/format`). VND là zero-decimal.
- Giờ mở cửa đi qua dây dưới dạng phút-từ-nửa-đêm; `dayOfWeek` 0 = Chủ nhật.
- Taxonomy luôn là stable key; nhãn resolve từ API + i18n, không lưu nhãn trong
  dữ liệu nghiệp vụ.
