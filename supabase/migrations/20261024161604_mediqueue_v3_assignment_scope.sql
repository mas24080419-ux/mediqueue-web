-- Additive assignment model. No accounts or grants are provisioned by this migration.
CREATE TABLE public.mq_staff_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.mq_profiles(id),
 job_title text NOT NULL CHECK(job_title IN ('reception','doctor','nurse','laboratory','imaging','pharmacy','cashier','department_lead')),
 department_code text NOT NULL REFERENCES public.mq_departments(code),
 room_id text REFERENCES public.mq_rooms(id),
 valid_from timestamptz NOT NULL,
 valid_to timestamptz NOT NULL,
 active boolean NOT NULL DEFAULT true,
 granted_by uuid REFERENCES public.mq_profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(valid_to>valid_from), CHECK(job_title<>'doctor' OR room_id IS NOT NULL)
);
CREATE INDEX mq_assignment_user_shift ON public.mq_staff_assignments(user_id,valid_from,valid_to);
ALTER TABLE public.mq_staff_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mq_staff_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mq_staff_assignments TO authenticated;
CREATE POLICY mq_assignment_self ON public.mq_staff_assignments FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE TABLE mediqueue_private.hospital_admin_grants (
 user_id uuid PRIMARY KEY REFERENCES public.mq_profiles(id), active boolean NOT NULL DEFAULT true,
 granted_by uuid REFERENCES public.mq_profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mediqueue_private.hospital_admin_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mediqueue_private.hospital_admin_grants FROM PUBLIC,anon,authenticated;
CREATE TABLE mediqueue_private.assignment_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, entity text NOT NULL,
 operation text NOT NULL, record_id text NOT NULL, happened_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mediqueue_private.assignment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mediqueue_private.assignment_audit FROM PUBLIC,anon,authenticated;
CREATE FUNCTION mediqueue_private.validate_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.mq_profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=NEW.user_id AND p.role='staff' AND u.email_confirmed_at IS NOT NULL) THEN
 RAISE EXCEPTION 'VERIFIED_STAFF_ACCOUNT_REQUIRED'; END IF;
 IF NEW.room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.mq_rooms r WHERE r.id=NEW.room_id AND r.department_code=NEW.department_code) THEN RAISE EXCEPTION 'ROOM_DEPARTMENT_MISMATCH'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mq_validate_assignment BEFORE INSERT OR UPDATE ON public.mq_staff_assignments FOR EACH ROW EXECUTE FUNCTION mediqueue_private.validate_assignment();
CREATE FUNCTION mediqueue_private.audit_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO mediqueue_private.assignment_audit(actor_id,entity,operation,record_id) VALUES(auth.uid(),TG_TABLE_NAME,TG_OP,coalesce(to_jsonb(NEW)->>'id',to_jsonb(NEW)->>'user_id',to_jsonb(OLD)->>'id',to_jsonb(OLD)->>'user_id'));
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER mq_assignment_audit AFTER INSERT OR UPDATE OR DELETE ON public.mq_staff_assignments FOR EACH ROW EXECUTE FUNCTION mediqueue_private.audit_assignment();
CREATE TRIGGER mq_admin_grant_audit AFTER INSERT OR UPDATE OR DELETE ON mediqueue_private.hospital_admin_grants FOR EACH ROW EXECUTE FUNCTION mediqueue_private.audit_assignment();
CREATE FUNCTION mediqueue_private.is_hospital_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.jwt()->>'aal','')='aal2' AND EXISTS(SELECT 1 FROM mediqueue_private.hospital_admin_grants g JOIN public.mq_profiles p ON p.id=g.user_id JOIN auth.users u ON u.id=p.id WHERE g.user_id=auth.uid() AND g.active AND p.role='admin' AND u.email_confirmed_at IS NOT NULL)
$$;
CREATE FUNCTION mediqueue_private.can_task(p_task text,p_department text,p_room text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.mq_staff_assignments a JOIN public.mq_profiles p ON p.id=a.user_id JOIN auth.users u ON u.id=p.id
 WHERE a.user_id=auth.uid() AND p.role='staff' AND u.email_confirmed_at IS NOT NULL AND a.active AND now()>=a.valid_from AND now()<a.valid_to
 AND a.department_code=p_department AND (a.room_id IS NULL OR (p_room IS NOT NULL AND a.room_id=p_room))
 AND CASE p_task
 WHEN 'read' THEN a.job_title IN ('reception','doctor','nurse','department_lead')
 WHEN 'checkin' THEN a.job_title IN ('reception','department_lead')
 WHEN 'transfer' THEN a.job_title IN ('reception','department_lead')
 WHEN 'call' THEN a.job_title IN ('doctor','department_lead')
 WHEN 'START' THEN a.job_title IN ('doctor','department_lead')
 WHEN 'FINISH' THEN a.job_title IN ('doctor','department_lead')
 WHEN 'SKIP' THEN a.job_title IN ('doctor','department_lead')
 WHEN 'RESTORE' THEN a.job_title IN ('reception','department_lead')
 WHEN 'PRIORITY' THEN a.job_title='department_lead'
 WHEN 'recall' THEN a.job_title IN ('doctor','department_lead')
 WHEN 'pause' THEN a.job_title='department_lead'
 WHEN 'audit' THEN a.job_title='department_lead' ELSE false END)
