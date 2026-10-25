-- MediQueue V5 appointments. Stacked on PR #2 foundation.
-- REVIEW ONLY: do not run until RBAC/ABAC foundation is reviewed and deployed.
-- No clinicians, slots, patients, grants, fake prices or schedules are seeded.
CREATE TABLE mediqueue_private.v5_clinicians (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
 active boolean NOT NULL DEFAULT false
);
CREATE TABLE mediqueue_private.v5_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 facility_id uuid NOT NULL,
 department_code text NOT NULL,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 2 AND 150),
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 240),
 published boolean NOT NULL DEFAULT false,
 FOREIGN KEY(department_code,facility_id)
   REFERENCES mediqueue_private.department_facilities(department_code,facility_id)
);
CREATE TABLE mediqueue_private.v5_clinician_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 clinician_id uuid NOT NULL REFERENCES mediqueue_private.v5_clinicians(id),
 facility_id uuid NOT NULL,
 department_code text NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 published boolean NOT NULL DEFAULT false,
 CHECK(ends_at>starts_at),
 FOREIGN KEY(department_code,facility_id)
   REFERENCES mediqueue_private.department_facilities(department_code,facility_id)
);
CREATE TABLE mediqueue_private.v5_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 service_id uuid NOT NULL REFERENCES mediqueue_private.v5_services(id),
 shift_id uuid NOT NULL REFERENCES mediqueue_private.v5_clinician_shifts(id),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 open boolean NOT NULL DEFAULT false,
 CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '4 hours')
);
CREATE INDEX v5_slots_service_time ON mediqueue_private.v5_slots(service_id, starts_at)
 WHERE open;
CREATE TABLE mediqueue_private.v5_appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 patient_record_id uuid NOT NULL REFERENCES mediqueue_private.patient_records(id),
 booked_by uuid NOT NULL REFERENCES public.mq_profiles(id),
 slot_id uuid NOT NULL REFERENCES mediqueue_private.v5_slots(id),
 request_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN('CONFIRMED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 cancelled_at timestamptz,
 UNIQUE(booked_by,request_key)
);
CREATE UNIQUE INDEX v5_unique_confirmed_slot ON mediqueue_private.v5_appointments(slot_id)
 WHERE status='CONFIRMED';
CREATE INDEX v5_appointments_owner ON mediqueue_private.v5_appointments(booked_by,created_at DESC);
CREATE TABLE mediqueue_private.v5_enrollment_requests (
 user_id uuid NOT NULL REFERENCES public.mq_profiles(id),
 request_key uuid NOT NULL,
 patient_record_id uuid NOT NULL UNIQUE REFERENCES mediqueue_private.patient_records(id),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 PRIMARY KEY(user_id,request_key)
);
CREATE TABLE mediqueue_private.v5_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid,
 appointment_id uuid,
 operation text NOT NULL,
 outcome text NOT NULL,
 happened_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['v5_clinicians','v5_services','v5_clinician_shifts','v5_slots','v5_appointments','v5_enrollment_requests','v5_events'] LOOP
  EXECUTE format('ALTER TABLE mediqueue_private.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON mediqueue_private.%I FROM PUBLIC,anon,authenticated',name);
 END LOOP;
END $$;
REVOKE ALL ON SEQUENCE mediqueue_private.v5_events_id_seq FROM PUBLIC,anon,authenticated;

