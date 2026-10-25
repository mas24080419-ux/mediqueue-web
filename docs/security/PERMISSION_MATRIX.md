# Ma trận quyền RBAC + ABAC — mục tiêu, không phải quyền đã triển khai đầy đủ

Mọi quyền nhân viên cần email xác minh + phiên còn hiệu lực + AAL2 + assignment hiện hành + facility/department/room đúng + task được cấp. Phạm vi bệnh nhân cần link verified, không bị revoke/hết hạn và có scope. Không có quyền theo tên nút/menu.

| Principal | Quyền nghiệp vụ | Phạm vi | Bị từ chối mặc định |
|---|---|---|---|
| Chưa đăng nhập | tài nguyên website công khai | không có danh sách phiếu/hồ sơ | patient/clinical/staff/admin API |
| Patient self | profile.read, queue.book/read/cancel theo link | hồ sơ chính mình đã xác minh | hồ sơ B; gọi số; tự sửa role |
| Đại diện hợp pháp | scope được duyệt, có thời hạn | đúng patient_record và căn cứ đại diện | tự liên kết qua PID; mở rộng scope; tự duyệt |
| Đại diện được ủy quyền | scope consent, hết hạn/revoke được | hồ sơ được chia sẻ | tất cả quyền không được ủy quyền |
| Reception | read/checkin/transfer/RESTORE được cấp | cơ sở/khoa/phòng/ca | call/START/FINISH; toàn bộ bệnh án |
| Doctor | read/call/START/FINISH/SKIP/recall được cấp | phòng/ca; clinical cần care-team riêng | checkin/RESTORE/cấp quyền; phòng khác |
| Nurse | read hàng chờ; nhiệm vụ điều dưỡng tương lai | khoa/phòng/ca | điều trị thay doctor; quyền admin |
| Laboratory | danh sách công việc xét nghiệm tương lai | order được giao, cơ sở/ca | queue.call; toàn bộ bệnh án |
| Imaging | công việc chẩn đoán hình ảnh tương lai | order được giao | kết quả khoa khác chưa được cấp |
| Pharmacy | cấp phát thuốc tương lai | prescription/task được giao | thay đổi chỉ định; hồ sơ toàn viện |
| Cashier | thu phí/thanh toán tương lai | invoice/task được giao; dữ liệu tối thiểu | clinical.read và hồ sơ không liên quan |
| Department lead | pause/PRIORITY/transfer/audit/report khoa theo task | khoa quản lý/ca hiệu lực | Hospital Super Admin; clinical toàn viện; tự cấp quyền |
| Hospital Super Admin | cấu hình/phân công và aggregate vận hành toàn viện theo grant | control plane trong viện được cấp | clinical.read mặc định; tự phê duyệt; DB superuser |
| Người xác minh hồ sơ (vai trò mục tiêu riêng) | review link/evidence | ca/phạm vi và vụ việc được giao; MFA/re-auth | tự duyệt link; mặc nhiên xem bệnh án |
| Security auditor (mục tiêu riêng) | log đã giảm định danh | phạm vi điều tra được duyệt | sửa log; khám bệnh; cấp grant |

Hiện có 8 chức danh trong DB; reviewer/security auditor là đề xuất, **chưa thêm vào enum/check hoặc cấp cho ai**. Foundation chỉ có dashboard count cho 4 chức danh có queue.read (reception/doctor/nurse/department_lead). Lab/imaging/pharmacy/cashier có contract tương lai, chưa có API nhiệm vụ thật. Link scope queue.* chưa nối vào API hàng chờ cũ.

Ranh giới nhất thiết tách: chức danh trưởng khoa ≠ Super Admin; Super Admin ≠ quyền bệnh án. Có thể một người có hai assignment nhưng mỗi request phải bind đúng assignment, không suy diễn role bao trùm.
