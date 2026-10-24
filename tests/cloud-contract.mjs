import assert from 'node:assert/strict';
// API contract test: no real network; user JWT and RLS-scoped requests are asserted.
const state=new Map();
globalThis.sessionStorage={getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)};
const calls=[];
const user={id:'11111111-1111-4111-8111-111111111111',email:'demo@example.invalid'};
const respond=(data)=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
globalThis.fetch=async (url,opts={})=>{
  calls.push({url:String(url),opts});
  if(String(url).includes('/auth/v1/token?grant_type=password'))
    return respond({access_token:'test-user-jwt',refresh_token:'test-refresh',expires_in:3600,user});
  if(String(url).includes('/rest/v1/mq_profiles?'))
    return respond([{id:user.id,role:'patient',display_name:'Test',department_code:null}]);
  if(String(url).includes('/rest/v1/mq_tickets?'))
    return respond([{id:1,patient_id:user.id,status:'WAITING',queue_number:1}]);
  if(String(url).includes('/rest/v1/rpc/mq_issue_ticket'))
    return respond({id:1,queue_number:1});
  if(String(url).includes('/rest/v1/'))return respond([]);
  return respond({});
};
const cloud=await import('../supabase-client.js');
assert.equal(cloud.hasCloudConfig(),true);
await cloud.signIn('demo@example.invalid','mock-password');
assert.ok(cloud.getSession().expires_at > Date.now()/1000);
const data=await cloud.loadCloudData();
assert.equal(data.profile.role,'patient');
assert.equal(data.tickets.length,1);
const patients=calls.filter(c=>c.url.includes('mq_tickets?'));
assert.ok(patients.length && patients[0].url.includes('patient_id=eq.'));
assert.ok(calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.opts.headers.Authorization==='Bearer test-user-jwt'));
assert.equal(calls.find(c=>c.url.includes('/auth/v1/token?grant_type=password')).opts.headers.Authorization,undefined);
await cloud.rpc('mq_issue_ticket',{p_department:'GENERAL',p_name:'Test',p_request_key:'test'});
await cloud.signOut();
assert.equal(cloud.getSession(),null);
await assert.rejects(cloud.rpc('mq_issue_ticket',{}),/đăng nhập/i);
console.log('MediQueue cloud contract: PASS (login, expiry, patient scope, JWT, RPC, sign out)');
