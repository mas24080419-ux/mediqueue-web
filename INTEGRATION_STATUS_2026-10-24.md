# MediQueue-Dev · Trạng thái tích hợp 24/10/2026

**Môi trường:** DEV, dữ liệu giả; chưa đủ điều kiện đưa thông tin người bệnh thật vào hệ thống.

## Đã hoàn thành tự động

- GitHub Pages public được kết nối đến MediQueue-Dev qua publishable key trong `config.js`. Không có khóa quản trị ở frontend.
- Website có đăng ký/đăng nhập Supabase Auth qua REST, làm mới access token và đăng xuất.
- Khi đăng ký, website yêu cầu `redirect_to` quay lại URL GitHub Pages.
- Khi email xác minh đưa về token qua URL fragment, website gọi `/auth/v1/user` để kiểm tra token, sau đó xóa fragment khỏi URL và mở phiên đăng nhập.
- Quyền bệnh nhân/nhân viên và phạm vi dữ liệu kiểm tra bằng PostgreSQL RLS cùng server-side RPC.
- CI kiểm tra demo UI, API mock, email callback và **live anonymous access**. Kết quả 24/10/2026: **PASS**.
- Kết quả Supabase REST khi chưa đăng nhập: `mq_tickets` GET HTTP 401, `mq_issue_ticket` POST HTTP 401, `mq_call_next_room` POST HTTP 401.
- Kiểm thử PostgreSQL trong giao dịch ROLLBACK trước đây đã xác minh tạo phiếu, check-in, gọi phòng, bắt đầu và hoàn tất, có phân quyền.

## Chưa thể tự động qua kết nối hiện tại

1. **GoTrue Site URL / Redirect URLs:** kết nối Supabase chỉ có database, API-key, migrations, Edge Functions, không có công cụ thay đổi Auth URL Configuration. Mở:
   https://supabase.com/dashboard/project/buolfdpdfnbmruecrtum/auth/url-configuration

   Thiết lập Site URL = `https://mas24080419-ux.github.io/mediqueue-web/` và trong Redirect URLs thêm đúng URL đó. Giữ email confirmation bật.

2. **Hai người dùng thật:** hiện Auth vẫn chưa có tài khoản. Cần tạo hai tài khoản thử với email người dùng có thể nhận xác minh. Sau khi xác minh, cấp `role='staff'` cho tài khoản nhân viên bằng SQL Editor theo `CLOUD_INTEGRATION_TEST.md`. Không tự tạo/bỏ qua xác minh bằng tài khoản giả trực tiếp trong `auth.users`.

3. **Kiểm thử E2E web:** chưa có kết quả kiểm thử trực tiếp qua hai trình duyệt đã đăng nhập với hai email thực. Không gọi kết quả SQL transaction là E2E trình duyệt.

## Đường dẫn

- Website: https://mas24080419-ux.github.io/mediqueue-web/
- GitHub: https://github.com/mas24080419-ux/mediqueue-web
- Bộ test: `tests/smoke.mjs`, `tests/cloud-contract.mjs`, `tests/auth-callback.mjs`, `tests/live-anon.mjs`
- Báo cáo GitHub Actions: https://github.com/mas24080419-ux/mediqueue-web/actions

Không nhập thông tin bệnh nhân thật; không lưu mật khẩu hoặc khóa `service_role` vào mã nguồn, log, công cụ chat.
