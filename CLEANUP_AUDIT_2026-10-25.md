# MediQueue UI source refactor / audit — 2026-10-25

## Source / guarantees

Source: `mas24080419-ux/mediqueue-web`, deployed `main` baseline `f6381a3faa24c166f9d86b27cc803b1362057f2c`.
Refactor branch: `refactor/remove-unused-auth-v3-css-20261025`.
Pull request: https://github.com/mas24080419-ux/mediqueue-web/pull/3

Only frontend files, their packaging workflow and automated frontend tests have changed. No changes to Supabase Auth, RLS, SQL migrations, API/RPC, real patient data or live main website. The separate V4 standalone prototype is NOT included in this PR.

## Implemented cleanup

1. Removed dead `staff()` legacy renderer (~5,284 JavaScript characters). The actual `staff/tasks/work-home` route already renders `workDashboard()`, preserved unchanged.
2. Replaced 17.1 KB legacy `auth-v3.css` with `patient-landing.css` (~1.5 KB) that contains only selectors required by the current patient landing cards. Removed archived OTP/login design rules not mounted by the live `app.js`. Updated three portals and Pages bundling.
3. Pruned **two passes** of V1–V3 selectors in `styles.css`, `dashboard.css`, `premium-sidebar.css`, and `integration.css`: old `.sidebar`, `.nav-btn`, `.topbar`, `.main`, role navigation `.role-list` / `.role-btn`, preview-only `.mq-roles` / `.mq-patient-page`, old room-card design, old dashboard matrix, and other unreferenced classes. Preserved grouped selectors that contain live classes and kept working responsive rules.
4. Removed five unused sidebar SVG icon definitions: `bell`, `search`, `mail`, `pill`, `clock`. Icons still used by the live menu or access map remain.
5. Eliminated six global CSS declarations in `styles.css :root` that were subsequently overwritten by `dashboard.css :root`; kept effective cascade values untouched.
6. Added `tests/css-integrity.mjs`, invoked by the PR and Pages workflows, to verify active stylesheet imports and block reintroduction of obsolete CSS classes. Existing JS/browser/RBAC test files remain unchanged.

## Current output size / source character count

| File | Baseline | Refactor branch |
|---|---:|---:|
| `auth-v3.css` -> `patient-landing.css` | 17,128 | 1,530 |
| `styles.css` | 20,929 | 16,038 |
| `dashboard.css` | 9,394 | 6,127 |
| `premium-sidebar.css` | 12,614 | 9,641 |
| `integration.css` | 1,728 | 1,661 |
| `app.js` | 64,966 | 59,682 |
| `premium-sidebar.js` | ~7,830 | ~7,447 |

Approximate decrease: **32,000 characters of CSS/JS** for the above source files, not a benchmark of network transfer, memory usage, or execution speed. Files contain Vietnamese Unicode, so character counts are not exactly equal to bytes.

## JS function inventory and risk

- Reviewed 50 named functions remaining in `app.js`; no additional independently proved dead function after removal of `staff()`.
- Be aware: `deptCard` is referenced as a callback in `.map(deptCard)`, not necessarily as `deptCard(...)`. A naive “no direct function call” detector would wrongly remove it.
- `app.js` remains a ~60K-character procedural module with coupled event delegation, demo/cloud data access, and DOM rendering. Splitting into several components would be a distinct, riskier engineering step requiring a full authenticated regression suite. Avoid deleting the `home()` fallback or `tag-*` status CSS just because they look unused under simple searches.
- The current refactor does not assert that the UI is production HIS-ready or that E2E live Supabase Auth/MFA has passed.

## CSS cascade remaining

`styles.css`, `dashboard.css`, `premium-sidebar.css` and `integration.css` still have legitimate responsive overrides and some intentionally shared global selectors. Duplicate-selector counts without CSS media context are **not** a defect count. The code is safer after removing the identified dead families, but claiming complete CSS ownership isolation would be inaccurate.

Before merging: review patient login, staff login, and admin login on desktop and mobile; check queue check-in/doctor controls in both demo and authenticated environments where accounts exist. CI browser tests mock Supabase and cannot replace real E2E.

## Current acceptance

The existing PR uses the `V3 integration checks (no deployment)` GitHub Action, which runs JS syntax, source integrity, regression tests, and Playwright scenarios across roles and viewports. Read the latest workflow status on this PR before merge. **PR remains Draft, not merged or deployed.**