$$;
CREATE OR REPLACE FUNCTION mediqueue_private.is_staff_for(p_department text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.mq_staff_assignments a JOIN public.mq_profiles p ON p.id=a.user_id WHERE a.user_id=auth.uid() AND p.role='staff' AND a.department_code=p_department AND a.active AND now()>=a.valid_from AND now()<a.valid_to)
$$;
CREATE FUNCTION mediqueue_private.require_task(p_task text,p_department text,p_room text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NOT mediqueue_private.can_task(p_task,p_department,p_room) THEN RAISE EXCEPTION 'ASSIGNMENT_ACCESS_DENIED' USING ERRCODE='42501'; END IF; END $$;
DROP POLICY mq_tickets_scoped ON public.mq_tickets;
CREATE POLICY mq_tickets_scoped ON public.mq_tickets FOR SELECT TO authenticated USING(patient_id=(SELECT auth.uid()) OR mediqueue_private.can_task('read',department_code,room_id));
DROP POLICY mq_audit_staff ON public.mq_audit_events;
CREATE POLICY mq_audit_staff ON public.mq_audit_events FOR SELECT TO authenticated USING(mediqueue_private.can_task('audit',department_code,NULL));
CREATE FUNCTION mediqueue_private.my_access() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.mq_profiles; result jsonb; super boolean;
BEGIN
 SELECT * INTO p FROM public.mq_profiles WHERE id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 super:=mediqueue_private.is_hospital_admin();
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'job_title',a.job_title,'department_code',a.department_code,'room_id',a.room_id,'valid_from',a.valid_from,'valid_to',a.valid_to)), '[]'::jsonb) INTO result
 FROM public.mq_staff_assignments a WHERE a.user_id=p.id AND p.role='staff' AND a.active AND now()>=a.valid_from AND now()<a.valid_to;
 RETURN jsonb_build_object('user_id',p.id,'role',p.role,'is_hospital_admin',super,'assignments',result,'state',CASE WHEN p.role='patient' THEN 'patient' WHEN super THEN 'hospital_admin' WHEN jsonb_array_length(result)>0 THEN 'assigned' ELSE 'awaiting_provisioning' END);
END $$;
CREATE FUNCTION public.mq_my_access() RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT mediqueue_private.my_access() $$;
CREATE FUNCTION mediqueue_private.hospital_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT mediqueue_private.is_hospital_admin() THEN RAISE EXCEPTION 'HOSPITAL_ADMIN_MFA_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('departments',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM public.mq_departments d),'rooms',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.mq_rooms r),'live',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM public.mq_department_live l),'roomLive',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM public.mq_room_live l),'assignments_count',(SELECT count(*) FROM public.mq_staff_assignments WHERE active AND now()>=valid_from AND now()<valid_to),'audit_count',(SELECT count(*) FROM mediqueue_private.assignment_audit)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.mq_hospital_overview() RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT mediqueue_private.hospital_overview() $$;
REVOKE ALL ON FUNCTION public.mq_my_access(),public.mq_hospital_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mq_my_access(),public.mq_hospital_overview() TO authenticated;
REVOKE ALL ON FUNCTION mediqueue_private.validate_assignment(),mediqueue_private.audit_assignment(),mediqueue_private.is_hospital_admin(),mediqueue_private.can_task(text,text,text),mediqueue_private.require_task(text,text,text),mediqueue_private.my_access(),mediqueue_private.hospital_overview() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mediqueue_private.can_task(text,text,text),mediqueue_private.my_access(),mediqueue_private.hospital_overview() TO authenticated;
CREATE OR REPLACE FUNCTION mediqueue_private.assign_room(p_ticket_id bigint, p_room_id text)
 RETURNS mq_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t public.mq_tickets; r public.mq_rooms;
