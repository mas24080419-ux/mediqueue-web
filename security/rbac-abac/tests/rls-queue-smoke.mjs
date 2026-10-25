import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

// All data lives in a disposable in-memory PostgreSQL database. This does not
// connect to MediQueue-Dev, create users on Supabase, or commit hospital data.
const db=new PGlite();
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const scalar=async(query,params=[])=>Object.values((await db.query(query,params)).rows[0])[0];
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const checkpoints=[];
async function check(name,fn){
 await fn();
 checkpoints.push({name,status:'PASS'});
 console.log('PASS '+name);
}
async function as(n){
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[
 id(n),JSON.stringify({sub:id(n),aal:'aal2',session_id:'20000000-0000-4000-8000-'+String(n).padStart(12,'0')})
 ]);
}
async function asAuth(sql,params=[]){
 await db.exec('SET ROLE authenticated');
 try{return await scalar(sql,params);} finally{await db.exec('RESET ROLE');}
}
async function denied(sql,params=[],errorLike=''){
 let err;
 try{await asAuth(sql,params);}catch(e){err=e;}
 assert.ok(err,'Expected RPC or table access to be denied');
 if(errorLike)assert.match(err.message,new RegExp(errorLike));
}
try{
 await db.exec(read('./baseline-schema.sql'));
 await db.exec(read('../../../supabase/migrations/20261025031642_mediqueue_rbac_abac_foundation.sql'));
 await db.exec(read('./fixtures.sql'));

 await check('private counters and events RLS enabled',async()=>{
  const count=await scalar("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mediqueue_private' AND c.relname IN ('daily_counters','department_events') AND c.relrowsecurity");
  assert.equal(Number(count),2);
 });
 await check('direct patient read of counters and events denied',async()=>{
  await as(1);
  await denied('SELECT count(*) FROM mediqueue_private.daily_counters',[],'permission denied');
  await denied('SELECT count(*) FROM mediqueue_private.department_events',[],'permission denied');
 });
 await check('patient can issue ticket and counter advances through definer RPC',async()=>{
  await as(1);
  const ticket=await asAuth("SELECT to_jsonb(public.mq_issue_ticket('GENERAL','QA SYNTHETIC', $1))",['00000000-0000-4000-8000-000000000101']);
  assert.ok(ticket.id);
  assert.equal(ticket.queue_number,1);
  assert.equal(ticket.department_code,'GENERAL');
  const counter=await scalar("SELECT last_number FROM mediqueue_private.daily_counters WHERE department_code='GENERAL'");
  assert.equal(Number(counter),1);
 });
 await check('identical request key is idempotent, no duplicate queue number',async()=>{
  await as(1);
  const ticket=await asAuth("SELECT to_jsonb(public.mq_issue_ticket('GENERAL','QA SYNTHETIC',$1))",['00000000-0000-4000-8000-000000000101']);
  assert.equal(ticket.queue_number,1);
  assert.equal(Number(await scalar("SELECT count(*) FROM public.mq_tickets WHERE department_code='GENERAL'")),1);
  assert.equal(Number(await scalar("SELECT last_number FROM mediqueue_private.daily_counters WHERE department_code='GENERAL'")),1);
 });
 await check('patient cannot pause department',async()=>{
  await as(1);
  await denied("SELECT to_jsonb(public.mq_set_department_pause('GENERAL',true,'Gián đoạn kỹ thuật'))",[],'STAFF_ACCESS_DENIED');
 });
 await db.exec("UPDATE public.mq_staff_assignments SET job_title='department_lead',room_id=NULL WHERE user_id='"+id(3)+"'");
 await check('assigned department lead can pause and event is audited',async()=>{
  await as(3);
  const row=await asAuth("SELECT to_jsonb(public.mq_set_department_pause('GENERAL',true,'Gián đoạn kỹ thuật'))");
  assert.equal(row.is_paused,true);
  assert.equal(row.pause_reason,'Gián đoạn kỹ thuật');
  assert.equal(Number(await scalar("SELECT count(*) FROM mediqueue_private.department_events WHERE department_code='GENERAL' AND action='PAUSE'")),1);
 });
 await check('pause blocks new patient tickets',async()=>{
  await as(1);
  await denied("SELECT to_jsonb(public.mq_issue_ticket('GENERAL','QA SYNTHETIC',$1))",['00000000-0000-4000-8000-000000000102'],'DEPARTMENT_PAUSED');
 });
 await check('staff cannot issue patient ticket',async()=>{
  await as(3);
  await denied("SELECT to_jsonb(public.mq_issue_ticket('GENERAL','QA SYNTHETIC',$1))",['00000000-0000-4000-8000-000000000103'],'PATIENT_ACCOUNT_REQUIRED');
 });
 await check('assigned department lead can resume; RESUME event audited',async()=>{
  await as(3);
  const row=await asAuth("SELECT to_jsonb(public.mq_set_department_pause('GENERAL',false,NULL))");
  assert.equal(row.is_paused,false);
  assert.equal(Number(await scalar("SELECT count(*) FROM mediqueue_private.department_events WHERE department_code='GENERAL' AND action='RESUME'")),1);
 });
 await check('expired shift cannot pause the department',async()=>{
  await db.exec("UPDATE public.mq_staff_assignments SET valid_to=now()-interval '1 second' WHERE user_id='"+id(3)+"'");
  await as(3);
  await denied("SELECT to_jsonb(public.mq_set_department_pause('GENERAL',true,'Gián đoạn kỹ thuật'))",[],'STAFF_ACCESS_DENIED|ASSIGNMENT_ACCESS_DENIED');
 });
 await check('logged-out context cannot issue queue ticket',async()=>{
  await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  await denied("SELECT to_jsonb(public.mq_issue_ticket('GENERAL','QA SYNTHETIC',$1))",['00000000-0000-4000-8000-000000000104'],'AUTH_REQUIRED');
 });
 await check('private events still cannot be queried directly after pause/resume',async()=>{
  await as(1);
  await denied('SELECT count(*) FROM mediqueue_private.department_events',[],'permission denied');
 });
}catch(e){
 checkpoints.push({name:'fatal',status:'FAIL',error:e.message,code:e.code||null});
 console.error('FAIL '+e.message,e.code||'');
 process.exitCode=1;
}finally{
 const evidence={environment:'isolated in-memory PGlite PostgreSQL, synthetic Auth fixture; NOT live browser/Auth E2E',checkpoints};
 fs.mkdirSync(new URL('./evidence/',import.meta.url),{recursive:true});
 fs.writeFileSync(new URL('./evidence/rls-queue-smoke-results.json',import.meta.url),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({passed:checkpoints.filter(x=>x.status==='PASS').length,failed:checkpoints.filter(x=>x.status==='FAIL').length},null,2));
 await db.close();
}
