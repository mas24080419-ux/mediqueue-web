SET check_function_bodies=false;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA mediqueue_private;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz); CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$; GRANT USAGE ON SCHEMA public,auth,mediqueue_private TO authenticated,anon;
CREATE TABLE mediqueue_private.assignment_audit("id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,"actor_id" uuid,"entity" text NOT NULL,"operation" text NOT NULL,"record_id" text NOT NULL,"happened_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE mediqueue_private.daily_counters("department_code" text NOT NULL,"date_key" date NOT NULL,"last_number" integer NOT NULL);
CREATE TABLE mediqueue_private.department_events("id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,"department_code" text NOT NULL,"actor_id" uuid NOT NULL,"action" text NOT NULL,"happened_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE mediqueue_private.hospital_admin_grants("user_id" uuid NOT NULL,"active" boolean DEFAULT true NOT NULL,"granted_by" uuid,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.mq_audit_events("id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,"ticket_id" bigint NOT NULL,"department_code" text NOT NULL,"actor_id" uuid NOT NULL,"action" text NOT NULL,"happened_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.mq_department_live("department_code" text NOT NULL,"date_key" date NOT NULL,"waiting_count" integer DEFAULT 0 NOT NULL,"current_label" text,"current_status" text,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"is_paused" boolean DEFAULT false NOT NULL,"pause_reason" text,"paused_at" timestamp with time zone);
CREATE TABLE public.mq_departments("code" text NOT NULL,"title" text NOT NULL,"room" text NOT NULL,"prefix" text NOT NULL);
CREATE TABLE public.mq_profiles("id" uuid NOT NULL,"display_name" text DEFAULT 'Người dùng'::text NOT NULL,"role" text DEFAULT 'patient'::text NOT NULL,"department_code" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.mq_push_outbox("id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,"user_id" uuid NOT NULL,"ticket_id" bigint NOT NULL,"kind" text NOT NULL,"status" text DEFAULT 'PENDING'::text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"processed_at" timestamp with time zone,"attempts" integer DEFAULT 0 NOT NULL,"last_error" text);
CREATE TABLE public.mq_push_tokens("token" text NOT NULL,"user_id" uuid NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.mq_room_live("room_id" text NOT NULL,"department_code" text NOT NULL,"date_key" date NOT NULL,"waiting_count" integer DEFAULT 0 NOT NULL,"current_label" text,"current_status" text,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.mq_rooms("id" text NOT NULL,"department_code" text NOT NULL,"title" text NOT NULL,"is_available" boolean DEFAULT true NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.mq_staff_assignments("id" uuid DEFAULT gen_random_uuid() NOT NULL,"user_id" uuid NOT NULL,"job_title" text NOT NULL,"department_code" text NOT NULL,"room_id" text,"valid_from" timestamp with time zone NOT NULL,"valid_to" timestamp with time zone NOT NULL,"active" boolean DEFAULT true NOT NULL,"granted_by" uuid,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.mq_tickets("id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,"date_key" date NOT NULL,"department_code" text NOT NULL,"queue_number" integer NOT NULL,"patient_id" uuid NOT NULL,"patient_name" text NOT NULL,"request_key" uuid NOT NULL,"is_priority" boolean DEFAULT false NOT NULL,"status" text DEFAULT 'WAITING'::text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"called_at" timestamp with time zone,"started_at" timestamp with time zone,"completed_at" timestamp with time zone,"recall_count" integer DEFAULT 0 NOT NULL,"qr_nonce" uuid DEFAULT gen_random_uuid() NOT NULL,"checked_in_at" timestamp with time zone,"room_id" text);
ALTER TABLE public.mq_staff_assignments ADD CONSTRAINT "mq_staff_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE mediqueue_private.hospital_admin_grants ADD CONSTRAINT "hospital_admin_grants_pkey" PRIMARY KEY (user_id);
ALTER TABLE public.mq_departments ADD CONSTRAINT "mq_departments_pkey" PRIMARY KEY (code);
ALTER TABLE public.mq_profiles ADD CONSTRAINT "mq_profiles_pkey" PRIMARY KEY (id);
ALTER TABLE mediqueue_private.daily_counters ADD CONSTRAINT "daily_counters_pkey" PRIMARY KEY (department_code, date_key);
ALTER TABLE mediqueue_private.assignment_audit ADD CONSTRAINT "assignment_audit_pkey" PRIMARY KEY (id);
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_pkey" PRIMARY KEY (id);
ALTER TABLE public.mq_department_live ADD CONSTRAINT "mq_department_live_pkey" PRIMARY KEY (department_code);
ALTER TABLE public.mq_audit_events ADD CONSTRAINT "mq_audit_events_pkey" PRIMARY KEY (id);
ALTER TABLE mediqueue_private.department_events ADD CONSTRAINT "department_events_pkey" PRIMARY KEY (id);
ALTER TABLE public.mq_rooms ADD CONSTRAINT "mq_rooms_pkey" PRIMARY KEY (id);
ALTER TABLE public.mq_room_live ADD CONSTRAINT "mq_room_live_pkey" PRIMARY KEY (room_id);
ALTER TABLE public.mq_push_tokens ADD CONSTRAINT "mq_push_tokens_pkey" PRIMARY KEY (token);
ALTER TABLE public.mq_push_outbox ADD CONSTRAINT "mq_push_outbox_pkey" PRIMARY KEY (id);
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_department_code_date_key_queue_number_key" UNIQUE (department_code, date_key, queue_number);
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_patient_id_request_key_key" UNIQUE (patient_id, request_key);
ALTER TABLE public.mq_rooms ADD CONSTRAINT "mq_rooms_id_department_code_key" UNIQUE (id, department_code);
ALTER TABLE public.mq_push_outbox ADD CONSTRAINT "mq_push_outbox_ticket_id_kind_key" UNIQUE (ticket_id, kind);
ALTER TABLE public.mq_staff_assignments ADD CONSTRAINT "mq_staff_assignments_check" CHECK ((valid_to > valid_from));
ALTER TABLE public.mq_staff_assignments ADD CONSTRAINT "mq_staff_assignments_check1" CHECK (((job_title <> 'doctor'::text) OR (room_id IS NOT NULL)));
ALTER TABLE public.mq_departments ADD CONSTRAINT "mq_departments_code_check" CHECK ((code ~ '^[A-Z_]{2,30}$'::text));
ALTER TABLE public.mq_departments ADD CONSTRAINT "mq_departments_prefix_check" CHECK (((char_length(prefix) >= 1) AND (char_length(prefix) <= 2)));
ALTER TABLE public.mq_profiles ADD CONSTRAINT "mq_profiles_role_check" CHECK ((role = ANY (ARRAY['patient'::text, 'staff'::text, 'admin'::text])));
ALTER TABLE public.mq_profiles ADD CONSTRAINT "staff_has_department" CHECK (((role <> 'staff'::text) OR (department_code IS NOT NULL)));
ALTER TABLE mediqueue_private.daily_counters ADD CONSTRAINT "daily_counters_last_number_check" CHECK ((last_number > 0));
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_queue_number_check" CHECK ((queue_number > 0));
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_patient_name_check" CHECK (((char_length(btrim(patient_name)) >= 2) AND (char_length(btrim(patient_name)) <= 60)));
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_status_check" CHECK ((status = ANY (ARRAY['WAITING'::text, 'CALLED'::text, 'SERVING'::text, 'COMPLETED'::text, 'SKIPPED'::text])));
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_recall_count_check" CHECK ((recall_count >= 0));
ALTER TABLE mediqueue_private.department_events ADD CONSTRAINT "department_events_action_check" CHECK ((action = ANY (ARRAY['PAUSE'::text, 'RESUME'::text])));
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_active_requires_room" CHECK (((status <> ALL (ARRAY['CALLED'::text, 'SERVING'::text])) OR (room_id IS NOT NULL)));
ALTER TABLE public.mq_push_outbox ADD CONSTRAINT "mq_push_outbox_kind_check" CHECK ((kind = ANY (ARRAY['CALLED'::text, 'NEAR_TURN'::text])));
ALTER TABLE public.mq_push_outbox ADD CONSTRAINT "mq_push_outbox_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENDING'::text, 'SENT'::text, 'FAILED'::text])));
ALTER TABLE public.mq_staff_assignments ADD CONSTRAINT "mq_staff_assignments_job_title_check" CHECK ((job_title = ANY (ARRAY['reception'::text, 'doctor'::text, 'nurse'::text, 'laboratory'::text, 'imaging'::text, 'pharmacy'::text, 'cashier'::text, 'department_lead'::text])));
ALTER TABLE public.mq_staff_assignments ADD CONSTRAINT "mq_staff_assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES mq_profiles(id);
ALTER TABLE public.mq_staff_assignments ADD CONSTRAINT "mq_staff_assignments_department_code_fkey" FOREIGN KEY (department_code) REFERENCES mq_departments(code);
ALTER TABLE public.mq_staff_assignments ADD CONSTRAINT "mq_staff_assignments_room_id_fkey" FOREIGN KEY (room_id) REFERENCES mq_rooms(id);
ALTER TABLE public.mq_staff_assignments ADD CONSTRAINT "mq_staff_assignments_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES mq_profiles(id);
ALTER TABLE mediqueue_private.hospital_admin_grants ADD CONSTRAINT "hospital_admin_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES mq_profiles(id);
ALTER TABLE mediqueue_private.hospital_admin_grants ADD CONSTRAINT "hospital_admin_grants_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES mq_profiles(id);
ALTER TABLE public.mq_profiles ADD CONSTRAINT "mq_profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mq_profiles ADD CONSTRAINT "mq_profiles_department_code_fkey" FOREIGN KEY (department_code) REFERENCES mq_departments(code);
ALTER TABLE mediqueue_private.daily_counters ADD CONSTRAINT "daily_counters_department_code_fkey" FOREIGN KEY (department_code) REFERENCES mq_departments(code);
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_department_code_fkey" FOREIGN KEY (department_code) REFERENCES mq_departments(code);
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mq_department_live ADD CONSTRAINT "mq_department_live_department_code_fkey" FOREIGN KEY (department_code) REFERENCES mq_departments(code);
ALTER TABLE mediqueue_private.department_events ADD CONSTRAINT "department_events_department_code_fkey" FOREIGN KEY (department_code) REFERENCES mq_departments(code);
ALTER TABLE public.mq_rooms ADD CONSTRAINT "mq_rooms_department_code_fkey" FOREIGN KEY (department_code) REFERENCES mq_departments(code);
ALTER TABLE public.mq_tickets ADD CONSTRAINT "mq_tickets_room_id_fkey" FOREIGN KEY (room_id) REFERENCES mq_rooms(id);
ALTER TABLE public.mq_room_live ADD CONSTRAINT "mq_room_live_room_id_fkey" FOREIGN KEY (room_id) REFERENCES mq_rooms(id);
ALTER TABLE public.mq_room_live ADD CONSTRAINT "mq_room_live_department_code_fkey" FOREIGN KEY (department_code) REFERENCES mq_departments(code);
ALTER TABLE public.mq_push_tokens ADD CONSTRAINT "mq_push_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mq_push_outbox ADD CONSTRAINT "mq_push_outbox_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mq_push_outbox ADD CONSTRAINT "mq_push_outbox_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES mq_tickets(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION mediqueue_private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.mq_profiles(id,display_name,role)
  VALUES (NEW.id, 'Người dùng', 'patient');
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.on_ticket_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM mediqueue_private.refresh_live(NEW.department_code);
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.refresh_live(p_department text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_date date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
        v_waiting int; v_active int; v_label text; v_status text;
BEGIN
 SELECT count(*)::int INTO v_waiting
 FROM public.mq_tickets AS t
 WHERE t.date_key=v_date AND t.department_code=p_department AND t.status='WAITING';
 SELECT count(*)::int INTO v_active
 FROM public.mq_tickets AS t
 WHERE t.date_key=v_date AND t.department_code=p_department AND t.status IN ('CALLED','SERVING');
 IF v_active=1 THEN
  SELECT x.prefix || lpad(t.queue_number::text,3,'0'), t.status
    INTO v_label,v_status FROM public.mq_tickets AS t
    JOIN public.mq_departments AS x ON x.code=t.department_code
    WHERE t.date_key=v_date AND t.department_code=p_department
    AND t.status IN ('CALLED','SERVING') LIMIT 1;
 ELSIF v_active>1 THEN v_label:=NULL; v_status:='MULTI_ROOM';
 ELSE v_label:=NULL; v_status:=NULL; END IF;
 INSERT INTO public.mq_department_live(department_code,date_key,waiting_count,current_label,current_status,updated_at)
 VALUES(p_department,v_date,v_waiting,v_label,v_status,now())
 ON CONFLICT(department_code) DO UPDATE
 SET date_key=excluded.date_key,waiting_count=excluded.waiting_count,
 current_label=excluded.current_label,current_status=excluded.current_status,
 updated_at=excluded.updated_at;
 PERFORM mediqueue_private.refresh_room_live(p_department);
END $function$
;
CREATE OR REPLACE FUNCTION public.mq_call_next(p_department text)
 RETURNS mq_tickets
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT * FROM mediqueue_private.call_next(p_department);
$function$
;
CREATE OR REPLACE FUNCTION public.mq_change_ticket(p_ticket_id bigint, p_action text, p_priority boolean DEFAULT NULL::boolean)
 RETURNS mq_tickets
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT * FROM mediqueue_private.change_ticket(p_ticket_id,p_action,p_priority);
$function$
;
CREATE OR REPLACE FUNCTION public.mq_my_wait_info(p_ticket_id bigint)
 RETURNS TABLE(queue_position integer, estimate_minutes integer)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT * FROM mediqueue_private.my_wait_info(p_ticket_id);
$function$
;
CREATE OR REPLACE FUNCTION public.mq_my_access()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT mediqueue_private.my_access() $function$
;
CREATE OR REPLACE FUNCTION public.mq_hospital_overview()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT mediqueue_private.hospital_overview() $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.validate_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.mq_profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=NEW.user_id AND p.role='staff' AND u.email_confirmed_at IS NOT NULL) THEN
 RAISE EXCEPTION 'VERIFIED_STAFF_ACCOUNT_REQUIRED'; END IF;
 IF NEW.room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.mq_rooms r WHERE r.id=NEW.room_id AND r.department_code=NEW.department_code) THEN RAISE EXCEPTION 'ROOM_DEPARTMENT_MISMATCH'; END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.mq_cancel_my_ticket(p_ticket_id bigint)
 RETURNS mq_tickets
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT * FROM mediqueue_private.cancel_my_ticket(p_ticket_id) $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.audit_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO mediqueue_private.assignment_audit(actor_id,entity,operation,record_id) VALUES(auth.uid(),TG_TABLE_NAME,TG_OP,coalesce(to_jsonb(NEW)->>'id',to_jsonb(NEW)->>'user_id',to_jsonb(OLD)->>'id',to_jsonb(OLD)->>'user_id'));
 RETURN coalesce(NEW,OLD);
END $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.is_hospital_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT coalesce(auth.jwt()->>'aal','')='aal2' AND EXISTS(SELECT 1 FROM mediqueue_private.hospital_admin_grants g JOIN public.mq_profiles p ON p.id=g.user_id JOIN auth.users u ON u.id=p.id WHERE g.user_id=auth.uid() AND g.active AND p.role='admin' AND u.email_confirmed_at IS NOT NULL)
$function$
;
CREATE OR REPLACE FUNCTION public.mq_recall_ticket(p_ticket_id bigint)
 RETURNS mq_tickets
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT * FROM mediqueue_private.recall_ticket(p_ticket_id) $function$
;
CREATE OR REPLACE FUNCTION public.mq_set_department_pause(p_department text, p_paused boolean, p_reason text)
 RETURNS mq_department_live
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT * FROM mediqueue_private.set_department_pause(p_department,p_paused,p_reason) $function$
;
CREATE OR REPLACE FUNCTION public.mq_issue_ticket(p_department text, p_name text, p_request_key uuid)
 RETURNS mq_tickets
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT * FROM mediqueue_private.issue_ticket(p_department,p_name,p_request_key);
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.my_wait_info(p_ticket_id bigint)
 RETURNS TABLE(queue_position integer, estimate_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE mine public.mq_tickets; ahead int; active int; avg_minutes int;
BEGIN
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
CREATE OR REPLACE FUNCTION mediqueue_private.is_staff_for(p_department text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.mq_staff_assignments a JOIN public.mq_profiles p ON p.id=a.user_id WHERE a.user_id=auth.uid() AND p.role='staff' AND a.department_code=p_department AND a.active AND now()>=a.valid_from AND now()<a.valid_to)
$function$
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
CREATE OR REPLACE FUNCTION mediqueue_private.call_next(p_department text)
 RETURNS mq_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RAISE EXCEPTION 'USE_ROOM_BASED_CALL_API';
END $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.issue_ticket(p_department text, p_name text, p_request_key uuid)
 RETURNS mq_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_user uuid := auth.uid();
 d date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 n int; existing public.mq_tickets; output_row public.mq_tickets;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 -- Public signup profiles always have the patient role; staff/admin accounts are not booking accounts.
 IF NOT EXISTS (SELECT 1 FROM public.mq_profiles p WHERE p.id=v_user AND p.role='patient')
 THEN RAISE EXCEPTION 'PATIENT_ACCOUNT_REQUIRED'; END IF;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'REQUEST_KEY_REQUIRED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.mq_departments WHERE code=p_department)
 THEN RAISE EXCEPTION 'INVALID_DEPARTMENT'; END IF;
 IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 2 AND 60
 THEN RAISE EXCEPTION 'INVALID_DISPLAY_NAME'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
 SELECT * INTO existing FROM public.mq_tickets WHERE patient_id=v_user AND request_key=p_request_key;
 IF FOUND THEN RETURN existing; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_department || d::text,1));
 IF EXISTS (SELECT 1 FROM public.mq_department_live WHERE department_code=p_department AND is_paused)
 THEN RAISE EXCEPTION 'DEPARTMENT_PAUSED'; END IF;
 IF (SELECT count(*) FROM public.mq_tickets WHERE patient_id=v_user AND date_key=d AND status IN ('WAITING','CALLED','SERVING'))>=3
 THEN RAISE EXCEPTION 'ACTIVE_TICKET_LIMIT_REACHED'; END IF;
 INSERT INTO mediqueue_private.daily_counters AS counter(department_code,date_key,last_number)
 VALUES(p_department,d,1)
 ON CONFLICT(department_code,date_key) DO UPDATE SET last_number=counter.last_number+1 RETURNING last_number INTO n;
 INSERT INTO public.mq_tickets(date_key,department_code,queue_number,patient_id,patient_name,request_key)
 VALUES(d,p_department,n,v_user,btrim(p_name),p_request_key) RETURNING * INTO output_row;
 RETURN output_row;
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
CREATE OR REPLACE FUNCTION mediqueue_private.enqueue_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='WAITING' AND NEW.status='CALLED' THEN
   INSERT INTO public.mq_push_outbox(user_id,ticket_id,kind) VALUES(NEW.patient_id,NEW.id,'CALLED')
   ON CONFLICT(ticket_id,kind) DO NOTHING;
 END IF;
 IF NEW.room_id IS NOT NULL AND NEW.checked_in_at IS NOT NULL
    AND NEW.date_key=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
   INSERT INTO public.mq_push_outbox(user_id,ticket_id,kind)
   SELECT x.patient_id,x.id,'NEAR_TURN' FROM (
     SELECT t.id,t.patient_id,t.is_priority,t.queue_number
     FROM public.mq_tickets t
     WHERE t.room_id=NEW.room_id AND t.date_key=NEW.date_key
       AND t.status='WAITING' AND t.checked_in_at IS NOT NULL
     ORDER BY t.is_priority DESC,t.queue_number ASC LIMIT 3
   ) x
   ON CONFLICT(ticket_id,kind) DO NOTHING;
 END IF;
 RETURN NEW;
END $function$
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
CREATE OR REPLACE FUNCTION mediqueue_private.require_task(p_task text, p_department text, p_room text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN IF NOT mediqueue_private.can_task(p_task,p_department,p_room) THEN RAISE EXCEPTION 'ASSIGNMENT_ACCESS_DENIED' USING ERRCODE='42501'; END IF; END $function$
;
CREATE OR REPLACE FUNCTION public.mq_checkin_qr(p_nonce uuid)
 RETURNS mq_tickets
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT * FROM mediqueue_private.checkin_qr(p_nonce) $function$
;
CREATE OR REPLACE FUNCTION public.mq_assign_room(p_ticket_id bigint, p_room_id text)
 RETURNS mq_tickets
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT * FROM mediqueue_private.assign_room(p_ticket_id,p_room_id) $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.refresh_room_live(p_department text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 INSERT INTO public.mq_room_live(room_id,department_code,date_key,waiting_count,current_label,current_status,updated_at)
 SELECT r.id,r.department_code,d,
   (SELECT count(*)::int FROM public.mq_tickets t
    WHERE t.date_key=d AND t.room_id=r.id AND t.status='WAITING'),
   (SELECT x.prefix || lpad(t.queue_number::text,3,'0')
      FROM public.mq_tickets t JOIN public.mq_departments x ON x.code=t.department_code
     WHERE t.date_key=d AND t.room_id=r.id AND t.status IN ('CALLED','SERVING')
     LIMIT 1),
   (SELECT t.status FROM public.mq_tickets t WHERE t.date_key=d AND t.room_id=r.id
       AND t.status IN ('CALLED','SERVING') LIMIT 1),now()
 FROM public.mq_rooms r WHERE r.department_code=p_department
 ON CONFLICT(room_id) DO UPDATE SET
 date_key=excluded.date_key,waiting_count=excluded.waiting_count,
 current_label=excluded.current_label,current_status=excluded.current_status,updated_at=excluded.updated_at;
END $function$
;
CREATE OR REPLACE FUNCTION public.mq_call_next_room(p_room_id text)
 RETURNS mq_tickets
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT * FROM mediqueue_private.call_next_room(p_room_id);
$function$
;
CREATE OR REPLACE FUNCTION public.mq_claim_push_batch(p_limit integer DEFAULT 20)
 RETURNS SETOF mq_push_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'SERVER_ONLY'; END IF;
 RETURN QUERY
 WITH chosen AS (
   SELECT id FROM public.mq_push_outbox
   WHERE (status='PENDING' OR (status='SENDING' AND processed_at < now()-interval '15 minutes'))
   AND attempts<4 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),100)
 )
 UPDATE public.mq_push_outbox b SET status='SENDING',attempts=attempts+1,processed_at=now()
 FROM chosen WHERE b.id=chosen.id RETURNING b.*;
END $function$
;
CREATE OR REPLACE FUNCTION public.mq_register_push_token(p_token text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT mediqueue_private.register_push_token(p_token);
$function$
;
CREATE OR REPLACE FUNCTION public.mq_unregister_push_token(p_token text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT mediqueue_private.unregister_push_token(p_token);
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.register_push_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF p_token IS NULL OR length(p_token) NOT BETWEEN 30 AND 4096 OR p_token !~ '^[A-Za-z0-9:._~-]+$'
 THEN RAISE EXCEPTION 'INVALID_FCM_TOKEN'; END IF;
 INSERT INTO public.mq_push_tokens(token,user_id) VALUES(p_token,auth.uid())
 ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,updated_at=now();
END $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.unregister_push_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 DELETE FROM public.mq_push_tokens WHERE token=p_token AND user_id=auth.uid();
END $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.can_task(p_task text, p_department text, p_room text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.my_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.mq_profiles; result jsonb; super boolean;
BEGIN
 SELECT * INTO p FROM public.mq_profiles WHERE id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 super:=mediqueue_private.is_hospital_admin();
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'job_title',a.job_title,'department_code',a.department_code,'room_id',a.room_id,'valid_from',a.valid_from,'valid_to',a.valid_to)), '[]'::jsonb) INTO result
 FROM public.mq_staff_assignments a WHERE a.user_id=p.id AND p.role='staff' AND a.active AND now()>=a.valid_from AND now()<a.valid_to;
 RETURN jsonb_build_object('user_id',p.id,'role',p.role,'is_hospital_admin',super,'assignments',result,'state',CASE WHEN p.role='patient' THEN 'patient' WHEN super THEN 'hospital_admin' WHEN jsonb_array_length(result)>0 THEN 'assigned' ELSE 'awaiting_provisioning' END);
END $function$
;
CREATE OR REPLACE FUNCTION mediqueue_private.hospital_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT mediqueue_private.is_hospital_admin() THEN RAISE EXCEPTION 'HOSPITAL_ADMIN_MFA_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('departments',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM public.mq_departments d),'rooms',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.mq_rooms r),'live',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM public.mq_department_live l),'roomLive',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM public.mq_room_live l),'assignments_count',(SELECT count(*) FROM public.mq_staff_assignments WHERE active AND now()>=valid_from AND now()<valid_to),'audit_count',(SELECT count(*) FROM mediqueue_private.assignment_audit)) INTO result;
 RETURN result;
END $function$
;
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
ALTER TABLE mediqueue_private.assignment_audit ENABLE ROW LEVEL SECURITY; REVOKE ALL ON mediqueue_private.assignment_audit FROM PUBLIC,anon,authenticated;
ALTER TABLE mediqueue_private.daily_counters ENABLE ROW LEVEL SECURITY; REVOKE ALL ON mediqueue_private.daily_counters FROM PUBLIC,anon,authenticated;
ALTER TABLE mediqueue_private.department_events ENABLE ROW LEVEL SECURITY; REVOKE ALL ON mediqueue_private.department_events FROM PUBLIC,anon,authenticated;
ALTER TABLE mediqueue_private.hospital_admin_grants ENABLE ROW LEVEL SECURITY; REVOKE ALL ON mediqueue_private.hospital_admin_grants FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_audit_events ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_audit_events FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_department_live ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_department_live FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_departments ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_departments FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_profiles ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_profiles FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_push_outbox ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_push_outbox FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_push_tokens ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_push_tokens FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_room_live ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_room_live FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_rooms ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_rooms FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_staff_assignments ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_staff_assignments FROM PUBLIC,anon,authenticated;
ALTER TABLE public.mq_tickets ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.mq_tickets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mq_department_live TO authenticated;
GRANT SELECT ON public.mq_rooms TO authenticated;
GRANT SELECT ON public.mq_departments TO authenticated;
GRANT SELECT ON public.mq_profiles TO authenticated;
GRANT SELECT ON public.mq_audit_events TO authenticated;
GRANT SELECT ON public.mq_tickets TO authenticated;
GRANT SELECT ON public.mq_room_live TO authenticated;
GRANT SELECT ON public.mq_staff_assignments TO authenticated;
CREATE INDEX mq_audit_dept_idx ON public.mq_audit_events USING btree (department_code, happened_at DESC);
CREATE INDEX mq_tickets_day_dept_idx ON public.mq_tickets USING btree (date_key, department_code, status, queue_number);
CREATE INDEX mq_tickets_patient_idx ON public.mq_tickets USING btree (patient_id, date_key DESC);
CREATE INDEX mq_tickets_room_status ON public.mq_tickets USING btree (room_id, date_key, status);
CREATE INDEX mq_push_pending_idx ON public.mq_push_outbox USING btree (status, created_at) WHERE (status = 'PENDING'::text);
CREATE INDEX mq_push_user_idx ON public.mq_push_tokens USING btree (user_id);
CREATE INDEX mq_assignment_user_shift ON public.mq_staff_assignments USING btree (user_id, valid_from, valid_to);
CREATE TRIGGER mq_ticket_live AFTER INSERT OR UPDATE ON public.mq_tickets FOR EACH ROW EXECUTE FUNCTION mediqueue_private.on_ticket_change();
CREATE TRIGGER mq_enqueue_push AFTER INSERT OR UPDATE ON public.mq_tickets FOR EACH ROW EXECUTE FUNCTION mediqueue_private.enqueue_push();
CREATE TRIGGER mq_validate_assignment BEFORE INSERT OR UPDATE ON public.mq_staff_assignments FOR EACH ROW EXECUTE FUNCTION mediqueue_private.validate_assignment();
CREATE TRIGGER mq_assignment_audit AFTER INSERT OR DELETE OR UPDATE ON public.mq_staff_assignments FOR EACH ROW EXECUTE FUNCTION mediqueue_private.audit_assignment();
CREATE TRIGGER mq_admin_grant_audit AFTER INSERT OR DELETE OR UPDATE ON mediqueue_private.hospital_admin_grants FOR EACH ROW EXECUTE FUNCTION mediqueue_private.audit_assignment();
CREATE POLICY mq_live_all ON public.mq_department_live FOR SELECT TO authenticated USING (true);
CREATE POLICY mq_rooms_read ON public.mq_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY mq_departments_read ON public.mq_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY mq_profiles_self ON public.mq_profiles FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY mq_audit_staff ON public.mq_audit_events FOR SELECT TO authenticated USING (mediqueue_private.can_task('audit'::text, department_code, NULL::text));
CREATE POLICY mq_tickets_scoped ON public.mq_tickets FOR SELECT TO authenticated USING ((((patient_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM mq_profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'patient'::text))))) OR mediqueue_private.can_task('read'::text, department_code, room_id)));
CREATE POLICY mq_room_live_read ON public.mq_room_live FOR SELECT TO authenticated USING (true);
CREATE POLICY mq_assignment_self ON public.mq_staff_assignments FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
SET check_function_bodies=true;
