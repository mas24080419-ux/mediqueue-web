-- Read-only negative authorization exercise, reviewed for MediQueue-Dev only.
BEGIN;
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true),set_config('request.jwt.claims','{"sub":"99999999-9999-4999-8999-999999999999","aal":"aal2","user_metadata":{"role":"admin"}}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.mq_tickets) THEN RAISE EXCEPTION 'FAIL_CROSS_USER_RLS'; END IF;
 IF EXISTS(SELECT 1 FROM public.mq_profiles) THEN RAISE EXCEPTION 'FAIL_PROFILE_RLS'; END IF;
 IF EXISTS(SELECT 1 FROM public.mq_staff_assignments) THEN RAISE EXCEPTION 'FAIL_ASSIGNMENT_RLS'; END IF;
 IF mediqueue_private.can_task('read','GENERAL','GENERAL_101') THEN RAISE EXCEPTION 'FAIL_METADATA_GRANT'; END IF;
 BEGIN UPDATE public.mq_profiles SET role='admin' WHERE id=auth.uid(); RAISE EXCEPTION 'FAIL_SELF_PROMOTION'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mq_hospital_overview(); RAISE EXCEPTION 'FAIL_ADMIN_AGGREGATE'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM public.mq_tickets LIMIT 1; RAISE EXCEPTION 'FAIL_ANON_TICKETS'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mq_my_access(); RAISE EXCEPTION 'FAIL_ANON_RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS' status, 'live Dev SQL negative authorization only; nonexistent actor; not browser/Auth E2E' environment;
ROLLBACK;