-- Publisher safety: no overlapping published slots for the same clinician,
-- no slots outside a verified roster, and no cross-facility service mixing.
CREATE FUNCTION mediqueue_private.v5_validate_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sh mediqueue_private.v5_clinician_shifts; svc mediqueue_private.v5_services;
BEGIN
 SELECT * INTO sh FROM mediqueue_private.v5_clinician_shifts WHERE id=NEW.shift_id;
 SELECT * INTO svc FROM mediqueue_private.v5_services WHERE id=NEW.service_id;
 IF NOT FOUND OR sh.id IS NULL OR svc.id IS NULL OR sh.facility_id<>svc.facility_id
    OR sh.department_code<>svc.department_code
    OR NEW.starts_at<sh.starts_at OR NEW.ends_at>sh.ends_at THEN
  RAISE EXCEPTION 'INVALID_SLOT_ROSTER' USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sh.clinician_id::text,426));
 IF NEW.open AND EXISTS(
   SELECT 1 FROM mediqueue_private.v5_slots other
   JOIN mediqueue_private.v5_clinician_shifts oshift ON oshift.id=other.shift_id
   WHERE other.id<>NEW.id AND other.open
     AND oshift.clinician_id=sh.clinician_id
     AND pg_catalog.tstzrange(other.starts_at,other.ends_at,'[)')
      && pg_catalog.tstzrange(NEW.starts_at,NEW.ends_at,'[)')
 ) THEN
  RAISE EXCEPTION 'CLINICIAN_SLOT_OVERLAP' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v5_guard_slot BEFORE INSERT OR UPDATE ON mediqueue_private.v5_slots
 FOR EACH ROW EXECUTE FUNCTION mediqueue_private.v5_validate_slot();

-- Real, verified session + patient role, not client metadata.
CREATE FUNCTION mediqueue_private.v5_patient_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT mediqueue_private.session_ok(false)
 AND EXISTS(SELECT 1 FROM public.mq_profiles p WHERE p.id=auth.uid() AND p.role='patient')
$$;
CREATE FUNCTION mediqueue_private.v5_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN NOT mediqueue_private.v5_patient_ok()
 THEN pg_catalog.jsonb_build_object('ok',false,'code','ACCESS_DENIED')
 ELSE pg_catalog.jsonb_build_object('ok',true,'data',coalesce((
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',s.id,'title',s.title,'department_code',s.department_code,
    'department_title',d.title,'facility_code',f.code,'duration_minutes',s.duration_minutes)
    ORDER BY f.code,d.title,s.title)
  FROM mediqueue_private.v5_services s
  JOIN mediqueue_private.facilities f ON f.id=s.facility_id AND f.active
  JOIN public.mq_departments d ON d.code=s.department_code
  JOIN mediqueue_private.department_facilities df
   ON df.facility_id=f.id AND df.department_code=s.department_code
  WHERE s.published
 ),'[]'::jsonb)) END
$$;
CREATE FUNCTION mediqueue_private.v5_open_slots(p_service_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE payload jsonb;
BEGIN
 IF NOT mediqueue_private.v5_patient_ok() THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ACCESS_DENIED');
 END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'id',r.id,'service_id',r.service_id,'starts_at',r.starts_at,
 'ends_at',r.ends_at,'clinician_name',r.display_name) ORDER BY r.starts_at,r.display_name),'[]'::jsonb)
 INTO payload FROM (
  SELECT sl.id,sl.service_id,sl.starts_at,sl.ends_at,c.display_name
  FROM mediqueue_private.v5_slots sl
  JOIN mediqueue_private.v5_services sv ON sv.id=sl.service_id AND sv.published
  JOIN mediqueue_private.facilities f ON f.id=sv.facility_id AND f.active
  JOIN mediqueue_private.v5_clinician_shifts sh ON sh.id=sl.shift_id AND sh.published
    AND sh.department_code=sv.department_code AND sh.facility_id=sv.facility_id
  JOIN mediqueue_private.v5_clinicians c ON c.id=sh.clinician_id AND c.active
  WHERE sl.service_id=p_service_id AND sl.open
    AND sl.starts_at>statement_timestamp()+interval '30 minutes'
    AND sl.starts_at<statement_timestamp()+interval '46 days'
    AND sl.starts_at>=sh.starts_at AND sl.ends_at<=sh.ends_at
    AND NOT EXISTS(SELECT 1 FROM mediqueue_private.v5_appointments a
      WHERE a.slot_id=sl.id AND a.status='CONFIRMED')
  ORDER BY sl.starts_at,c.display_name LIMIT 100
 ) r;
 RETURN pg_catalog.jsonb_build_object('ok',true,'data',payload);
END $$;

