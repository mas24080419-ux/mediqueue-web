import assert from 'node:assert/strict';
const state=new Map();
globalThis.sessionStorage={getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)};
const user={id:'11111111-1111-4111-8111-111111111111'};
const response=x=>({ok:true,text:async()=>JSON.stringify(x)});
let release, started, refreshCalls=0;
const expired={access_token:'mock-old',refresh_token:'mock-refresh',expires_at:1,user};
state.set('mq_web_session_v2',JSON.stringify(expired));
let signal=new Promise(r=>started=r);
globalThis.fetch=async(url)=>{
 if(url.includes('grant_type=refresh_token')) { refreshCalls++; started(); return new Promise(r=>{release=()=>r(response({access_token:'mock-new',refresh_token:'mock-new-refresh',expires_in:3600,user}));}); }
 return response([]);
};
const cloud=await import('../supabase-client.js?singleflight');
const requests=Promise.all(Array.from({length:6},()=>cloud.select('mq_rooms')));
await signal;
assert.equal(refreshCalls,1,'parallel API calls share one refresh');
release(); await requests;
assert.equal(cloud.getSession().access_token,'mock-new');
state.set('mq_web_session_v2',JSON.stringify(expired));
const second=await import('../supabase-client.js?logout-race');
signal=new Promise(r=>started=r);
const pending=second.select('mq_rooms');
const rejected=assert.rejects(pending,/hết hạn/);
await signal;
await second.signOut();
release(); await rejected;
assert.equal(second.getSession(),null,'late refresh cannot restore logged-out session');
assert.equal(state.has('mq_web_session_v2'),false);
console.log('Session race tests PASS: single refresh for six requests; logout blocks late refresh');

