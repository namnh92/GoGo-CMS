# ADR-0004: Một bộ điều phối phiên, thế hệ xác thực gắn vào từng request

- **Trạng thái:** Chấp nhận (quyết định thiết kế, chưa triển khai)
- **Ngày:** 2026-10-01
- **Phạm vi:** GoGo-CMS · không đổi mô hình token của GoGo-BE
- **Quyết định bởi:** vai SA (Astra) theo execution-policy §2, sau khi vai build
  dừng vá ở vòng review thứ hai của cùng một họ lỗi

## Bối cảnh

Hai PR đã merge bịt được hai lỗ thật: [#217](https://github.com/namnh92/GoGo-CMS/pull/217)
cho đăng xuất và idle timeout gọi `POST /cms/auth/logout` (chính nó mới denylist
session id và xoá cookie HttpOnly), và [#218](https://github.com/namnh92/GoGo-CMS/pull/218)
đưa nghĩa vụ đổi mật khẩu tạm vào state phiên rồi chặn ở route guard.

Năm finding nổi lên qua các vòng review của hai PR đó, và **tất cả chỉ ra cùng
một thứ còn thiếu** chứ không phải năm chỗ cần vá:

1. Một request thuộc phiên A trả 401 sau khi B đã đăng nhập, listener hết phiên
   xoá nhầm B.
2. Revoke hỏng chỉ được nhớ trong `localStorage`; đóng tab giữa chừng là mất
   cảnh báo, trong khi cookie và refresh family vẫn sống.
3. `refreshSession()` coi lỗi tạm thời (429, 5xx, mất mạng) là hết phiên, nên
   client xoá sạch còn refresh family vẫn sống và không ai thu hồi.
4. Epoch thêm ở #218 là biến cục bộ của module, nên một lần đổi mật khẩu xong ở
   tab này không biết tab kia vừa đăng nhập.
5. Sự kiện 403 `PASSWORD_CHANGE_REQUIRED` không mang thế hệ phiên, nên một 403
   cũ về muộn có thể gán nghĩa vụ cho phiên khác.

Vá từng cái sẽ đẻ ra cái thứ sáu. Quy tắc §6 "một finding trượt lần sửa thứ hai
thì dừng vá, đẩy lên SA" đã chạm, nên câu hỏi hình dạng được giao cho vai SA.

## Quyết định

Một **bộ điều phối phiên** (session coordinator) sở hữu vòng đời phiên, thay cho
state rải rác trong `session.tsx` và `client.ts` hiện nay. Nó giữ một **thế hệ
xác thực đơn điệu tăng**, bền qua reload, và mọi request mang theo thế hệ lúc
được gửi đi; mọi kết quả và mọi sự kiện ảnh hưởng tới phiên được so lại với thế
hệ hiện hành trước khi được áp dụng.

**Primitive và nơi ở**

- Chuyển trạng thái vòng đời: bắt đầu login/logout thì vô hiệu hoá việc thường
  đang chạy; snapshot phiên mới chỉ công bố **sau khi** login thành công. Đổi
  mật khẩu thành công thì tăng thế hệ và xoá nghĩa vụ trong cùng một bước.
  Refresh **giữ nguyên** thế hệ vì nó tiếp tục chính phiên đó. Logout giữ một
  định danh thao tác và thế hệ đích riêng, sống lâu hơn phiên nhìn thấy được;
  khi nó hoàn tất thì chỉ cập nhật trạng thái của đúng thao tác ấy.
- Phân loại kết quả refresh: thay `Promise<boolean>` bằng ba kết cục tường
  minh — **thành công**, **từ chối có thẩm quyền**, **không khả dụng/không rõ**.
  Việc phân loại thuộc về `refreshSession`, dựa trên HTTP status và error
  envelope đã có. Lỗi mạng, 429 và 5xx cho ra trạng thái suy giảm, **giữ** phiên
  và nghĩa vụ, cho phép retry có giới hạn. Chỉ lỗi xác thực mà hợp đồng định
  nghĩa mới biện minh được cho việc kết luận hết phiên. `retryable: false`, một
  403 chung chung, lỗi CSRF, hay một 401 không giải thích được **đều không phải
  bằng chứng** rằng refresh family đã chết.
- Cảnh báo revoke: ghi trạng thái "đang chờ" **trước** khi gửi request logout.
  Chỉ xoá khi có bằng chứng xác nhận đúng thao tác đó đã thu hồi; **một lần đăng
  nhập mới không bao giờ xoá cảnh báo cũ**. Sau khi credential bị thay, giữ lại
  cảnh báo lịch sử chưa giải quyết và không gửi logout cũ bằng cookie mới.
- Quyền sở hữu idle: giữ nguyên 30 phút và cảnh báo 2 phút, nhưng gắn hạn chót
  hoạt động dùng chung vào thế hệ. Tab nào cũng ghi được hoạt động; lúc hết hạn
  thì đọc lại hạn chót và thế hệ trước khi revoke. Reload và refresh **không**
  được đặt lại hạn chót.

**Đồng bộ nhiều tab:** `localStorage` + sự kiện `storage`, với Web Locks để tuần
tự hoá login / refresh / logout / đổi mật khẩu. Lưu bền vốn đã cần cho việc khôi
phục sau reload và cho cảnh báo logout, nên nó không phải chi phí thêm. Tab ghi
tự cập nhật subscriber của mình; tab khác nhận thông báo rồi **đọc lại toàn bộ
bản ghi**. Coi thông báo là lời nhắc đọc lại, không phải lệnh có thứ tự; đọc lại
cả lúc khởi động, lúc focus trở lại, lúc gửi request và lúc nhận kết quả vòng
đời. `counter++` trong `localStorage` mà không khoá là không an toàn.

## Hệ quả

**Phạm vi chạm:** một file điều phối mới và bảy file sẵn có — `client.ts`
(ngữ cảnh request, phân loại refresh, chống phát lại, sự kiện có dấu thế hệ),
`session.tsx`, `token.ts`, `RequireAuth.tsx`, `useChangeOwnPassword.ts`,
`login.view.tsx`, `changePassword.view.tsx`. **Mọi call site gọi API thường
không phải đổi chữ ký.** Phần tích hợp query cache cũng phải xoá hoặc phân vùng
dữ liệu thuộc phiên khi phiên bị thay.

**Thứ tự triển khai:** phân loại refresh trước, rồi dựng bộ điều phối ở trạng
thái chưa kích hoạt, rồi bật đồng bộ. Nhưng **gắn dấu request, so sánh sự kiện,
tuần tự hoá vòng đời và đồng bộ nhiều tab phải bật cùng lúc** — không bật lẻ
từng tab.

**Chuyển đổi:** một lần cutover có chủ ý cho console nhân viên — đóng hoặc tải
lại mọi tab cũ, thu hồi credential đang có qua endpoint logout, rồi đăng nhập
lại dưới bộ điều phối mới. Một bundle cũ đang chạy không thể bị ép tuân theo
giao thức khoá và thế hệ mới. Không được lặng lẽ coi hint cũ là phiên đã xác
minh, cũng không mặc định nghĩa vụ chưa biết là đã hoàn thành.

## Phương án bị loại

- **Epoch cục bộ của module, hoặc biến đếm dùng chung không khoá** — bỏ sót việc
  thay phiên ở tab khác, hoặc mất lần tăng khi có tranh chấp.
- **Chỉ tăng thế hệ khi login/logout** — vẫn cho một 403 cũ khôi phục nghĩa vụ
  sau khi đổi mật khẩu thành công.
- **Chỉ lọc ở chiều response** — vẫn để request cũ refresh hoặc phát lại bằng
  credential mới.
- **Coi mọi lỗi refresh là hết phiên** — lẫn lộn "dịch vụ không khả dụng" với
  "xác thực hỏng", và để credential còn sống bị giấu đi.
- **Hàng đợi revoke tự động, lưu bền** — không biện minh được ở đây: logout xác
  thực bằng cookie nên nó nhắm vào credential hiện tại; khi B đã thay A thì
  client không thể phát lại logout của A một cách an toàn.
- **`BroadcastChannel`** — vẫn cần một snapshot bền và giao thức khôi phục, tức
  là thêm cơ chế thứ hai mà không bỏ được cơ chế thứ nhất.
- **Hỏi lại server lúc focus** — request chạy nền hoàn tất trước khi focus, và
  việc hỏi lại không nhận dạng được phiên nào đã phát ra response cũ.
- **"Đăng nhập rồi đăng xuất lại" coi như xác nhận** — có thể thu hồi đúng phiên
  vừa lập, và không chứng minh được phiên bị bỏ rơi đã bị thu hồi.

## Những thứ ADR này **không** sửa

- Logout hỏng vẫn có thể để refresh family cũ sống tới khi server hết hạn.
  Việc tự retry khi có mạng lại bị hoãn có chủ ý; chỉ phần **mất cảnh báo** được
  xử lý.
- Tắt trình duyệt, xoá storage, response đứt giữa chừng — không thể nguyên tử
  hoá cùng với việc server đã thực thi.
- Bỏ một response cũ **không** huỷ được thao tác mà API đã nhận, cũng không ngăn
  trình duyệt xử lý header cookie của nó.
- Thiết bị khác, origin khác, tab chạy bundle cũ, và phiên dev chỉ dùng bearer
  ở split-origin đều không tham gia giao thức same-origin này.
- Hết hạn idle do server cưỡng chế khi mọi tab đã đóng vẫn nằm ngoài tầm với của
  timer phía client.

## Rủi ro chính

Tin rằng thế hệ cục bộ **chứng minh** cookie đang đại diện phiên nào trên server.
Nó chỉ thiết lập **thứ tự** giữa các client hợp tác với nhau. Một thao tác vòng
đời bị đứt, hoặc một tab chạy bundle cũ, là đủ phá vỡ liên kết đó. Phần khôi
phục phải **giữ lại sự không chắc chắn** và tắt retry tự động cho thao tác cũ —
nếu không, thiết kế này có thể thu hồi phiên B trong khi báo rằng nó vừa sửa
xong phiên A.