BEGIN
 SELECT * INTO t FROM public.mq_tickets WHERE id=p_ticket_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NOT_FOUND'; END IF;
 IF NOT mediqueue_private.is_staff_for(t.department_code) THEN RAISE EXCEPTION 'STAFF_ACCESS_DENIED'; END IF;
 PERFORM mediqueue_private.require_task('transfer',t.department_code,t.room_id);
 PERFORM mediqueue_private.require_task('transfer',t.department_code,p_room_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t.department_code || t.date_key::text,1));
 SELECT * INTO t FROM public.mq_tickets WHERE id=p_ticket_id FOR UPDATE;
 IF t.date_key <> (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR t.status <> 'WAITING' OR t.checked_in_at IS NULL THEN RAISE EXCEPTION 'TRANSFER_REQUIRES_CHECKED_IN_WAITING'; END IF;
 SELECT * INTO r FROM public.mq_rooms WHERE id=p_room_id AND department_code=t.department_code AND is_available;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ROOM'; END IF;
 UPDATE public.mq_tickets SET room_id=r.id WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.mq_audit_events(ticket_id,department_code,actor_id,action) VALUES(t.id,t.department_code,auth.uid(),'ASSIGN_ROOM');
 RETURN t;
END;
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.call_next_room(p_room_id text)
 RETURNS mq_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 r public.mq_rooms; result public.mq_tickets;
BEGIN
 SELECT * INTO r FROM public.mq_rooms WHERE id=p_room_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
 IF NOT mediqueue_private.is_staff_for(r.department_code) THEN RAISE EXCEPTION 'STAFF_ACCESS_DENIED'; END IF;
 PERFORM mediqueue_private.require_task('call',r.department_code,p_room_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.department_code || d::text,1));
 SELECT * INTO r FROM public.mq_rooms WHERE id=p_room_id AND is_available;
 IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM public.mq_department_live WHERE department_code=r.department_code AND is_paused) THEN
 RAISE EXCEPTION 'DEPARTMENT_PAUSED'; END IF;
 IF EXISTS(SELECT 1 FROM public.mq_tickets WHERE room_id=p_room_id AND date_key=d AND status IN ('CALLED','SERVING')) THEN
 RAISE EXCEPTION 'ROOM_HAS_ACTIVE_TICKET'; END IF;
 SELECT * INTO result FROM public.mq_tickets
 WHERE room_id=p_room_id AND department_code=r.department_code AND date_key=d
 AND checked_in_at IS NOT NULL AND status='WAITING'
 ORDER BY is_priority DESC,queue_number ASC FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_QUEUE_EMPTY'; END IF;
 UPDATE public.mq_tickets SET status='CALLED',called_at=now()
 WHERE id=result.id RETURNING * INTO result;
 INSERT INTO public.mq_audit_events(ticket_id,department_code,actor_id,action)
 VALUES(result.id,r.department_code,auth.uid(),'CALL_ROOM:' || p_room_id);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.change_ticket(p_ticket_id bigint, p_action text, p_priority boolean)
 RETURNS mq_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  old_row public.mq_tickets;
  new_row public.mq_tickets;
BEGIN
  SELECT * INTO old_row FROM public.mq_tickets WHERE id=p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NOT_FOUND'; END IF;
  IF NOT mediqueue_private.is_staff_for(old_row.department_code) THEN
    RAISE EXCEPTION 'STAFF_ACCESS_DENIED';
  END IF;
 PERFORM mediqueue_private.require_task(p_action,old_row.department_code,old_row.room_id);
  IF p_action='START' AND old_row.status='CALLED' THEN
    UPDATE public.mq_tickets SET status='SERVING',started_at=now() WHERE id=p_ticket_id RETURNING * INTO new_row;
  ELSIF p_action='FINISH' AND old_row.status='SERVING' THEN
    UPDATE public.mq_tickets SET status='COMPLETED',completed_at=now() WHERE id=p_ticket_id RETURNING * INTO new_row;
  ELSIF p_action='SKIP' AND old_row.status IN ('WAITING','CALLED') THEN
    UPDATE public.mq_tickets SET status='SKIPPED' WHERE id=p_ticket_id RETURNING * INTO new_row;
  ELSIF p_action='RESTORE' AND old_row.status='SKIPPED' THEN
    UPDATE public.mq_tickets SET status='WAITING',called_at=NULL WHERE id=p_ticket_id RETURNING * INTO new_row;
  ELSIF p_action='PRIORITY' AND old_row.status='WAITING' AND p_priority IS NOT NULL THEN
    UPDATE public.mq_tickets SET is_priority=p_priority WHERE id=p_ticket_id RETURNING * INTO new_row;
  ELSE
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION';
  END IF;
  INSERT INTO public.mq_audit_events(ticket_id,department_code,actor_id,action)
    VALUES(p_ticket_id,old_row.department_code,auth.uid(),p_action);
  RETURN new_row;
