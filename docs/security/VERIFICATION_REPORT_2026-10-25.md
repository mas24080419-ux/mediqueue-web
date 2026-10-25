# Rà soát phân quyền MediQueue — 25/10/2026

**Tổng thể PARTIAL.** Đã rà soát trực tiếp GitHub/Supabase, đề xuất kiến trúc và chuẩn bị 2 migration có kiểm thử. Chưa áp dụng migration lên Dev, chưa merge hoặc triển khai website. Không đổi UI/UX V4, không thay FloodGuard, không dùng dữ liệu bệnh nhân thật.

## Kết quả và giới hạn bằng chứng

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Kiểm kê schema/RLS/RPC/grants/triggers/index | PASS | Catalog live Dev; 10 migration đã áp dụng; repo main f6381a3 |
| Truy cập chéo/anon/self-promotion trên Dev | PASS | 8 assertion SQL phủ định; UID giả không tồn tại; transaction ROLLBACK; không sửa tài khoản/dữ liệu |
| Baseline SQL + foundation + owner patch | PASS cục bộ | PGlite PostgreSQL 0.5.11; fixture schema-only; 70 assertion, 0 fail |
| Cơ sở/khoa/phòng/ca/task; AAL/session; link/đại diện | PASS cục bộ | synthetic identities/session claims; không chứng minh Supabase Auth thực |
| Đa assignment không mượn quyền dashboard | PASS cục bộ | selected assignment bind, negative cross-user |
| Patient A/B RLS với phiếu thực sự tồn tại trong fixture | PASS cục bộ | chính chủ thấy 1; B thấy 0; staff đổi role thấy 0 |
| RPC owner-role nhất quán với SELECT RLS hiện tại | FAIL hiện trạng | tái hiện local từ nội dung hàm catalog live: staff cũ vẫn wait/cancel phiếu mình; không có rò phiếu bệnh nhân B được chứng minh |
| Bản sửa owner role, patient regression | PASS cục bộ | 2 RPC từ chối staff bằng 42501; patient vẫn wait/cancel; chưa áp dụng Dev |
| Queue regression hiện hữu sau migration đề xuất | PASS cục bộ | issue/checkin/assign/two-room/call/recall/start/finish/skip/restore/cancel/audit/shift/cross-user trong transaction giả |
| Supervisor khác Super Admin; admin không clinical | PASS trong phạm vi cục bộ | admin không queue task; clinical.read không có quyền; không có bệnh án/care-team để test clinical record thực |
| API dashboard v2 | PARTIAL | profile links và queue counts có SQL tested; chuyên môn khác/admin provisioning mới là contracts |
| Enforcement RBAC+ABAC trên mọi RPC cũ | PARTIAL | foundation không thay can_task hoặc RLS/RPC legacy; cần cutover đồng bộ, không công bố đã hoàn thiện |
| Xác minh link OTP/đại diện thực | BLOCKED | chưa có pipeline evidence/reviewer/provider và danh tính test được xác minh |
| MFA enrollment/challenge/step-up và live sessions | BLOCKED | fixture claims chỉ thử nhánh SQL; chưa có test account nội bộ/MFA được chủ tài khoản xác minh |
| Hai phiên đồng thời/thu hồi giữa transaction/Realtime | BLOCKED | PostgreSQL local single connection không chứng minh concurrency hoặc realtime |
| Migration và E2E trên Supabase thật | BLOCKED chờ giai đoạn áp dụng được duyệt | Không tự apply DDL/deploy vì đây là review/đề xuất |

70 là số ca RBAC+ABAC cục bộ mới trong `security/rbac-abac/tests/evidence/rbac-abac-results.json`, không phải 68 browser test V3 trước đây. Hai ca “baseline gap reproduced” PASS nghĩa là tái hiện thành công lỗi, **không có nghĩa kiến trúc cũ đạt an toàn**. Các ca sau đó kiểm tra bản sửa từ chối đúng.

## Migrations bàn giao, chưa áp dụng

1. `20261025031642_mediqueue_rbac_abac_foundation.sql`: facility mapping, explicit assignment tasks, patient record/link, nullable ticket record FK, session+MFA+ABAC helpers, hai audited JSON RPC và private link audit. Không seed grant/backfill hồ sơ hay sửa queue engine.
2. `20261025031954_mediqueue_owner_rpc_role_guard.sql`: bổ sung check patient cho cancel_my_ticket/my_wait_info, giữ nguyên chữ ký và nghiệp vụ còn lại.

Tên file được tạo bằng Supabase CLI `migration new`, CLI 2.122.0. Không tự đặt version lịch sử hoặc chỉnh migration V3.

## Security Advisor live Dev

Lần kiểm tra 25/10/2026: **0 ERROR, 1 WARN, 4 INFO**.

- WARN: Leaked Password Protection Disabled. Cần cấu hình Auth phù hợp gói/quyền; không đổi settings trong đợt đề xuất này. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- INFO RLS/no-policy: mediqueue_private.assignment_audit, mediqueue_private.hospital_admin_grants, public.mq_push_outbox, public.mq_push_tokens. Private deny-direct-access có chủ đích; không thêm allow-all để xóa cảnh báo. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Public mq_* RPC live không cho anon EXECUTE, gồm cả mq_claim_push_batch. Catalog cho thấy batch server function là SECURITY DEFINER và cần bảo vệ server-only; test fixture không mô phỏng worker/FCM, không tuyên bố push E2E PASS.
- Lỗi owner-role xếp **Medium trong Dev**: liên quan phiếu lịch sử cùng account sau đổi role, không chứng minh cross-patient; cần sửa trước vận hành.
- Chưa đạt: audit read/deny toàn hệ thống, MFA freshness, revoke-session/concurrency, quản trị grant hai người, clinical encounter permissions. Đây là các gate triển khai, không được che bằng menu.

## Chạy lại kiểm thử

```bash
cd security/rbac-abac
npm ci --ignore-scripts
cd ../..
node security/rbac-abac/tests/rbac-abac.mjs
```

Không cần cloud key/secret. Fixture auth.users/auth.sessions chỉ tồn tại trong PGlite bộ nhớ. Không được đưa fixtures.sql/baseline-schema.sql/legacy-workflow.sql lên SQL Editor cloud. Snapshot dựng tối thiểu Auth và table grants/policies/trigger nghiệp vụ từ catalog, không tái tạo Auth gateway/JWT verification, toàn bộ Supabase extensions hoặc worker; đây không phải Supabase local stack đầy đủ. Các test helper predicate chạy owner; test RLS/API wrapper chủ động SET ROLE authenticated/anon.

Workflow `rbac-abac-checks.yml` chỉ test, không có deploy/secret/cloud access. Workflow V3 hiện hữu vẫn kiểm tra regression UI trên PR. Không merge khi chưa review schema, quyền và kế hoạch cutover.
