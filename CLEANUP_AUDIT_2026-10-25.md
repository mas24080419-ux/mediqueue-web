# MediQueue front-end CSS audit — 2026-10-25

## Scope
Reviewed the deployed GitHub Pages V3 source on `main` at baseline `f6381a3faa24c166f9d86b27cc803b1362057f2c`.
The V4 standalone prototype (`/mnt/data/MediQueue_V4_UI_Phase1`) is not part of this repository.
No Supabase schema, Auth/RLS/RPC, clinical workflow, or production deployment is changed.

## Verified observations
- All three production portals imported five global stylesheets, including `auth-v3.css` (17,128 bytes).
- `auth-v3.css` still contains the original standalone auth-screen implementation, such as `.auth-layout`, `.intro-panel`, `.portal-option`, and `.otp-input`. The currently deployed `app.js` does **not** render these auth-screen classes; it uses the legacy inline `authForm()` instead.
- The live patient homepage **does** use `.preview-label`, `.preview-grid`, `.preview-card` and related patient card selectors. These must be retained.
- Approximate static duplicate-selector scan found 49 groups of repeated properties across the five CSS files. **This is not 49 confirmed defects**: most are responsive overrides, CSS resets or intentional V3 customizations. Especially suspicious are multiple global color tokens, `.work-side`, `.work-header`, and `.auth-card`.
- Older `.sidebar`, `.role-btn`, `.mq-roles` and demo-preview rules remain in legacy CSS; these were not deleted in this low-risk pass because not all DOM states can be verified without authenticated live browser tests.

## Changes in this PR
1. Extract only patient homepage styles into `patient-landing.css`.
2. Stop loading archived `auth-v3.css` on patient/staff/admin portals.
3. Delete `auth-v3.css` on the refactor branch.
4. Remove unreachable `staff()` (about 5.3 KB) from `app.js`: the live `staff`, `tasks`, and `work-home` routes already use `workDashboard()` instead.\n5. Update Pages packaging to serve `patient-landing.css`, and add a stylesheet integrity test to PR and deployment CI.

## Deferred work / risk
- Do not delete more legacy sidebar selectors or override rules without visual diff at desktop/mobile, cloud auth, queue, and admin screens.
- `app.js` is still a large procedural module; splitting by feature requires regression testing for login/logout, refresh races, queue actions, admin reporting, and route checks.
- V4 is an independent UI demo, not the deployed app; merge its design only after approval and separate integration tests.
- CI browser tests mock Auth/PostgREST. PASS does not establish live authenticated workflow or real MFA.
- Removing the dead `staff()` function should not affect routes; nevertheless the browser regression suite must stay green.\n- The old `auth-v3.css` removal can change inherited global CSS on auth form elements. Prior to merging, review PR screenshots for patient/staff/admin at 1440px/390px and specifically verify cloud login form dimensions.

## Status
This is a **review-only cleanup PR**. It must not be merged into `main` until design review. Existing `main` deployment remains untouched.