-- Intake requests are PENDING: a name and a login NEVER verify legal identity.
CREATE FUNCTION mediqueue_private.v5_request_self_profile(p_label text,p_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec uuid; existing uuid;
BEGIN
 IF NOT mediqueue_private.v5_patient_ok() OR p_request_key IS NULL
 OR char_length(btrim(coalesce(p_label,''))) NOT BETWEEN 2 AND 100 THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_REQUEST');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,533));
 SELECT e.patient_record_id INTO existing FROM mediqueue_private.v5_enrollment_requests e
  WHERE e.user_id=auth.uid() AND e.request_key=p_request_key;
 IF existing IS NOT NULL THEN
  RETURN pg_catalog.jsonb_build_object('ok',true,'status','PENDING','request_id',existing);
 END IF;
 IF (SELECT count(*) FROM mediqueue_private.patient_links l
    WHERE l.user_id=auth.uid() AND l.state='pending' AND l.relationship='self')>=2
 OR EXISTS(SELECT 1 FROM mediqueue_private.patient_links l
    WHERE l.user_id=auth.uid() AND l.state='verified' AND l.relationship='self'
      AND l.revoked_at IS NULL AND statement_timestamp()<l.valid_to) THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','EXISTING_PROFILE_OR_PENDING_LIMIT');
 END IF;
 INSERT INTO mediqueue_private.patient_records(label) VALUES(btrim(p_label)) RETURNING id INTO rec;
 INSERT INTO mediqueue_private.patient_links
 (user_id,patient_record_id,relationship,scopes,state,valid_from,valid_to)
 VALUES(auth.uid(),rec,'self',
 ARRAY['profile.read','queue.book','queue.read','queue.cancel']::text[],
 'pending',statement_timestamp(),statement_timestamp()+interval '1 year');
 INSERT INTO mediqueue_private.v5_enrollment_requests(user_id,request_key,patient_record_id)
 VALUES(auth.uid(),p_request_key,rec);
 INSERT INTO mediqueue_private.v5_events(actor_id,operation,outcome)
 VALUES(auth.uid(),'patient.profile.request','PENDING');
 RETURN pg_catalog.jsonb_build_object('ok',true,'status','PENDING','request_id',rec);
END $$;
CREATE FUNCTION mediqueue_private.v5_pending_profiles()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN NOT mediqueue_private.v5_patient_ok()
 THEN pg_catalog.jsonb_build_object('ok',false,'code','ACCESS_DENIED')
 ELSE pg_catalog.jsonb_build_object('ok',true,'data',coalesce((
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id',r.id,'label',r.label,'status',l.state))
  FROM mediqueue_private.patient_links l
  JOIN mediqueue_private.patient_records r ON r.id=l.patient_record_id
  WHERE l.user_id=auth.uid() AND l.state='pending' AND l.relationship='self'
 ),'[]'::jsonb)) END
$$;

CREATE FUNCTION mediqueue_private.v5_create_appointment(
 p_patient_record_id uuid,p_slot_id uuid,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s record; existing mediqueue_private.v5_appointments; new_id uuid; error_code text;
BEGIN
 IF NOT mediqueue_private.v5_patient_ok() OR p_request_key IS NULL
 OR p_patient_record_id IS NULL OR p_slot_id IS NULL
 OR NOT mediqueue_private.patient_scope(p_patient_record_id,'queue.book') THEN
  INSERT INTO mediqueue_private.v5_events(actor_id,operation,outcome)
   VALUES(auth.uid(),'appointment.create','ACCESS_DENIED');
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ACCESS_DENIED');
 END IF;
 -- Serialize client retries with identical idempotency keys.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(auth.uid()::text||':'||p_request_key::text,617));
 SELECT * INTO existing FROM mediqueue_private.v5_appointments
 WHERE booked_by=auth.uid() AND request_key=p_request_key;
 IF FOUND THEN
  IF existing.patient_record_id<>p_patient_record_id OR existing.slot_id<>p_slot_id THEN
   error_code:='IDEMPOTENCY_CONFLICT';
  ELSE
   RETURN pg_catalog.jsonb_build_object('ok',true,'id',existing.id,
       'status',existing.status,'replayed',true);
  END IF;
 ELSE
  SELECT sl.id,sl.starts_at INTO s FROM mediqueue_private.v5_slots sl
  JOIN mediqueue_private.v5_services sv ON sv.id=sl.service_id AND sv.published
  JOIN mediqueue_private.facilities f ON f.id=sv.facility_id AND f.active
  JOIN mediqueue_private.v5_clinician_shifts sh ON sh.id=sl.shift_id
   AND sh.facility_id=sv.facility_id AND sh.department_code=sv.department_code AND sh.published
  JOIN mediqueue_private.v5_clinicians c ON c.id=sh.clinician_id AND c.active
  WHERE sl.id=p_slot_id AND sl.open AND sl.starts_at>=sh.starts_at
   AND sl.ends_at<=sh.ends_at AND sl.starts_at>statement_timestamp()+interval '30 minutes'
  FOR UPDATE OF sl;
  IF NOT FOUND THEN
   error_code:='SLOT_UNAVAILABLE';
  ELSIF NOT mediqueue_private.patient_scope(p_patient_record_id,'queue.book') THEN
   error_code:='ACCESS_DENIED';
  ELSIF EXISTS(SELECT 1 FROM mediqueue_private.v5_appointments a
   WHERE a.slot_id=p_slot_id AND a.status='CONFIRMED') THEN
   error_code:='SLOT_FULL';
  ELSE
   INSERT INTO mediqueue_private.v5_appointments(
     patient_record_id,booked_by,slot_id,request_key)
   VALUES(p_patient_record_id,auth.uid(),p_slot_id,p_request_key)
   RETURNING id INTO new_id;
   INSERT INTO mediqueue_private.v5_events(actor_id,appointment_id,operation,outcome)
    VALUES(auth.uid(),new_id,'appointment.create','CONFIRMED');
   RETURN pg_catalog.jsonb_build_object('ok',true,'id',new_id,'status','CONFIRMED','replayed',false);
  END IF;
 END IF;
 INSERT INTO mediqueue_private.v5_events(actor_id,operation,outcome)
  VALUES(auth.uid(),'appointment.create',error_code);
 RETURN pg_catalog.jsonb_build_object('ok',false,'code',error_code);
END $$;
CREATE FUNCTION mediqueue_private.v5_cancel_appointment(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a mediqueue_private.v5_appointments; start_time timestamptz;
BEGIN
 IF NOT mediqueue_private.v5_patient_ok() THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ACCESS_DENIED');
 END IF;
 SELECT * INTO a FROM mediqueue_private.v5_appointments
 WHERE id=p_appointment_id AND booked_by=auth.uid() FOR UPDATE;
 IF NOT FOUND OR NOT mediqueue_private.patient_scope(a.patient_record_id,'queue.cancel') THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ACCESS_DENIED');
 END IF;
 IF a.status='CANCELLED' THEN
  RETURN pg_catalog.jsonb_build_object('ok',true,'id',a.id,'status','CANCELLED','replayed',true);
 END IF;
 SELECT starts_at INTO start_time FROM mediqueue_private.v5_slots WHERE id=a.slot_id;
 IF start_time<=statement_timestamp() THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','APPOINTMENT_ALREADY_STARTED');
 END IF;
 UPDATE mediqueue_private.v5_appointments SET status='CANCELLED',cancelled_at=statement_timestamp()
  WHERE id=a.id;
 INSERT INTO mediqueue_private.v5_events(actor_id,appointment_id,operation,outcome)
 VALUES(auth.uid(),a.id,'appointment.cancel','CANCELLED');
 RETURN pg_catalog.jsonb_build_object('ok',true,'id',a.id,'status','CANCELLED');
END $$;
CREATE FUNCTION mediqueue_private.v5_my_appointments()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE payload jsonb;
BEGIN
 IF NOT mediqueue_private.v5_patient_ok() THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','ACCESS_DENIED');
 END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id',v.id,'patient_record_id',v.patient_record_id,'status',v.status,
  'starts_at',v.starts_at,'ends_at',v.ends_at,
  'service_title',v.service_title,'facility_code',v.facility_code,
  'department_title',v.department_title,'clinician_name',v.clinician_name)
 ORDER BY v.starts_at DESC),'[]'::jsonb) INTO payload FROM (
  SELECT a.id,a.patient_record_id,a.status,sl.starts_at,sl.ends_at,
    sv.title AS service_title,f.code AS facility_code,
    d.title AS department_title,c.display_name AS clinician_name
  FROM mediqueue_private.v5_appointments a
  JOIN mediqueue_private.v5_slots sl ON sl.id=a.slot_id
  JOIN mediqueue_private.v5_services sv ON sv.id=sl.service_id
  JOIN mediqueue_private.facilities f ON f.id=sv.facility_id
  JOIN public.mq_departments d ON d.code=sv.department_code
  JOIN mediqueue_private.v5_clinician_shifts sh ON sh.id=sl.shift_id
  JOIN mediqueue_private.v5_clinicians c ON c.id=sh.clinician_id
  WHERE a.booked_by=auth.uid() AND mediqueue_private.patient_scope(a.patient_record_id,'queue.read')
  ORDER BY sl.starts_at DESC LIMIT 80
 ) v;
 RETURN pg_catalog.jsonb_build_object('ok',true,'data',payload);
