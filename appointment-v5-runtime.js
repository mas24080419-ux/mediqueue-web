// Version-gated patient booking bridge. Private state never persists across Auth users.
export function makeAppointmentV5({rpc,getSession,redraw,notify}){
 let data={userId:null,ready:false,loading:false,profiles:[],services:[],pending:[],slots:[],appointments:[],slotsLoading:false};
 const state=()=>data;
 function reset(){
  const uid=getSession()?.user?.id||null;
  if(data.userId!==uid)data={userId:uid,ready:false,loading:false,profiles:[],services:[],pending:[],slots:[],appointments:[],slotsLoading:false};
  return uid;
 }
 async function load(force=false){
  const id=reset();if(!id)return false;
  if(data.loading)return false;if(data.ready&&!force)return true;
  data.loading=true;
  try{
   const [p,c,r]=await Promise.all([
    rpc('mq_patient_profiles_v2',{}),rpc('mq_booking_catalog_v5',{}),rpc('mq_pending_profiles_v5',{})
   ]);
   if(!p?.ok||!c?.ok||!r?.ok)throw Error('Backend V5 chưa sẵn sàng.');
   if(reset()!==id)return false;
   data.profiles=Array.isArray(p.data)?p.data:[];
   data.services=Array.isArray(c.data)?c.data:[];
   data.pending=Array.isArray(r.data)?r.data:[];
   data.ready=true;return true;
  }catch{if(reset()===id){data.ready=false;data.profiles=[];data.services=[];data.pending=[];}return false;}
  finally{if(reset()===id){data.loading=false;redraw();}}
 }
 async function slots(serviceId,stillSelected){
  const id=reset();data.slots=[];data.slotsLoading=true;redraw();
  try{
   const result=await rpc('mq_open_slots_v5',{p_service_id:serviceId});
   if(!result?.ok)throw Error(result?.code||'Không có lịch.');
   if(reset()===id&&stillSelected())data.slots=Array.isArray(result.data)?result.data:[];
  }catch(e){if(reset()===id)notify('Không thể tải giờ khám: '+e.message,'error');}
  finally{if(reset()===id){data.slotsLoading=false;redraw();}}
 }
 async function appointments(){
  const id=reset();if(!id||!data.ready)return;
  try{
   const response=await rpc('mq_my_appointments_v5',{});
   if(!response?.ok)throw Error(response?.code||'Không thể đọc lịch hẹn.');
   if(reset()===id){data.appointments=Array.isArray(response.data)?response.data:[];redraw();}
  }catch{if(reset()===id)data.appointments=[];}
 }
 async function create(patientRecordId,slotId,key){
  const result=await rpc('mq_create_appointment_v5',{
   p_patient_record_id:patientRecordId,p_slot_id:slotId,p_request_key:key
  });
  if(!result?.ok||result.status!=='CONFIRMED')throw Error(result?.code||'Chưa xác nhận suất hẹn.');
  await appointments();return result;
 }
 async function cancel(appointmentId){
  const result=await rpc('mq_cancel_appointment_v5',{p_appointment_id:appointmentId});
  if(!result?.ok||result.status!=='CANCELLED')throw Error(result?.code||'Không thể hủy.');
  await appointments();return result;
 }
 async function requestProfile(label,key){
  const result=await rpc('mq_request_self_profile_v5',{p_label:label,p_request_key:key});
  if(!result?.ok||result.status!=='PENDING')throw Error(result?.code||'Không thể yêu cầu xác minh.');
  await load(true);return result;
 }
 return {state,reset,load,slots,appointments,create,cancel,requestProfile};
}
