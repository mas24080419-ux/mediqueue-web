# API contracts — RBAC + ABAC proposal v2

**Chưa deploy.** Hai RPC mới chỉ được định nghĩa trong migration và chạy kiểm thử cục bộ. Base dự kiến: `https://buolfdpdfnbmruecrtum.supabase.co/rest/v1/rpc/`. Dùng publishable/anon key công khai + Bearer access token được Auth xác minh; tuyệt đối không service_role trong client. Mỗi lời gọi mới tự kiểm tra principal/session, không nhận user_id hoặc role do client gửi.

## RPC có SQL trong foundation

| RPC | Request JSON | Quyền | Dữ liệu trả |
|---|---|---|---|
| mq_patient_profiles_v2 | `{}` | session/email hợp lệ; mỗi record có link profile.read đang hiệu lực | array patient_record_id, label, relationship, scopes, valid_to; không evidence/OTP/CCCD |
| mq_dashboard_v2 | `{"p_assignment":"uuid"}` | đúng assignment của actor; AAL2, live session, scope/task read | counts WAITING/CALLED/SERVING/COMPLETED hôm nay tại khoa/phòng assignment; không tên/QR/bệnh án |

Thành công: `{"ok":true,"version":2,"request_id":"uuid","data":...}`. Dashboard còn có assignment_id, job_title, facility_id, department_code, room_id, valid_until. data là `{waiting,called,serving,completed}`. Profile data là array; không có link hợp lệ trả `[]`, không tự sinh hồ sơ giả.

Bị từ chối trong hàm: `{"ok":false,"code":"ACCESS_DENIED","request_id":"uuid"}`. Được trả HTTP 200 bởi PostgREST vì cần commit audit; client **bắt buộc** xử lý ok=false như từ chối, không success toast. Không tiết lộ assignment tồn tại/thuộc ai. Gateway thiếu/sai/expired JWT hoặc thiếu EXECUTE có thể trả HTTP 401/403 trước khi chạy RPC, không có request_id của DB. Invalid UUID -> HTTP 400; lỗi DB bất ngờ -> lỗi chuẩn PostgREST, không trả nội dung bệnh nhân trong error. Backend/BFF tương lai có thể map business deny sang HTTP 403 sau khi giữ audit riêng.

Không dùng dashboard JSON/capability như token cấp quyền cho API kế tiếp. Mỗi thao tác hàng chờ vẫn kiểm tra server. Cache-Control no-store cần BFF/gateway; SQL RPC không tự đặt HTTP header này trong foundation. Frontend phải xóa cache theo account/context và tải lại khi hết valid_until. Không coi đếm tổng là trạng thái giao dịch để gọi tiếp.

### Dashboard theo chức danh

| Chức danh | Contract hiện có trong đề xuất | Contract tiếp theo (chưa triển khai) |
|---|---|---|
| Patient/đại diện | mq_patient_profiles_v2 | linked queues, book/cancel với patient_record_id |
| Reception | mq_dashboard_v2 + RPC checkin/assign/restore hiện hữu | danh sách tiếp đón phân trang, DTO ít định danh, V2 guard |
| Doctor | mq_dashboard_v2 + call/change/recall hiện hữu | queue list theo phòng, encounter/care-team riêng |
| Nurse | mq_dashboard_v2 count | nursing.tasks với task_id, encounter_id, minimal display |
| Laboratory | bị từ chối queue dashboard | laboratory.tasks: order được phân công, status, due_at; không full chart |
| Imaging | bị từ chối queue dashboard | imaging.tasks theo order/ca |
| Pharmacy | bị từ chối queue dashboard | pharmacy.dispense.tasks theo prescription |
| Cashier | bị từ chối queue dashboard | billing.tasks theo invoice; không chẩn đoán không cần thiết |
| Department lead | mq_dashboard_v2; audit khoa hiện có | department.overview có aggregate/audit theo khoa |
| Hospital Super Admin | mq_hospital_overview hiện hữu, grant + AAL2 | admin.operations.v2: live session, time-bound grant; admin.assignments proposer/approver/re-auth |

Các contract tương lai là thiết kế, không endpoint tồn tại, không mock dữ liệu như thật. Khi triển khai cần cursor/limit<=100, filter server, field allow-list, conflict 409 và idempotency cho thao tác ghi, rate-limit theo principal/challenge. Nếu chưa có phân hệ: trả NOT_IMPLEMENTED/501 từ BFF thay vì dữ liệu minh họa.

## API hàng chờ giữ nguyên

`mq_issue_ticket(p_department text,p_name text,p_request_key uuid)`; `mq_checkin_qr(p_nonce uuid)`; `mq_assign_room(p_ticket_id bigint,p_room_id text)`; `mq_call_next_room(p_room_id text)`; `mq_change_ticket(p_ticket_id bigint,p_action text,p_priority boolean)`; `mq_recall_ticket(p_ticket_id bigint)`; `mq_cancel_my_ticket(p_ticket_id bigint)`; `mq_my_wait_info(p_ticket_id bigint)`.

Không sửa chữ ký/queue algorithm trong foundation. `mq_call_next(p_department)` hiện từ chối và yêu cầu API theo phòng, không khôi phục API gọi theo khoa. Owner patch giữ kiểu trả về và chỉ bổ sung từ chối staff/admin ở hai patient RPC, SQLSTATE 42501.

## Contracts xác minh link — thiết kế, chưa có SQL/API

- Request link: nhận patient locator từ kênh riêng, relationship, requested_scopes; trả trạng thái chung để chống dò, không trả patient name/OTP hay xác nhận PID tồn tại.
- Verify challenge: token challenge ngắn hạn, một lần, hash server, max attempts; bind actor + record + relationship + scope + purpose + expiry. OTP gửi đến kênh đã đăng ký, không số client mới nhập.
- Reviewer approve: riêng với requester, MFA + re-auth, kiểm tra evidence/legal authority; transaction đặt verified_by/at/evidence_ref và scope/time. Super Admin không tự nhiên là reviewer.
- Revoke: actor có quyền hoặc reviewer được phân công; revoke mọi API/read/push theo link từ statement kế tiếp, audit lý do không PHI.

Không dùng API direct-table INSERT/UPDATE để tự xác minh link. Foundation REVOKE toàn bộ authenticated/anon trên bảng patient/link/task/audit. Trusted DB owner vẫn có thể thay đổi dữ liệu: đó là ranh giới vận hành cần audit và quy trình hai người, không phải API cho client.
