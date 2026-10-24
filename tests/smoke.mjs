// Static smoke test for MediQueue using a minimal DOM host (no npm dependencies).
import assert from 'node:assert/strict';
const mem=new Map();
const store={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
globalThis.localStorage=store;globalThis.sessionStorage=store;
globalThis.window={location:{pathname:'/mediqueue-web/'},addEventListener:()=>{},scrollTo:()=>{}};
Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
globalThis.BroadcastChannel=class { constructor(){} postMessage(){} };
globalThis.setInterval=()=>0;globalThis.setTimeout=()=>0;
let html='';const handlers={};
globalThis.document={hidden:false,createElement:()=>({className:'',innerHTML:'',remove(){}}),getElementById:(id)=>id==='app'?{set innerHTML(s){html=s},get innerHTML(){return html}}:id==='toasts'?{append(){}}:null,addEventListener:(event,fn)=>{handlers[event]=fn}};
globalThis.FormData=class {constructor(form){this.form=form;}get(n){return this.form.data[n];}};
await import('../app.js');
assert.match(html,/Tài khoản/); // Public deployment opens in cloud login mode.
const nav=async page=>{const target={matches:()=>false,closest:(sel)=>sel==='[data-page]'?{dataset:{page}}:null};await handlers.click({target});};
const act=async (action,attrs={})=>{const target={closest:(sel)=>sel==='[data-action]'?{dataset:{action,...attrs}}:null,matches:()=>false};await handlers.click({target});};
await nav('account');await act('toggle-cloud');await nav('home');
assert.match(html,/Chào mừng trở lại/);assert.match(html,/Khám tổng quát/);assert.match(html,/MediQueue/);
await nav('reception');assert.doesNotMatch(html,/Danh sách lượt khám/); // Patient portal never opens reception
await nav('book');assert.match(html,/Đăng ký lấy số/);
await handlers.submit({preventDefault(){},target:{id:'bookingForm',data:{patientName:'Người Demo',department:'GENERAL'}}});
assert.match(html,/Theo dõi lượt khám/);
assert.match(html,/T011/);
await nav('staff');assert.doesNotMatch(html,/Quản lý phòng khám/);
await act('demo-staff');assert.doesNotMatch(html,/Quản lý phòng khám/);
await nav('board');assert.match(html,/Bảng theo dõi khu chờ/);
assert.doesNotMatch(html,/Minh Anh/);
await nav('account');assert.match(html,/Cổng nhân viên/);
const ownerBefore=JSON.parse(mem.get('mediqueue_web_demo_v1')).tickets.find(t=>t.patient_id==='demo-me'&&t.queue_number===11);
await nav('track');await act('cancel',{id:String(ownerBefore.id)});
assert.match(html,/Hủy phiếu/);await act('confirm-modal');
const canceled=JSON.parse(mem.get('mediqueue_web_demo_v1')).tickets.find(t=>t.id===ownerBefore.id);
assert.equal(canceled.status,'SKIPPED');
console.log('Patient portal smoke: PASS (registration, queue, privacy, staff restriction, cancel)');
