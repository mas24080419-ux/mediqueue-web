-- Synthetic local-only fixtures. Never submit this file to the cloud database.
INSERT INTO public.mq_departments(code,title,room,prefix) VALUES('GENERAL','QA General','QA','G'),('PEDIATRICS','QA Pediatrics','QA','P');
INSERT INTO public.mq_rooms(id,department_code,title) VALUES('GENERAL_101','GENERAL','QA 101'),('GENERAL_104','GENERAL','QA 104'),('PEDIATRICS_201','PEDIATRICS','QA 201');
INSERT INTO public.mq_department_live(department_code,date_key) SELECT code,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date FROM public.mq_departments;
INSERT INTO auth.users(id,email_confirmed_at) SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,now() FROM generate_series(1,6)i;
INSERT INTO public.mq_profiles(id,display_name,role,department_code) SELECT id,'SYNTHETIC QA',CASE WHEN right(id::text,1)='3' THEN 'staff' WHEN right(id::text,1)='4' THEN 'admin' ELSE 'patient' END,CASE WHEN right(id::text,1)='3' THEN 'GENERAL' END FROM auth.users;
INSERT INTO auth.sessions(id,user_id) SELECT ('20000000-0000-4000-8000-'||right(id::text,12))::uuid,id FROM auth.users;
INSERT INTO mediqueue_private.facilities(id,code) VALUES('30000000-0000-4000-8000-000000000001','QA_A'),('30000000-0000-4000-8000-000000000002','QA_B');
INSERT INTO mediqueue_private.department_facilities VALUES('GENERAL','30000000-0000-4000-8000-000000000001'),('PEDIATRICS','30000000-0000-4000-8000-000000000002');
INSERT INTO public.mq_staff_assignments(id,user_id,job_title,department_code,room_id,valid_from,valid_to) VALUES('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','doctor','GENERAL','GENERAL_101',now()-interval '1 hour',now()+interval '1 hour');
INSERT INTO mediqueue_private.assignment_tasks SELECT '40000000-0000-4000-8000-000000000001',unnest(ARRAY['read','call','START','FINISH','SKIP','recall','checkin','pause']);
INSERT INTO mediqueue_private.patient_records(id,label) VALUES('50000000-0000-4000-8000-000000000001','SYNTHETIC A'),('50000000-0000-4000-8000-000000000002','SYNTHETIC B');
INSERT INTO mediqueue_private.patient_links(id,user_id,patient_record_id,relationship,scopes,state,verified_by,evidence_ref,verified_at,valid_from,valid_to) VALUES('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','self',ARRAY['profile.read','queue.book'],'verified','10000000-0000-4000-8000-000000000006',gen_random_uuid(),now(),now()-interval '1 hour',now()+interval '1 hour');
INSERT INTO mediqueue_private.patient_links(user_id,patient_record_id,relationship,scopes,valid_from,valid_to) VALUES('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','consented_delegate',ARRAY['profile.read'],now()-interval '1 hour',now()+interval '1 hour');
