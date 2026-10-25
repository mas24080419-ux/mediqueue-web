# MediQueue V5 — verified patient records and appointments

Date: 25/10/2026. Status: SOURCE IMPLEMENTED, REVIEW REQUIRED. Not deployed to MediQueue-Dev or GitHub Pages.

## Implemented
- Branch feat/v5-appointments-integrated-main starts from current main (retains QR, V4 Auth and 4-step wizard).
- Two security migrations from draft PR #2, followed by the new V5 appointment migration. Review together and avoid running duplicated migrations if PR #2 is merged separately.
- Patient-record identities and verified, scoped account–patient links; pending links never grant appointment access. A new profile request RPC creates a **pending** self link. The system never self-approves a patient based solely on a name or email.
- Internal clinician/service/shift/slot/appointment tables with RLS enabled and direct client CRUD revoked. Services and shifts are unpublished by default; slots closed by default.
- All scheduling RPCs require a valid verified patient role/session. Booking and cancellation require active verified queue.book / queue.cancel scope. Server checks these on every operation.
- Row locking plus a partial unique index prevent two CONFIRMED bookings for the same slot. A unique (booked_by, request_key) key makes retries idempotent. Overlapping clinician slots are rejected by a trigger.
- RPCs: mq_request_self_profile_v5, mq_pending_profiles_v5, mq_booking_catalog_v5, mq_open_slots_v5, mq_create_appointment_v5, mq_cancel_appointment_v5, mq_my_appointments_v5.
- Existing patient wizard offers appointment mode only after backend returns verified profiles and real published services. Missing endpoints display unavailable instead of mock success. Existing same-day queue mode is unchanged.
- My appointments renders only backend-authorized records. A V5 appointment has **no check-in QR** yet and is **not** a same-day queue ticket.

## Completed verification
A combined SQL DDL syntax trial ran on MediQueue-Dev using one transaction with ROLLBACK (no schema or patient data persisted). Unit tests and browser CI run in the GitHub pull request.

## Not completed
- No actual doctors, schedules, facilities or patient records were inserted.
- No reviewer verification workflow, consent/evidence storage, real OTP, real clinician schedules, tariff/BHYT or payment.
- No staff appointment check-in / conversion to queue ticket, no confirmed notification delivery.
- Real cross-account E2E, expired session/revoked link negative tests and high-concurrency slot stress tests have not been verified.
- Neither PR #2's foundation nor V5 has been applied to the cloud.

## Release gates
1. Independently review security foundation, grants, triggers and all SECURITY DEFINER RPCs. Decide how PR #2 will be reconciled with the V5 branch.
2. Hospital reviewer must validate legal identity/representation and separately approve linked patient records. Public signup cannot approve links.
3. Populate true hospital facilities, clinician rosters, published services and open slots through an authorized administrative process; do not seed dummy clinician identities.
4. Validate 2 simultaneous requests for last slot, replay with same request key, IDOR across two identities, revoked links, active shift, expired sessions, AAL2 staff accounts, and negative anonymous endpoint behavior on synthetic data.
5. Review privacy, availability, audit and clinical escalation before real patient use.
6. Merge/deploy only after all required checks pass.

## Security advisor note
Current inspection found RLS disabled for mediqueue_private.daily_counters and mediqueue_private.department_events. Check actual Data API exposure and existing queue RPC dependencies. Do not toggle RLS without evaluating needed grants and policies. Advisor also warned that leaked-password protection is disabled. No automatic security settings were changed.

https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
