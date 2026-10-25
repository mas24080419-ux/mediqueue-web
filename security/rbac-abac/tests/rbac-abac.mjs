import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(); const results=[];
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const scalar=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
const id=(n,p=1)=>`${p}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}}
async function as(n,aal='aal2',extra={}){await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id(n),JSON.stringify({sub:id(n),aal,session_id:id(n,2),...extra})]);}
const task=(name,fac=1,dept='GENERAL',room='GENERAL_101')=>scalar('select mediqueue_private.can_task_v2($1,$2,$3,$4)',[name,id(fac,3),dept,room]);
async function api(q,args=[]){await db.exec('SET ROLE authenticated');try{return await scalar(q,args);}finally{await db.exec('RESET ROLE');}}
try{
 await test('schema-only baseline reconstructed from live catalog; compiles',()=>db.exec(read('./baseline-schema.sql')));
 await test('proposed additive migration compiles',()=>db.exec(read('../../../supabase/migrations/20261025031642_mediqueue_rbac_abac_foundation.sql')));
 await db.exec(read('./fixtures.sql'));await as(3);
 for(const t of ['read','call','START','FINISH','SKIP','recall'])await test(`doctor assigned task ${t}`,async()=>assert.equal(await task(t),true));
 for(const t of ['checkin','pause','clinical.read','grant','unknown'])await test(`doctor denied ${t} despite injected task if applicable`,async()=>assert.equal(await task(t),false));
 await test('cross-facility denied',async()=>assert.equal(await task('read',2),false));
 await test('cross-department denied',async()=>assert.equal(await task('read',2,'PEDIATRICS','PEDIATRICS_201'),false));
 await test('cross-room denied',async()=>assert.equal(await task('read',1,'GENERAL','GENERAL_104'),false));
 await test('room absent for room-specific assignment denied',async()=>assert.equal(await task('read',1,'GENERAL',null),false));
 await test('wrong department-room tuple denied',async()=>assert.equal(await task('read',1,'GENERAL','PEDIATRICS_201'),false));
 await test('task removed denies immediately',async()=>{await db.exec("delete from mediqueue_private.assignment_tasks where task='call'");assert.equal(await task('call'),false);await db.exec(`insert into mediqueue_private.assignment_tasks values('${id(1,4)}','call')`);});
 for(const [name,sql,undo] of [
 ['expired shift',"valid_to=statement_timestamp()-interval '1 second'","valid_to=now()+interval '1 hour'"],
 ['future shift',"valid_from=statement_timestamp()+interval '1 minute'","valid_from=now()-interval '1 hour'"],
 ['revoked assignment','active=false','active=true']])await test(name,async()=>{await db.exec('update public.mq_staff_assignments set '+sql);assert.equal(await task('call'),false);await db.exec('update public.mq_staff_assignments set '+undo);});
 await test('inactive facility denied',async()=>{await db.exec('update mediqueue_private.facilities set active=false');assert.equal(await task('read'),false);await db.exec('update mediqueue_private.facilities set active=true');});
 await test('MFA aal1 denied internal data',async()=>{await as(3,'aal1');assert.equal(await task('read'),false);await as(3);});
 await test('forged user_metadata does not grant task',async()=>{await as(1,'aal2',{user_metadata:{role:'staff',job_title:'doctor'}});assert.equal(await task('call'),false);await as(3);});
 await test('anonymous auth denied',async()=>{await as(3,'aal2',{is_anonymous:true});assert.equal(await task('read'),false);await as(3);});
 await test('unverified email denied',async()=>{await db.exec(`update auth.users set email_confirmed_at=null where id='${id(3)}'`);assert.equal(await task('read'),false);await db.exec(`update auth.users set email_confirmed_at=now() where id='${id(3)}'`);});
 await test('missing session denied',async()=>{await as(3,'aal2',{session_id:id(99,2)});assert.equal(await task('read'),false);await as(3);});
 await test('expired session denied',async()=>{await db.exec(`update auth.sessions set not_after=now()-interval '1 second' where id='${id(3,2)}'`);assert.equal(await task('read'),false);await db.exec('update auth.sessions set not_after=null');});
 await test('cross-user session denied',async()=>{await as(3,'aal2',{session_id:id(1,2)});assert.equal(await task('read'),false);await as(3);});
 await test('dashboard authenticated wrapper positive',async()=>{const r=await api('select public.mq_dashboard_v2($1)',[id(1,4)]);assert.equal(r.ok,true);assert.equal(r.job_title,'doctor');assert.equal(JSON.stringify(r).includes('patient_name'),false);});
 await test('dashboard cross-user assignment denied and audit persists',async()=>{await as(2);const before=Number(await scalar('select count(*) from mediqueue_private.access_decisions where not allowed'));const r=await api('select public.mq_dashboard_v2($1)',[id(1,4)]);assert.equal(r.ok,false);assert.equal(Number(await scalar('select count(*) from mediqueue_private.access_decisions where not allowed')),before+1);});
 for(const role of ['reception','nurse','department_lead','laboratory','imaging','pharmacy','cashier'])await test(`role ceiling ${role}`,async()=>{await as(3);await db.query('update public.mq_staff_assignments set job_title=$1,room_id=null',[role]);await db.exec(`insert into mediqueue_private.assignment_tasks values('${id(1,4)}','audit') ON CONFLICT DO NOTHING`);assert.equal(await task('read'),['reception','nurse','department_lead'].includes(role));assert.equal(await task('pause'),role==='department_lead');assert.equal(await task('call'),role==='department_lead');});
 await test('dashboard binds selected assignment; cannot borrow another assignment',async()=>{await as(3);await db.exec(`insert into public.mq_staff_assignments(id,user_id,job_title,department_code,room_id,valid_from,valid_to) values('${id(2,4)}','${id(3)}','doctor','GENERAL','GENERAL_101',now()-interval '1 hour',now()+interval '1 hour');insert into mediqueue_private.assignment_tasks values('${id(2,4)}','read')`);const r=await api('select public.mq_dashboard_v2($1)',[id(1,4)]);assert.equal(r.ok,false);await db.exec(`delete from mediqueue_private.assignment_tasks where assignment_id='${id(2,4)}';delete from public.mq_staff_assignments where id='${id(2,4)}'`);});
 await test('department lead independent of hospital admin',async()=>{await db.exec("update public.mq_staff_assignments set job_title='department_lead'");assert.equal(await task('pause'),true);assert.equal(await scalar('select mediqueue_private.is_hospital_admin()'),false);});
 await test('hospital admin not clinical or queue operator',async()=>{await as(4);await db.exec(`insert into mediqueue_private.hospital_admin_grants(user_id) values('${id(4)}')`);assert.equal(await scalar('select mediqueue_private.is_hospital_admin()'),true);assert.equal(await task('read'),false);assert.equal(await task('clinical.read'),false);});
 await as(1,'aal1');
 await test('patient verified self profile visible',async()=>{const r=await api('select public.mq_patient_profiles_v2()');assert.equal(r.ok,true);assert.equal(r.data.length,1);assert.equal(r.data[0].patient_record_id,id(1,5));});
 await test('patient B pending link cannot read A',async()=>{await as(2);assert.equal(await scalar('select mediqueue_private.patient_scope($1,$2)',[id(1,5),'profile.read']),false);assert.equal((await api('select public.mq_patient_profiles_v2()')).data.length,0);});
 await test('verified representative only explicitly granted scope',async()=>{await db.exec(`update mediqueue_private.patient_links set state='verified',verified_by='${id(6)}',evidence_ref=gen_random_uuid(),verified_at=now() where user_id='${id(2)}'`);assert.equal(await scalar('select mediqueue_private.patient_scope($1,$2)',[id(1,5),'profile.read']),true);assert.equal(await scalar('select mediqueue_private.patient_scope($1,$2)',[id(1,5),'queue.book']),false);});
 for(const [name,change,undo] of [['revoked link',"revoked_at=now()","revoked_at=null"],['expired link',"valid_to=now()-interval '1 second'","valid_to=now()+interval '1 hour'"],['inactive patient','active=false','active=true']])await test(name,async()=>{const table=name==='inactive patient'?'patient_records':'patient_links';await db.exec(`update mediqueue_private.${table} set ${change}`);assert.equal(await scalar('select mediqueue_private.patient_scope($1,$2)',[id(1,5),'profile.read']),false);await db.exec(`update mediqueue_private.${table} set ${undo}`);});
 await test('policy task/scope mutations audited without grant payload',async()=>assert.ok(Number(await scalar('select count(*) from mediqueue_private.policy_change_audit'))>5));
 await test('link changes audited without evidence payload',async()=>assert.ok(Number(await scalar('select count(*) from mediqueue_private.identity_link_audit'))>=5));
 for(const table of ['patient_records','patient_links','assignment_tasks','access_decisions','identity_link_audit','policy_change_audit'])await test(`authenticated direct ${table} denied`,async()=>{let code;try{await api(`select count(*) from mediqueue_private.${table}`);}catch(e){code=e.code;}assert.equal(code,'42501');});
 await test('self verification blocked by constraint',async()=>{let code;try{await db.exec(`update mediqueue_private.patient_links set verified_by=user_id`);}catch(e){code=e.code;}assert.equal(code,'23514');});
 await test('anonymous public API execute denied',async()=>{await db.exec('SET ROLE anon');let code;try{await scalar('select public.mq_patient_profiles_v2()');}catch(e){code=e.code;}finally{await db.exec('RESET ROLE');}assert.equal(code,'42501');});
 await test('existing cross-user ticket RLS denies',async()=>{await as(5);assert.equal(Number(await api('select count(*) from public.mq_tickets')),0);});
 // Reproduce existing definer/RLS mismatch using only a synthetic historical ticket.
 await as(1);const oldTicket=await scalar("select to_jsonb(public.mq_issue_ticket('GENERAL','SYNTHETIC OLD OWNER',gen_random_uuid()))");
 await test('patient A sees own nonempty ticket via RLS',async()=>assert.equal(Number(await api('select count(*) from public.mq_tickets where id=$1',[oldTicket.id])),1));
 await test('patient B cannot see A nonempty ticket via RLS',async()=>{await as(2);assert.equal(Number(await api('select count(*) from public.mq_tickets where id=$1',[oldTicket.id])),0);await as(1);});
 await db.exec(`update public.mq_profiles set role='staff',department_code='GENERAL' where id='${id(1)}'`);
 await test('RLS denies former-patient staff historical ticket without assignment',async()=>assert.equal(Number(await api('select count(*) from public.mq_tickets where id=$1',[oldTicket.id])),0));
 await test('baseline gap reproduced: former patient staff can use owner wait RPC',async()=>{const r=await api('select count(*) from public.mq_my_wait_info($1)',[oldTicket.id]);assert.equal(Number(r),1);});
 await test('baseline gap reproduced: former patient staff can cancel historical ticket',async()=>{const r=await api('select to_jsonb(public.mq_cancel_my_ticket($1))',[oldTicket.id]);assert.equal(r.status,'SKIPPED');});
 await db.exec(read('../../../supabase/migrations/20261025031954_mediqueue_owner_rpc_role_guard.sql'));
 for(const rpc of ['mq_my_wait_info','mq_cancel_my_ticket'])await test(`proposed fix: staff denied legacy ${rpc}`,async()=>{let code;try{await api(`select * from public.${rpc}($1)`,[oldTicket.id]);}catch(e){code=e.code;}assert.equal(code,'42501');});
 await db.exec(`update public.mq_profiles set role='patient',department_code=null where id='${id(1)}';update public.mq_tickets set status='WAITING' where id=${oldTicket.id}`);
 await test('patched wait RPC retains patient functionality',async()=>assert.equal(Number(await api('select count(*) from public.mq_my_wait_info($1)',[oldTicket.id])),1));
 await test('patched cancel RPC retains patient functionality',async()=>assert.equal((await api('select to_jsonb(public.mq_cancel_my_ticket($1))',[oldTicket.id])).status,'SKIPPED'));
 await test('existing queue workflow regression after proposed migrations; synthetic local transaction',()=>db.exec(read('./legacy-workflow.sql')));
 await test('legacy signatures unchanged',async()=>assert.equal(Number(await scalar("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('mq_issue_ticket','mq_checkin_qr','mq_call_next_room','mq_change_ticket','mq_assign_room','mq_cancel_my_ticket')")),6));
}catch(e){console.error('TEST FAILURE:',e.message,e.code);process.exitCode=1;}finally{
 fs.mkdirSync(new URL('./evidence/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./evidence/rbac-abac-results.json',import.meta.url),JSON.stringify({environment:'local PGlite PostgreSQL; synthetic Auth/session fixtures; NOT Supabase Auth/browser E2E',results},null,2));console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results},null,2));await db.close();
}
