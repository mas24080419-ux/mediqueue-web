# MediQueue Premium Sidebar V3 — tích hợp chờ duyệt triển khai

Phạm vi: `mas24080419-ux/mediqueue-web`, Supabase `buolfdpdfnbmruecrtum` (MediQueue-Dev). Không thay đổi FloodGuard. Không cấp quyền cho người dùng, không xóa dữ liệu hoặc migration.

## Thiết kế và dữ liệu

- `premium-sidebar.css` và `dashboard.css` giữ nguyên từng byte từ ZIP được duyệt. Giữ sidebar ngọc, sidebar quản trị tím, gradient active, nhóm menu, collapse, drawer, avatar và reduced-motion.
- `premium-sidebar.js` được chuyển từ điều hướng demo thành module nhận profile/access/phân công do backend trả về. Bỏ role switcher, mã role/query/localStorage không được dùng cấp quyền.
- Giữ Auth email/mật khẩu hiện tại và RPC hàng chờ. Không đưa demo OTP hay dữ liệu xét nghiệm/thuốc/thanh toán mẫu vào hệ thống thật.
- Bệnh nhân: index.html. Nhân viên: staff.html. Hospital Super Admin: admin.html. URL trang HTML tĩnh luôn có thể tải được trên GitHub Pages; quyền dữ liệu/thao tác được kiểm tra tại PostgreSQL, không giả định HTTP 403 từ host tĩnh.
- Chỉ chọn giữa các phân công đang hiệu lực do Supabase trả về. Khoa/phòng/ca trực hiển thị từ phân công. Backend kiểm tra lại mọi lời gọi, kể cả khi sửa client.
- Dashboard chuyên môn dùng dữ liệu phiếu được RLS cho phép; tối đa 120 phiếu tải gần nhất, không tuyên bố là tổng lịch sử toàn khoa. Phân hệ chưa có API hiển thị chưa có dữ liệu.
- Quản trị toàn viện chỉ có báo cáo tổng hợp, không trả tên bệnh nhân. Các trang quản lý quyền/nhật ký chi tiết chỉ đọc số tổng hợp; CRUD quản trị chưa triển khai.

## Quyền

| Vai trò | Thao tác | Phạm vi |
|---|---|---|
| patient | cấp/đọc/hủy phiếu cá nhân | chính chủ |
| reception | đọc, check-in, chuyển phòng, khôi phục | khoa/phòng/ca được cấp |
| doctor | đọc, gọi, START/FINISH, bỏ lượt, gọi lại | phòng/ca được cấp |
| nurse | đọc hàng chờ | khoa/phòng/ca được cấp; chưa có hồ sơ điều dưỡng |
| laboratory/imaging/pharmacy/cashier | menu nhiệm vụ, trạng thái chưa triển khai | không được gọi API hàng chờ khám ngoài quyền |
| department_lead | điều phối, ưu tiên, tạm dừng, báo cáo/audit khoa | khoa/ca được cấp |
| Hospital Super Admin | báo cáo tổng hợp toàn viện | grant riêng + profile admin + email xác minh + AAL2 |

Backend vẫn dùng profile patient/staff/admin để tương thích; chức danh nằm trong `mq_staff_assignments`. Không tự chuyển admin thành superadmin. Tài khoản chưa có assignment hoặc hết ca nhận trạng thái chờ cấp phân công.

## Migrations Dev đã áp dụng

- `20261024161604_mediqueue_v3_assignment_scope`: thêm assignment, private admin grants, audit; kiểm tra phòng thuộc khoa; chỉ nhận staff đã xác minh; private permission helpers; RPC access/aggregate; guard 6 RPC hiện hữu.
- `20261024162206_mediqueue_v3_patient_owner_guard`: staff không kế thừa quyền đọc phiếu bệnh nhân cũ ngoài phân công.
- Không có assignment hoặc superadmin grant nào được giữ lại sau kiểm thử. Ca thử SQL dùng tài khoản Dev đã xác minh sẵn và ROLLBACK toàn bộ thay đổi role/phân công/phiếu.

## Bằng chứng kiểm thử

