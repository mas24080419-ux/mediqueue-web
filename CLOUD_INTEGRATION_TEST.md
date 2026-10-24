# MediQueue-Dev — Hướng dẫn kiểm thử website kết nối Supabase

**Trạng thái (24/10/2026):** Mã web được kết nối với project **MediQueue-Dev** trên Supabase bằng `config.js` (publishable key công khai). Không dùng `service_role` trong trình duyệt. Đây chỉ là **môi trường thử nghiệm**; không nhập thông tin bệnh nhân thật.

- Web: https://mas24080419-ux.github.io/mediqueue-web/
- Repository: https://github.com/mas24080419-ux/mediqueue-web
- Supabase Dashboard: https://supabase.com/dashboard/project/buolfdpdfnbmruecrtum
- GitHub Actions: https://github.com/mas24080419-ux/mediqueue-web/actions

## Trước khi tạo tài khoản

Trong Supabase, vào **Authentication → URL Configuration**:
- **Site URL:** `https://mas24080419-ux.github.io/mediqueue-web/`
- **Redirect URLs:** thêm chính xác cùng URL trên (nếu cần cho email xác minh/đăng nhập).
- Giữ xác minh email bật để phòng đăng ký tài khoản giả; cấu hình SMTP nếu nhà cung cấp email mặc định bị giới hạn.
- Không dùng email, CCCD, hồ sơ, số điện thoại hoặc thông tin khám bệnh thật trong thử nghiệm.

Cài đặt Auth Site URL là bước thủ công trong Dashboard vì kết nối Supabase hiện có không hỗ trợ sửa cài đặt Auth.

## Tạo tài khoản thử

1. Mở trang web → **Tài khoản** → **Đăng ký**. Tạo **bệnh nhân thử** bằng email do bạn kiểm soát (dữ liệu giả).
2. Xác minh email (nếu được yêu cầu), sau đó **Đăng nhập**.
3. Tạo **nhân viên thử** thứ hai bằng email khác, xác minh và đăng nhập ít nhất một lần để profile xuất hiện.
4. Vào Supabase **Authentication → Users** để xác nhận tài khoản nhân viên đã tồn tại.
5. Chỉ quản trị viên dự án chạy câu SQL bên dưới trong **SQL Editor** (thay email bằng email thử, không dán mật khẩu):

```sql
UPDATE public.mq_profiles
SET role = 'staff', department_code = 'GENERAL'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'staff-test@example.com'
)
RETURNING id, role, department_code;
```

Kết quả phải có **1 dòng**. Nếu 0 dòng, kiểm tra user đã tạo và profile trigger. Không dùng quyền `admin` nếu không thực sự cần.

Để thử khoa khác, dùng `INTERNAL` hoặc `PEDIATRICS` nếu vai trò tương ứng. Tài khoản nhân viên không tự nâng quyền từ giao diện.

## Kịch bản chấp nhận (2 cửa sổ trình duyệt)

Sử dụng hai cửa sổ độc lập/ẩn danh để tách phiên. Trong chế độ **CLOUD**:

1. **Bệnh nhân (cửa sổ A):** đăng nhập → Lấy số khám → chọn **Khám tổng quát** → nhập **Tên giả** → nhận phiếu ở mục **Phiếu của tôi**. Chờ xác nhận số và mã check-in.
2. **Tiếp đón (cửa sổ B):** đăng nhập tài khoản `staff` có `department_code='GENERAL'` → mục **Tiếp đón** → nhập **mã check-in** do bệnh nhân A cung cấp → xác nhận phân phòng. Kiểm tra phòng đã xuất hiện trong phiếu A sau làm mới (tối đa 15 giây khi tab đang mở).
3. **Nhân viên/bác sĩ (cửa sổ B):** mục **Điều phối phòng** → chọn **phòng đã phân** → Gọi lượt tiếp theo → chọn phiếu → Bắt đầu khám → Hoàn tất khám.
4. **Bệnh nhân A:** sau cập nhật, phiếu chuyển qua `WAITING → CALLED → SERVING → COMPLETED`.
5. **Bảo mật:** bệnh nhân thử thứ hai không xem được phiếu A; tài khoản bệnh nhân không thể gọi lượt, check-in, chuyển phòng hoặc cấp quyền nhân viên cho mình.
6. **Đồng thời:** hai nhân viên khác nhau thử gọi ở hai phòng cùng khoa; chỉ được phép tối đa một lượt `CALLED/SERVING` mỗi phòng.

## Đã kiểm chứng, chưa kiểm chứng

- **Đạt:** migration đang hiện diện; RLS trên các bảng; API RPC có mặt; SQL transaction tích hợp với tài khoản giả cấp số → check-in → gọi → START → FINISH, có `ROLLBACK`; GitHub Actions kiểm tra JS và test mock.
- **Chưa đạt xác nhận E2E thật:** thao tác đăng nhập có email xác minh trên website đã deploy; 2 trình duyệt/thiết bị truy cập Cloud đồng thời; Realtime WebSocket và thông báo Firebase (website hiện tải dữ liệu 15 giây một lần).
- Các test SQL có `ROLLBACK`, không chứng minh cơ chế xác minh email hoặc tương thích thực tế của thiết bị.

## Nguyên tắc an toàn

- Không đặt mật khẩu, khóa `service_role`, JWT cá nhân hoặc khóa FCM trong GitHub.
- `config.js` chỉ chứa **publishable key** cho MediQueue-Dev; RLS và quyền RPC vẫn do PostgreSQL kiểm tra.
- Chỉ sử dụng dữ liệu thử; không coi GitHub Pages là nơi lưu bệnh án hoặc nền tảng HIS sản xuất.
- Nếu cần đưa vào sử dụng thật: phải hoàn tất kiểm thử bảo mật, audit logging, sao lưu, quy trình tài khoản, phân quyền đa cơ sở và kiểm thử tích hợp HIS theo quy định.
