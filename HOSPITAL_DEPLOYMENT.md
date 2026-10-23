# MediQueue — Hospital Deployment Readiness

> **Version:** web V1.1 / demo. Not a medical record system. Do not enter real patient data.

## What has been built and deployed
- Patient: choose outpatient department, issue ticket, view queue position, waiting-time estimate, self-cancel while waiting, show check-in code.
- Reception (staff-gated): department queue, attendance status, search, check-in via one-time ticket code and room assignment.
- Examination rooms (staff-gated): select department/room, call next checked-in patient, begin/finish service, recall, skip, reprioritize under staff authority, move patient to another room within department, pause department.
- Public lobby / television: room-number-only board (no patient names), current ticket numbers and counts.
- Supervisor view: aggregate department workloads and completion progress.
- Operational guide for reception, patient registration and emergency escalation.
- Browser-based demo using **synthetic patients**, persisted locally. Public website intentionally DOES NOT deploy Supabase config or server keys.

## Cloud backend present separately
Supabase MediQueue-Dev exists, with Auth, PostgreSQL, RLS, SQL RPCs, per-room calling, audit events and a queued FCM outbox. The public demo is **not** automatically connected to cloud. Integration is subject to testing staff accounts and permissions.

## What is still needed to be a real hospital deployment
1. Hospital governance, privacy review, risk assessment, incident response, backups, observability and access reviews.
2. Real staff provisioning with verified work identity, department/room permissions, account lockout/MFA; end-to-end access-control penetration test.
3. Reliable identity matching at check-in, duplicate patient prevention, accessible kiosk and disability-friendly workflow.
4. Outpatient scheduling and doctor shifts, visit lifecycle, multi-service queues (laboratory, cashier, pharmacy, diagnostic imaging).
5. Real communication delivery: authenticated server-side SMS/FCM/email with rate limits, retry and opt-in.
6. Load tests with concurrent callers, cross-device realtime tests, incident/degraded-network fallbacks.
7. Hospital information-system integrations and interoperability standards *only if approved by the facility*.
8. Data protection compliance; no actual patient diagnoses, test results, insurance or medical records in this repository.

## Emergency rule
A medical emergency requires immediate clinical assessment. Queue priority is never a substitute for triage.

## Secure GitHub Pages setup
Website is a static front end. Never place Supabase service-role keys, Firebase service-account credentials, patient data, access tokens or backup exports in GitHub. Publishable keys are not authorization: RLS and server-side RPC authorization are the security boundary. Do not enable the live backend for real data before completing a security review.

## QA checklist
- `node --check app.js`
- `node --check supabase-client.js`
- `node tests/smoke.mjs`
- GitHub Actions `MediQueue Web · Test and Deploy GitHub Pages` green
- Manual browser tests: mobile, desktop, keyboard focus, screen-reader contrast, patient booking → receptionist check-in → doctor call → start → finish.
- Separate role tests: patient cannot read reception; staff cannot view another department; public TV board never shows names.
