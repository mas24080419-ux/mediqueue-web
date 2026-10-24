// Read-only live security smoke test. Uses only publishable key, never any account.
import assert from 'node:assert/strict';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../config.js';
const base=SUPABASE_URL.replace(/\/$/,'');
const headers={apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
for(const [name,path,options] of [
 ['Patient ticket data', '/rest/v1/mq_tickets?select=id&limit=1',{method:'GET',headers}],
 ['Issue ticket RPC', '/rest/v1/rpc/mq_issue_ticket',{method:'POST',headers,body:JSON.stringify({p_department:'GENERAL',p_name:'Unauthorized Test',p_request_key:'a1111111-1111-4111-8111-111111111111'})}],
 ['Call room RPC', '/rest/v1/rpc/mq_call_next_room',{method:'POST',headers,body:JSON.stringify({p_room_id:'GENERAL_101'})}]
]){
 const res=await fetch(base+path,options);
 // Fail closed if unauthenticated access unexpectedly succeeds.
 assert.ok(res.status===401 || res.status===403,
  name+' unexpectedly returned HTTP '+res.status+'; investigate RLS and RPC grants');
 console.log(name+' unauthorized: HTTP '+res.status);
}
console.log('Live anonymous-access smoke test PASS');