END $$;

-- Stable REST wrappers; all access decisions rechecked in private routines.
CREATE FUNCTION public.mq_booking_catalog_v5() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT mediqueue_private.v5_catalog() $$;
CREATE FUNCTION public.mq_open_slots_v5(p_service_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT mediqueue_private.v5_open_slots(p_service_id) $$;
CREATE FUNCTION public.mq_request_self_profile_v5(p_label text,p_request_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT mediqueue_private.v5_request_self_profile(p_label,p_request_key) $$;
CREATE FUNCTION public.mq_pending_profiles_v5() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT mediqueue_private.v5_pending_profiles() $$;
CREATE FUNCTION public.mq_create_appointment_v5(p_patient_record_id uuid,p_slot_id uuid,p_request_key uuid)
 RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT mediqueue_private.v5_create_appointment(p_patient_record_id,p_slot_id,p_request_key) $$;
CREATE FUNCTION public.mq_cancel_appointment_v5(p_appointment_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT mediqueue_private.v5_cancel_appointment(p_appointment_id) $$;
CREATE FUNCTION public.mq_my_appointments_v5() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT mediqueue_private.v5_my_appointments() $$;
REVOKE ALL ON FUNCTION mediqueue_private.v5_validate_slot(),mediqueue_private.v5_patient_ok(),
 mediqueue_private.v5_catalog(),mediqueue_private.v5_open_slots(uuid),
 mediqueue_private.v5_request_self_profile(text,uuid),mediqueue_private.v5_pending_profiles(),
 mediqueue_private.v5_create_appointment(uuid,uuid,uuid),mediqueue_private.v5_cancel_appointment(uuid),
 mediqueue_private.v5_my_appointments(),
 public.mq_booking_catalog_v5(),public.mq_open_slots_v5(uuid),
 public.mq_request_self_profile_v5(text,uuid),public.mq_pending_profiles_v5(),
 public.mq_create_appointment_v5(uuid,uuid,uuid),public.mq_cancel_appointment_v5(uuid),
 public.mq_my_appointments_v5()
 FROM PUBLIC,anon,authenticated;
-- A wrapper must resolve its private routine, but no private tables are exposed.
GRANT USAGE ON SCHEMA mediqueue_private TO authenticated;
GRANT EXECUTE ON FUNCTION
 mediqueue_private.v5_catalog(),mediqueue_private.v5_open_slots(uuid),
 mediqueue_private.v5_request_self_profile(text,uuid),mediqueue_private.v5_pending_profiles(),
 mediqueue_private.v5_create_appointment(uuid,uuid,uuid),mediqueue_private.v5_cancel_appointment(uuid),
 mediqueue_private.v5_my_appointments()
 TO authenticated;
GRANT EXECUTE ON FUNCTION
 public.mq_booking_catalog_v5(),public.mq_open_slots_v5(uuid),
 public.mq_request_self_profile_v5(text,uuid),public.mq_pending_profiles_v5(),
 public.mq_create_appointment_v5(uuid,uuid,uuid),public.mq_cancel_appointment_v5(uuid),
 public.mq_my_appointments_v5()
 TO authenticated;
-- Existing ticket RPC is intentionally unchanged; appointment != queue ticket.