| Hạng mục | Kết quả hiện tại | Giới hạn |
|---|---|---|
| Syntax, patient/staff regression | PASS local | DOM host, không phải browser |
| Access matrix 8 chức danh, shift, multi-assignment, admin | PASS local | unit tests |
| Auth contract/callback/refresh-logout race | PASS local | mock Auth |
| Workflow check-in → gọi → START/FINISH | PASS Dev SQL | giao dịch ROLLBACK; không thay thế browser E2E |
| Reception không gọi số; doctor không check-in/restore | PASS Dev SQL | kiểm tra quyền hàm backend |
| Sai khoa/phòng, hết ca | PASS Dev SQL | PostgreSQL 42501 |
| Hai phòng có CALLED độc lập, chống hai lượt cùng phòng | PASS Dev SQL tuần tự | chưa chứng minh hai phiên gọi đồng thời |
| Recall, SKIP/RESTORE/cancel, audit | PASS Dev SQL | xem tests/backend-v3.sql |
| Cross-user RLS | PASS Dev SQL | authenticated UID không có ownership không đọc phiếu |
| Admin role không grant, grant thiếu MFA | PASS Dev SQL | bị từ chối |
| Admin grant + AAL2 | PASS Dev SQL | aggregate không patient_name; không tạo tài khoản MFA thực |
| Browser responsive 1440/1280/1024/768/390/360 | PASS CI: 68 kịch bản | 11 nhóm tài khoản × 6 viewport + multi-assignment + mock login; không phải live Auth |
| Authenticated browser E2E với Supabase thật | BLOCKED | chưa có patient session và staff/admin thử được cấp đúng quyền |
| GitHub Pages V3 | CHỜ PHÊ DUYỆT | chỉ branch/PR, chưa merge main hoặc publish V3 |

## Security Advisor

Không có ERROR trong lần kiểm tra sau migration. Còn WARN Leaked Password Protection Disabled và 4 INFO RLS enabled/no-policy: 2 bảng push hiện có + 2 bảng private (admin grants/audit) chủ ý không cấp quyền trực tiếp. Không thêm policy allow-all để làm biến mất cảnh báo.

- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Còn phải hoàn thành trước vận hành

1. Duyệt ảnh và thay đổi PR trước merge/deploy Pages.
2. Tài khoản thử của bệnh nhân, tiếp đón, hai bác sĩ và admin được chủ tài khoản xác minh/cấp quyền. Không bỏ qua email hoặc tự cấp superadmin.
3. Browser E2E live: confirmation email, login/logout/refresh, hai phiên độc lập, hai phòng đồng thời, API JWT trái quyền, thu hồi/hết ca khi đang mở.
4. Tích hợp MFA UI/enrollment và quản trị phân công có audit/re-auth trước khi cho admin vận hành từ website; hiện admin fail closed nếu phiên chưa AAL2.
5. Các phân hệ LIS/PACS/dược/BHYT, toàn lịch sử thống kê, quản lý ca và chỉnh sửa grant chưa có API/UI hoàn chỉnh. Không coi đây là HIS sản xuất.

## CI và ảnh kiểm chứng

- Mã tích hợp đã PASS: `caba8702f83f1152b796d393be98069cee19ae5d`.
- Workflow không triển khai: https://github.com/mas24080419-ux/mediqueue-web/actions/runs/40112419796
- Kết quả 68 PASS, 0 FAIL; artifact `v3-ui-evidence-mock` gồm ảnh 3 cổng ở 1440/390px và `results.json`.
- Kiểm thử có 6 viewport: 1440, 1280, 1024, 768, 390, 360. Không ghi nhận pageerror/tràn ngang trong các kịch bản đã chạy. Có kiểm tra drawer/Escape và collapse desktop.
- Lỗi bộ test đã sửa: locator accessibility không thể tìm nút collapse cố ý ẩn trên mobile; thay bằng kiểm tra DOM sidebar và tương tác drawer thật. Ảnh mobile cần chờ kết thúc chuyển động trước khi chụp.
- Lỗi tích hợp đã sửa: tiếp đón trước đây còn lọc theo profile.department_code cũ; nay dùng assignment hiện hành, có browser test chuyển bác sĩ GENERAL sang tiếp đón INTERNAL.
- Nhánh `integration/premium-sidebar-v3`, PR https://github.com/mas24080419-ux/mediqueue-web/pull/1 . Chưa merge main; GitHub Pages V3 chưa triển khai.
- Trạng thái tổng thể PARTIAL: còn E2E Supabase thật, tài khoản từng chức danh, MFA admin thực và kiểm thử hai phiên đồng thời.
