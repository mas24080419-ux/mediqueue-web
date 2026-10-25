-- PROPOSED, NOT APPLIED TO MEDIQUEUE-DEV. Additive foundation; no UI or legacy RPC changes.
-- Empty scope tables are intentional: no guessed facility or inherited access grants.
CREATE TABLE mediqueue_private.facilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE mediqueue_private.department_facilities (
 department_code text PRIMARY KEY REFERENCES public.mq_departments(code),
 facility_id uuid NOT NULL REFERENCES mediqueue_private.facilities(id),
 UNIQUE(department_code,facility_id)
);
CREATE TABLE mediqueue_private.assignment_tasks (
 assignment_id uuid NOT NULL REFERENCES public.mq_staff_assignments(id),
 task text NOT NULL CHECK(task IN ('read','checkin','transfer','call','START','FINISH','SKIP','RESTORE','PRIORITY','recall','pause','audit')),
 PRIMARY KEY(assignment_id,task)
);
CREATE TABLE mediqueue_private.patient_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mediqueue_private.patient_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.mq_profiles(id),
 patient_record_id uuid NOT NULL REFERENCES mediqueue_private.patient_records(id),
 relationship text NOT NULL CHECK(relationship IN ('self','legal_representative','consented_delegate')),
 scopes text[] NOT NULL CHECK(cardinality(scopes)>0 AND scopes <@ ARRAY['profile.read','queue.book','queue.read','queue.cancel']::text[]),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','verified','rejected','revoked')),
 verified_by uuid REFERENCES public.mq_profiles(id), evidence_ref uuid, verified_at timestamptz,
 valid_from timestamptz NOT NULL, valid_to timestamptz NOT NULL, revoked_at timestamptz,
 CHECK(valid_to>valid_from), CHECK(state<>'verified' OR (verified_by IS NOT NULL AND verified_by<>user_id AND evidence_ref IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX patient_links_user_scope ON mediqueue_private.patient_links(user_id,patient_record_id) WHERE state='verified' AND revoked_at IS NULL;
-- No patient ID backfill from auth.users: identity ownership must be verified independently.
ALTER TABLE public.mq_tickets ADD COLUMN patient_record_id uuid REFERENCES mediqueue_private.patient_records(id);
CREATE INDEX mq_tickets_patient_record ON public.mq_tickets(patient_record_id) WHERE patient_record_id IS NOT NULL;
CREATE TABLE mediqueue_private.access_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid,
 operation text NOT NULL, allowed boolean NOT NULL, resource_id uuid,
 happened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mediqueue_private.identity_link_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, link_id uuid NOT NULL,
 operation text NOT NULL, state text NOT NULL, happened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mediqueue_private.policy_change_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, db_principal text NOT NULL,
 entity text NOT NULL, operation text NOT NULL, record_key text NOT NULL,
 happened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION mediqueue_private.audit_policy_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
 IF TG_OP='DELETE' THEN j:=to_jsonb(OLD); ELSE j:=to_jsonb(NEW); END IF;
 INSERT INTO mediqueue_private.policy_change_audit(actor_id,db_principal,entity,operation,record_key)
 VALUES(auth.uid(),session_user,TG_TABLE_NAME,TG_OP,coalesce(j->>'id',j->>'assignment_id',j->>'department_code','unknown'));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER facility_scope_audit AFTER INSERT OR UPDATE OR DELETE ON mediqueue_private.facilities FOR EACH ROW EXECUTE FUNCTION mediqueue_private.audit_policy_change();
CREATE TRIGGER department_scope_audit AFTER INSERT OR UPDATE OR DELETE ON mediqueue_private.department_facilities FOR EACH ROW EXECUTE FUNCTION mediqueue_private.audit_policy_change();
CREATE TRIGGER assignment_task_audit AFTER INSERT OR UPDATE OR DELETE ON mediqueue_private.assignment_tasks FOR EACH ROW EXECUTE FUNCTION mediqueue_private.audit_policy_change();
CREATE FUNCTION mediqueue_private.audit_patient_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO mediqueue_private.identity_link_audit(actor_id,link_id,operation,state)
 VALUES(auth.uid(),NEW.id,TG_OP,NEW.state);
 RETURN NEW;
END $$;
CREATE TRIGGER patient_link_audit AFTER INSERT OR UPDATE ON mediqueue_private.patient_links FOR EACH ROW EXECUTE FUNCTION mediqueue_private.audit_patient_link();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['facilities','department_facilities','assignment_tasks','patient_records','patient_links','access_decisions','identity_link_audit','policy_change_audit'] LOOP
 EXECUTE format('ALTER TABLE mediqueue_private.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON mediqueue_private.%I FROM PUBLIC,anon,authenticated',t);
END LOOP; END $$;
-- JWT is verified by Auth gateway; live DB session and email checked again. No user_metadata authorization.
CREATE FUNCTION mediqueue_private.session_ok(p_aal2 boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 AND (NOT p_aal2 OR auth.jwt()->>'aal'='aal2')
 AND EXISTS(SELECT 1 FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id
 WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
 AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>statement_timestamp()))
$$;
CREATE FUNCTION mediqueue_private.can_task_v2(p_task text,p_facility uuid,p_department text,p_room text DEFAULT NULL,p_assignment uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT mediqueue_private.session_ok(true) AND EXISTS(
 SELECT 1 FROM public.mq_staff_assignments a
 JOIN public.mq_profiles p ON p.id=a.user_id AND p.role='staff'
 JOIN mediqueue_private.assignment_tasks t ON t.assignment_id=a.id AND t.task=p_task
 JOIN mediqueue_private.department_facilities d ON d.department_code=a.department_code AND d.facility_id=p_facility
 JOIN mediqueue_private.facilities f ON f.id=d.facility_id AND f.active
 WHERE a.user_id=auth.uid() AND (p_assignment IS NULL OR a.id=p_assignment) AND a.active AND statement_timestamp()>=a.valid_from AND statement_timestamp()<a.valid_to
 AND a.department_code=p_department
 AND (a.room_id IS NULL OR (p_room IS NOT NULL AND a.room_id=p_room))
 AND (p_room IS NULL OR EXISTS(SELECT 1 FROM public.mq_rooms r WHERE r.id=p_room AND r.department_code=p_department))
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
CREATE FUNCTION mediqueue_private.patient_scope(p_record uuid,p_scope text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT mediqueue_private.session_ok(false) AND EXISTS(SELECT 1 FROM mediqueue_private.patient_links l JOIN mediqueue_private.patient_records r ON r.id=l.patient_record_id
 WHERE l.user_id=auth.uid() AND l.patient_record_id=p_record AND r.active
 AND l.state='verified' AND l.revoked_at IS NULL AND p_scope=ANY(l.scopes)
 AND statement_timestamp()>=l.valid_from AND statement_timestamp()<l.valid_to)
$$;
-- Audited envelope: denied requests return errors as JSON rather than raise/rollback the audit row.
CREATE FUNCTION mediqueue_private.patient_profiles_v2() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ok boolean; payload jsonb; rid uuid:=gen_random_uuid();
BEGIN
 ok:=mediqueue_private.session_ok(false);
 INSERT INTO mediqueue_private.access_decisions(id,actor_id,operation,allowed) VALUES(rid,auth.uid(),'patient.profiles',ok);
 IF NOT ok THEN RETURN jsonb_build_object('ok',false,'code','ACCESS_DENIED','request_id',rid); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('patient_record_id',r.id,'label',r.label,'relationship',l.relationship,'scopes',l.scopes,'valid_to',l.valid_to)),'[]'::jsonb) INTO payload
 FROM mediqueue_private.patient_links l JOIN mediqueue_private.patient_records r ON r.id=l.patient_record_id
 WHERE l.user_id=auth.uid() AND mediqueue_private.patient_scope(r.id,'profile.read') AND l.state='verified' AND l.revoked_at IS NULL AND statement_timestamp()>=l.valid_from AND statement_timestamp()<l.valid_to;
 RETURN jsonb_build_object('ok',true,'version',2,'request_id',rid,'data',payload);
END $$;
CREATE FUNCTION public.mq_patient_profiles_v2() RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT mediqueue_private.patient_profiles_v2() $$;
CREATE FUNCTION mediqueue_private.dashboard_v2(p_assignment uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.mq_staff_assignments; f uuid; allowed boolean; payload jsonb; rid uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO a FROM public.mq_staff_assignments WHERE id=p_assignment AND user_id=auth.uid();
 SELECT facility_id INTO f FROM mediqueue_private.department_facilities WHERE department_code=a.department_code;
 allowed:=coalesce(mediqueue_private.can_task_v2('read',f,a.department_code,a.room_id,a.id),false);
 INSERT INTO mediqueue_private.access_decisions(id,actor_id,operation,allowed,resource_id) VALUES(rid,auth.uid(),'dashboard.queue',allowed,p_assignment);
 IF NOT allowed THEN RETURN jsonb_build_object('ok',false,'code','ACCESS_DENIED','request_id',rid); END IF;
 SELECT jsonb_build_object('waiting',count(*) FILTER(WHERE status='WAITING'),'called',count(*) FILTER(WHERE status='CALLED'),'serving',count(*) FILTER(WHERE status='SERVING'),'completed',count(*) FILTER(WHERE status='COMPLETED')) INTO payload
 FROM public.mq_tickets WHERE department_code=a.department_code AND (a.room_id IS NULL OR room_id=a.room_id) AND date_key=(statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 RETURN jsonb_build_object('ok',true,'version',2,'request_id',rid,'assignment_id',a.id,'job_title',a.job_title,'facility_id',f,'department_code',a.department_code,'room_id',a.room_id,'valid_until',a.valid_to,'data',payload);
END $$;
CREATE FUNCTION public.mq_dashboard_v2(p_assignment uuid) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT mediqueue_private.dashboard_v2(p_assignment) $$;
REVOKE ALL ON FUNCTION mediqueue_private.audit_policy_change(),mediqueue_private.audit_patient_link(),mediqueue_private.session_ok(boolean),mediqueue_private.can_task_v2(text,uuid,text,text,uuid),mediqueue_private.patient_scope(uuid,text),mediqueue_private.patient_profiles_v2(),mediqueue_private.dashboard_v2(uuid),public.mq_patient_profiles_v2(),public.mq_dashboard_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mq_patient_profiles_v2(),public.mq_dashboard_v2(uuid),mediqueue_private.patient_profiles_v2(),mediqueue_private.dashboard_v2(uuid) TO authenticated;
-- Legacy RLS/RPC remain unchanged in foundation. V2 is NOT an enforcement upgrade for old endpoints yet.
