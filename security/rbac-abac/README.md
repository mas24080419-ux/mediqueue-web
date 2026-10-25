# Authorization verification (local only)

Pinned PGlite PostgreSQL test runtime, no cloud credentials or patient data. Run npm ci --ignore-scripts here; then node tests/rbac-abac.mjs. Schema fixture reflects the live MediQueue catalog inspected on 2026-10-25; Auth/session schema is a minimal synthetic test harness. DO NOT apply test fixtures to any cloud DB.

Migration files are proposed at repository supabase/migrations; nothing auto-applies them. See docs/security/VERIFICATION_REPORT_2026-10-25.md for explicit limitations and the existing owner-RPC gap reproduced by the suite. Baseline-gap reproduction PASS means the defect was reproduced, not that existing authorization is safe.
