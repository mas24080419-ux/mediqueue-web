-- SQL integration only. Uses one existing verified Dev user, restores everything by ROLLBACK.
BEGIN;
DO $$
DECLARE u uuid; t1 public.mq_tickets; t2 public.mq_tickets; r uuid; d1 uuid; d2 uuid; denied boolean;
BEGIN
 SELECT id INTO u FROM auth.users WHERE email_confirmed_at IS NOT NULL LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'TEST_BLOCKED_NO_VERIFIED_USER'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 UPDATE public.mq_profiles SET role='patient' WHERE id=u;
 SELECT * INTO t1 FROM public.mq_issue_ticket('GENERAL','V3 QA Patient',gen_random_uuid());
 SELECT * INTO t2 FROM public.mq_issue_ticket('GENERAL','V3 QA Patient Two',gen_random_uuid());
 UPDATE public.mq_profiles SET role='staff',department_code='GENERAL' WHERE id=u;
 INSERT INTO public.mq_staff_assignments(user_id,job_title,department_code,valid_from,valid_to) VALUES(u,'reception','GENERAL',now()-interval '1 hour',now()+interval '1 hour') RETURNING id INTO r;
 PERFORM public.mq_checkin_qr(t1.qr_nonce); PERFORM public.mq_checkin_qr(t2.qr_nonce);
 PERFORM public.mq_assign_room(t1.id,'GENERAL_101'); PERFORM public.mq_assign_room(t2.id,'GENERAL_104');
 denied:=false;BEGIN PERFORM public.mq_call_next_room('GENERAL_101'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'RECEPTION_CAN_CALL';END IF;
 denied:=false;BEGIN PERFORM mediqueue_private.require_task('checkin','PEDIATRICS',NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'WRONG_DEPARTMENT';END IF;
 UPDATE public.mq_staff_assignments SET active=false WHERE id=r;
 INSERT INTO public.mq_staff_assignments(user_id,job_title,department_code,room_id,valid_from,valid_to) VALUES(u,'doctor','GENERAL','GENERAL_101',now()-interval '1 hour',now()+interval '1 hour') RETURNING id INTO d1;
 PERFORM public.mq_call_next_room('GENERAL_101');
 denied:=false;BEGIN PERFORM public.mq_call_next_room('GENERAL_104'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'WRONG_ROOM';END IF;
 denied:=false;BEGIN PERFORM public.mq_change_ticket(t2.id,'START',NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'WRONG_ROOM_START';END IF;
 INSERT INTO public.mq_staff_assignments(user_id,job_title,department_code,room_id,valid_from,valid_to) VALUES(u,'doctor','GENERAL','GENERAL_104',now()-interval '1 hour',now()+interval '1 hour') RETURNING id INTO d2;
 PERFORM public.mq_call_next_room('GENERAL_104');
 IF (SELECT count(*) FROM public.mq_tickets WHERE id IN(t1.id,t2.id) AND status='CALLED')<>2 THEN RAISE EXCEPTION 'TWO_ROOMS_NOT_INDEPENDENT';END IF;
 denied:=false;BEGIN PERFORM public.mq_call_next_room('GENERAL_101'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='ROOM_HAS_ACTIVE_TICKET' THEN denied:=true;ELSE RAISE;END IF; END;IF NOT denied THEN RAISE EXCEPTION 'DUPLICATE_ROOM_CALL';END IF;
 PERFORM public.mq_recall_ticket(t1.id);
 PERFORM public.mq_change_ticket(t1.id,'START',NULL);PERFORM public.mq_change_ticket(t1.id,'FINISH',NULL);
 PERFORM public.mq_change_ticket(t2.id,'SKIP',NULL);
 denied:=false;BEGIN PERFORM public.mq_change_ticket(t2.id,'RESTORE',NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'DOCTOR_CAN_RESTORE';END IF;
 UPDATE public.mq_staff_assignments SET valid_to=now()-interval '1 minute' WHERE id=d1;
 denied:=false;BEGIN PERFORM mediqueue_private.require_task('call','GENERAL','GENERAL_101'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'EXPIRED_SHIFT';END IF;
 UPDATE public.mq_staff_assignments SET active=true WHERE id=r;
 PERFORM public.mq_change_ticket(t2.id,'RESTORE',NULL);
 UPDATE public.mq_staff_assignments SET active=false WHERE id IN(r,d2);
 UPDATE public.mq_profiles SET role='patient' WHERE id=u;
 PERFORM public.mq_cancel_my_ticket(t2.id);
 denied:=false;BEGIN PERFORM public.mq_hospital_overview(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'PATIENT_ADMIN_ACCESS';END IF;
 IF (SELECT count(*) FROM public.mq_audit_events WHERE ticket_id IN(t1.id,t2.id))<10 THEN RAISE EXCEPTION 'MISSING_WORKFLOW_AUDIT'; END IF;
END $$;
-- RLS exercises as an authenticated identity with no ownership or provisioned profile.
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.mq_tickets) THEN RAISE EXCEPTION 'CROSS_USER_TICKET_LEAK';END IF;END $$;
SELECT 'PASS: SQL workflow, reception/doctor separation, room/department scope, expired shift, two active rooms, duplicate call prevention, recall, START/FINISH, SKIP/RESTORE/cancel, audit and cross-user RLS. Not browser E2E or concurrent-session proof.' AS evidence;
ROLLBACK;
