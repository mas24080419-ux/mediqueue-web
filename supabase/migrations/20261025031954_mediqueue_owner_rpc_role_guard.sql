-- PROPOSED patch for existing patient-owner RPCs; NOT applied to Dev.
-- Align SECURITY DEFINER checks with existing ticket SELECT RLS. Signatures unchanged.
CREATE OR REPLACE FUNCTION mediqueue_private.my_wait_info(p_ticket_id bigint)
 RETURNS TABLE(queue_position integer, estimate_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE mine public.mq_tickets; ahead int; active int; avg_minutes int;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.mq_profiles p WHERE p.id=auth.uid() AND p.role='patient') THEN
 RAISE EXCEPTION 'PATIENT_ACCOUNT_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO mine FROM public.mq_tickets WHERE id=p_ticket_id AND patient_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_YOUR_TICKET'; END IF;
 IF mine.status<>'WAITING' THEN RETURN; END IF;
 IF mine.room_id IS NULL OR mine.checked_in_at IS NULL THEN
  SELECT count(*)::int INTO ahead FROM public.mq_tickets t WHERE t.date_key=mine.date_key
    AND t.department_code=mine.department_code AND t.status='WAITING'
    AND ((t.is_priority AND NOT mine.is_priority) OR
    (t.is_priority=mine.is_priority AND t.queue_number<mine.queue_number));
  SELECT count(*)::int INTO active FROM public.mq_tickets t WHERE t.date_key=mine.date_key
    AND t.department_code=mine.department_code AND t.status IN ('CALLED','SERVING');
 ELSE
  SELECT count(*)::int INTO ahead FROM public.mq_tickets t WHERE t.date_key=mine.date_key
    AND t.room_id=mine.room_id AND t.status='WAITING' AND t.checked_in_at IS NOT NULL
    AND ((t.is_priority AND NOT mine.is_priority) OR
    (t.is_priority=mine.is_priority AND t.queue_number<mine.queue_number));
  SELECT count(*)::int INTO active FROM public.mq_tickets t WHERE t.date_key=mine.date_key
    AND t.room_id=mine.room_id AND t.status IN ('CALLED','SERVING');
 END IF;
 SELECT coalesce(round(avg(extract(epoch FROM(t.completed_at-t.started_at))/60))::int,12) INTO avg_minutes
 FROM public.mq_tickets t WHERE t.department_code=mine.department_code AND t.status='COMPLETED'
  AND (mine.room_id IS NULL OR t.room_id=mine.room_id)
  AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL
  AND t.completed_at-t.started_at BETWEEN interval '1 minute' AND interval '120 minutes';
 RETURN QUERY SELECT ahead+1,(ahead+active)*greatest(avg_minutes,1);
END $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.cancel_my_ticket(p_ticket_id bigint)
 RETURNS mq_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE original public.mq_tickets; outcome public.mq_tickets;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.mq_profiles p WHERE p.id=auth.uid() AND p.role='patient') THEN
 RAISE EXCEPTION 'PATIENT_ACCOUNT_REQUIRED' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT * INTO original FROM public.mq_tickets WHERE id=p_ticket_id;
 IF NOT FOUND OR original.patient_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'NOT_YOUR_TICKET'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(original.department_code || original.date_key::text,1));
 SELECT * INTO original FROM public.mq_tickets WHERE id=p_ticket_id FOR UPDATE;
 IF original.patient_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'NOT_YOUR_TICKET'; END IF;
 IF original.status <> 'WAITING' THEN RAISE EXCEPTION 'CANCEL_ONLY_WHILE_WAITING'; END IF;
 UPDATE public.mq_tickets SET status='SKIPPED' WHERE id=p_ticket_id RETURNING * INTO outcome;
 INSERT INTO public.mq_audit_events(ticket_id,department_code,actor_id,action)
 VALUES(p_ticket_id,original.department_code,auth.uid(),'PATIENT_CANCEL');
 RETURN outcome;
END;
$function$
;

