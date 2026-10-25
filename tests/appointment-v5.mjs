import assert from 'node:assert/strict';
import {canBookAppointment,v5Validate,v5MethodChoices,v5AppointmentFields,v5Review,v5AppointmentCards} from '../appointment-v5-ui.js';
import {makeAppointmentV5} from '../appointment-v5-runtime.js';

const dept='GENERAL', patient='11111111-1111-4111-8111-111111111111';
const service='22222222-2222-4222-8222-222222222222',slot='33333333-3333-4333-8333-333333333333';
const future='2035-12-20T01:00:00.000Z';
const state={step:2,mode:'appointment',department:dept,patientRecordId:patient,serviceId:service,slotId:slot,accepted:false,patientName:'Nguyễn A'};
const v5={ready:true,profiles:[{patient_record_id:patient,label:'Nguyễn A',relationship:'self',scopes:['profile.read','queue.book','queue.read','queue.cancel']}],
 services:[{id:service,title:'Khám nội',department_code:dept,department_title:'Khám tổng quát',facility_code:'HN',duration_minutes:30}],
 slots:[{id:slot,service_id:service,starts_at:future,ends_at:'2035-12-20T01:30:00Z',clinician_name:'Bác sĩ Nguyễn A'}],
 pending:[],appointments:[]};
assert.equal(canBookAppointment(state,v5),true);
assert.equal(v5Validate(state,v5),'');
assert.match(v5MethodChoices(state,{v5}),/data-booking-mode="appointment"/);
assert.match(v5AppointmentFields(state,{v5}),/Bác sĩ Nguyễn A/);
assert.match(v5Review(state,{v5}),/Xác nhận đặt lịch theo giờ/);
assert.match(v5Validate({...state,slotId:'untrusted'},v5),/giờ khám/);
assert.match(v5Validate(state,{...v5,profiles:[]}),/hồ sơ đã được bệnh viện xác minh/);
assert.equal(canBookAppointment(state,{...v5,services:[]}),false);
assert.match(v5MethodChoices(state,{v5:{ready:false}}),/disabled/);
const malicious={...v5,services:[{...v5.services[0],title:'<img src=x onerror=alert(1)>'}]};
assert.doesNotMatch(v5AppointmentFields(state,{v5:malicious}),/<img src=x/,'Escape service name');
assert.match(v5AppointmentFields(state,{v5:malicious}),/&lt;img/);
assert.match(v5AppointmentCards({...v5,appointments:[{
 id:'44444444-4444-4444-8444-444444444444',
 status:'CONFIRMED',service_title:'Khám nội',department_title:'Khám tổng quát',
 clinician_name:'Bác sĩ Nguyễn A',facility_code:'HN',starts_at:future
}]}),/data-v5-cancel=/);

let session={user:{id:'user-A'}},draws=0;
const calls=[];
const client=makeAppointmentV5({
 getSession:()=>session,redraw:()=>draws++,notify:()=>{},
 rpc:async(method,args)=>{
  calls.push({method,args});
  if(method==='mq_patient_profiles_v2')return {ok:true,data:v5.profiles};
  if(method==='mq_booking_catalog_v5')return {ok:true,data:v5.services};
  if(method==='mq_pending_profiles_v5')return {ok:true,data:[]};
  if(method==='mq_open_slots_v5')return {ok:true,data:v5.slots};
  if(method==='mq_my_appointments_v5')return {ok:true,data:[]};
  if(method==='mq_create_appointment_v5')return {ok:true,status:'CONFIRMED',id:'some-id'};
  if(method==='mq_cancel_appointment_v5')return {ok:true,status:'CANCELLED'};
  if(method==='mq_request_self_profile_v5')return {ok:true,status:'PENDING'};
  throw Error('Unexpected RPC '+method);
 }
});
assert.equal(await client.load(),true);
assert.equal(client.state().profiles.length,1);
await client.slots(service,()=>true);
assert.equal(client.state().slots.length,1);
await client.create(patient,slot,'55555555-5555-4555-8555-555555555555');
assert.ok(calls.some(x=>x.method==='mq_create_appointment_v5'&&x.args.p_patient_record_id===patient));
await client.requestProfile('Nguyễn A','55555555-5555-4555-8555-555555555556');
session={user:{id:'user-B'}};client.reset();
assert.equal(client.state().profiles.length,0,'No cross-session cached patient records');
assert.equal(client.state().ready,false);
assert.ok(draws>0);
console.log('PASS: V5 appointment slot validation, escaping, authorization gate, RPC contract, session isolation');
