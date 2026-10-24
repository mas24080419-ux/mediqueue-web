-- Staff accounts do not inherit old patient-owner access outside assignments.
DROP POLICY mq_tickets_scoped ON public.mq_tickets;
CREATE POLICY mq_tickets_scoped ON public.mq_tickets FOR SELECT TO authenticated USING(
 (patient_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.mq_profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='patient'))
 OR mediqueue_private.can_task('read',department_code,room_id));