END;
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.checkin_qr(p_nonce uuid)
 RETURNS mq_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t public.mq_tickets; chosen text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT * INTO t FROM public.mq_tickets WHERE qr_nonce=p_nonce;
 IF NOT FOUND THEN RAISE EXCEPTION 'QR_NOT_FOUND'; END IF;
 IF NOT mediqueue_private.is_staff_for(t.department_code) THEN RAISE EXCEPTION 'STAFF_ACCESS_DENIED'; END IF;
 PERFORM mediqueue_private.require_task('checkin',t.department_code,NULL);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t.department_code || t.date_key::text,1));
 SELECT * INTO t FROM public.mq_tickets WHERE id=t.id FOR UPDATE;
 IF t.date_key <> (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR t.status <> 'WAITING' THEN RAISE EXCEPTION 'QR_TICKET_INACTIVE'; END IF;
 IF t.checked_in_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_CHECKED_IN'; END IF;
 IF (SELECT is_paused FROM public.mq_department_live WHERE department_code=t.department_code) THEN RAISE EXCEPTION 'DEPARTMENT_PAUSED'; END IF;
 SELECT r.id INTO chosen FROM public.mq_rooms r LEFT JOIN public.mq_tickets q ON q.room_id=r.id AND q.date_key=t.date_key AND q.status IN ('WAITING','CALLED','SERVING')
 WHERE r.department_code=t.department_code AND r.is_available GROUP BY r.id ORDER BY count(q.id),r.id LIMIT 1;
 IF chosen IS NULL THEN RAISE EXCEPTION 'NO_AVAILABLE_ROOM'; END IF;
 UPDATE public.mq_tickets SET checked_in_at=now(),room_id=chosen WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.mq_audit_events(ticket_id,department_code,actor_id,action) VALUES(t.id,t.department_code,auth.uid(),'CHECKIN_QR');
 RETURN t;
END;
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.recall_ticket(p_ticket_id bigint)
 RETURNS mq_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE original public.mq_tickets; outcome public.mq_tickets; d date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 SELECT * INTO original FROM public.mq_tickets WHERE id=p_ticket_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NOT_FOUND'; END IF;
 IF NOT mediqueue_private.is_staff_for(original.department_code) THEN RAISE EXCEPTION 'STAFF_ACCESS_DENIED'; END IF;
 PERFORM mediqueue_private.require_task('recall',original.department_code,original.room_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(original.department_code || d::text,1));
 SELECT * INTO original FROM public.mq_tickets WHERE id=p_ticket_id FOR UPDATE;
 IF original.date_key <> d OR original.status <> 'CALLED' THEN RAISE EXCEPTION 'RECALL_ONLY_CALLED_TODAY'; END IF;
 IF original.recall_count >= 3 THEN RAISE EXCEPTION 'RECALL_LIMIT_REACHED'; END IF;
 UPDATE public.mq_tickets SET called_at=now(),recall_count=recall_count+1 WHERE id=p_ticket_id RETURNING * INTO outcome;
 INSERT INTO public.mq_audit_events(ticket_id,department_code,actor_id,action) VALUES(p_ticket_id,original.department_code,auth.uid(),'RECALL');
 RETURN outcome;
END;
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.set_department_pause(p_department text, p_paused boolean, p_reason text)
 RETURNS mq_department_live
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE current_row public.mq_department_live; d date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 IF NOT mediqueue_private.is_staff_for(p_department) THEN RAISE EXCEPTION 'STAFF_ACCESS_DENIED'; END IF;
 PERFORM mediqueue_private.require_task('pause',p_department,NULL);
 IF p_paused IS NULL THEN RAISE EXCEPTION 'INVALID_PAUSE_VALUE'; END IF;
 IF p_paused AND (p_reason IS NULL OR p_reason NOT IN ('Gián đoạn kỹ thuật','Nhân viên tạm vắng','Điều phối phòng khám')) THEN RAISE EXCEPTION 'INVALID_PAUSE_REASON'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_department || d::text,1));
 SELECT * INTO current_row FROM public.mq_department_live WHERE department_code=p_department FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND'; END IF;
 IF current_row.is_paused = p_paused THEN RAISE EXCEPTION 'PAUSE_STATE_UNCHANGED'; END IF;
 UPDATE public.mq_department_live SET is_paused=p_paused,pause_reason=CASE WHEN p_paused THEN p_reason ELSE NULL END,
 paused_at=CASE WHEN p_paused THEN now() ELSE NULL END,updated_at=now() WHERE department_code=p_department RETURNING * INTO current_row;
 INSERT INTO mediqueue_private.department_events(department_code,actor_id,action)
 VALUES(p_department,auth.uid(),CASE WHEN p_paused THEN 'PAUSE' ELSE 'RESUME' END);
 RETURN current_row;
END;
$function$
;

