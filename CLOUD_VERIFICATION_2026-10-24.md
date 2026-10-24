# MediQueue-Dev — kiểm chứng cloud ngày 24/10/2026

**Kết luận: PARTIAL. Chưa nghiệm thu E2E hoặc sử dụng với người bệnh thật.**

Phạm vi: chỉ repository `mas24080419-ux/mediqueue-web` và project `buolfdpdfnbmruecrtum` (MediQueue-Dev). Không thay đổi dự án FloodGuard. Không xóa dữ liệu/migration; không thay đổi schema trong phiên này.

## Đã thực hiện

- Đăng nhập Dashboard bằng luồng GitHub được người dùng chọn.
- Đổi Site URL từ localhost sang https://mas24080419-ux.github.io/mediqueue-web/ ; thêm chính xác URL này vào Redirect URLs. Dashboard báo lưu thành công và hiển thị Total URLs: 1.
- Xác nhận Email ENABLED, Confirm email ON, signup ON, anonymous sign-in OFF.
- Đọc trạng thái hiện tại: 1 Auth user đã xác minh; 1 profile patient; chưa có staff/admin thử.
- Sửa refresh token để sáu API song song dùng chung một yêu cầu refresh.
- Chặn phản hồi refresh đến muộn khôi phục phiên đã logout.
- Hiển thị lỗi đăng nhập tiếng Việt lâu dài, khóa nút và hiển thị đang xử lý trong lúc xác thực.
- Hiển thị cảnh báo khi đồng bộ lỗi; xóa dữ liệu phiên cũ khỏi UI khi phiên đã hết hạn.
- Bổ sung `tests/session-races.mjs` vào CI.

## Kết quả có bằng chứng

| Hạng mục | Trạng thái | Bằng chứng/phạm vi |
|---|---|---|
| Site URL / Redirect URL | PASS | Dashboard lưu thành công, đúng URL, 1 redirect |
| Email Auth và xác minh email | PASS cấu hình | Email ENABLED; Confirm email ON |
| Demo UI | PASS tự động | tests/smoke.mjs |
| Cloud API contract | PASS mock | tests/cloud-contract.mjs; không chứng minh login thật |
| Callback email | PASS mock / BLOCKED live | tests/auth-callback.mjs; chưa click email xác minh thực |
| Refresh token và logout race | PASS mock / BLOCKED live | tests/session-races.mjs; chưa có phiên hợp lệ |
| Anonymous API | PASS live | mq_tickets, mq_issue_ticket, mq_call_next_room trả HTTP 401 |
| RLS | PASS kiểm tra cấu trúc | 9/9 bảng public bật RLS; policy phiếu theo owner hoặc staff đúng khoa |
| Bệnh nhân gọi phòng / tự tăng quyền | PASS SQL | authenticated role với UID tài khoản đã xác minh; STAFF_ACCESS_DENIED và insufficient_privilege; ROLLBACK |
| Đăng nhập website | BLOCKED | Giao diện trả Invalid login credentials; chưa có phiên hợp lệ |
| A — đăng ký lấy số qua browser | BLOCKED | Cần tài khoản thử đăng nhập hợp lệ |
| B — check-in nhân viên | BLOCKED | Chưa có staff thử đã xác minh |
| C — gọi, bắt đầu, hoàn tất | BLOCKED | Phụ thuộc A/B |
| D — hai phòng đồng thời | BLOCKED live | Có unique index mq_one_active_per_room_day và khóa transaction; chưa thử hai phiên |
| E — ngoại lệ end-to-end | BLOCKED | Chưa có phiên bệnh nhân và staff |
| Bệnh nhân A/B và staff khác khoa | PARTIAL | Đã đọc RLS/RPC; chưa thử bằng hai người dùng thực |
| TV riêng tư | PASS mock | smoke test kiểm tra bảng gọi số không tên bệnh nhân |
| Desktop/mobile thực tế | PARTIAL | Website desktop tải được; chưa xác minh mobile sau thay đổi |
| Quét secret | PARTIAL | Không thấy secret-key/private-key pattern trong mã đã tải; chưa quét toàn lịch sử và toàn bộ logs |

Kiểm thử SQL kiểm tra quyền database, không phải xác thực GoTrue hay E2E browser. Không chèn tài khoản giả vào auth.users, không tắt email confirmation, không tự nâng quyền tài khoản hiện hữu.

## Security Advisor

- WARN: Leaked Password Protection Disabled. Chưa thay đổi; cần kiểm tra khả năng gói dịch vụ trước khi bật. [Tài liệu](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- INFO (2): mq_push_tokens và mq_push_outbox bật RLS nhưng không policy. Không tự thêm policy allow-all: cơ chế hiện tại dùng RPC/server; không phải bằng chứng dữ liệu bị công khai. [Tài liệu](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Không có ERROR trong kết quả Security Advisor của phiên.
- RPC công khai không cấp EXECUTE cho anon/PUBLIC; các thao tác nhân viên kiểm tra is_staff_for ở schema private.
- Audit hiện có CHECKIN_QR, CALL_ROOM, START, FINISH, SKIP, RESTORE, PRIORITY, RECALL, ASSIGN_ROOM, PATIENT_CANCEL; pause/resume ghi department_events. Chưa tuyên bố đầy đủ audit cho mọi hành vi.
- QR dùng nonce UUID, không cần tên/CCCD. Việc hiển thị nonce chỉ cho chủ phiếu/nhân viên; chưa có kiểm thử replay thực qua hai phiên.

## Cần tiếp tục

1. Người dùng đăng nhập tài khoản **MediQueue thử** hợp lệ trong Cloud Browser; tài khoản Dashboard Supabase/GitHub không thay thế tài khoản ứng dụng.
2. Tạo thêm tài khoản thử bằng email do người dùng kiểm soát và hoàn tất xác minh email. Hiện không có địa chỉ thử được chỉ định để tự đăng ký.
3. Sau xác minh, cấp staff GENERAL cho hai tài khoản thử được người dùng xác định. Không tự giả định role doctor/reception; backend hiện dùng patient/staff/admin.
4. Chạy A–E qua hai phiên độc lập; xác minh callback email, refresh/logout thật và quyền A/B, staff khác khoa.
5. Kiểm thử kết nối yếu, mobile, giới hạn SMTP, security/advisors, toàn lịch sử secrets trước vận hành.

## Triển khai và bằng chứng

Workflow: [.github/workflows/pages.yml](.github/workflows/pages.yml). Lần push chứa báo cáo này chạy lại toàn bộ kiểm thử và GitHub Pages. Kết quả CI và website sau triển khai phải được xác minh riêng; việc có file báo cáo không đồng nghĩa deployment thành công.

Website: https://mas24080419-ux.github.io/mediqueue-web/

