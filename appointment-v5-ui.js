// MediQueue V5 booking presentation. All lists originate from authenticated RPC results.
// No local synthetic doctor, service, insurance, price or available appointment slot.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=v=>Array.isArray(v)?v:[];
const hasScope=(p,scope)=>list(p.scopes).includes(scope);
export const localVisitTime=iso=>{
 const d=new Date(iso);
 return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('vi-VN',{
  timeZone:'Asia/Ho_Chi_Minh',dateStyle:'medium',timeStyle:'short'
 }).format(d);
};
export const canBookAppointment=(state,v5)=>!!(v5?.ready&&
 list(v5.profiles).some(p=>hasScope(p,'queue.book'))&&
 list(v5.services).some(s=>s.department_code===state.department));
export function v5Validate(state,v5){
 if(state.mode!=='appointment')return '';
 if(!v5?.ready)return 'Lịch hẹn chưa được kết nối hoặc đang tải. Chưa thể đặt lịch.';
 const profile=list(v5.profiles).find(p=>p.patient_record_id===state.patientRecordId&&hasScope(p,'queue.book'));
 if(!profile)return 'Vui lòng chọn hồ sơ đã được bệnh viện xác minh quyền đặt lịch.';
 const service=list(v5.services).find(s=>s.id===state.serviceId&&s.department_code===state.department);
 if(!service)return 'Vui lòng chọn dịch vụ khám khả dụng tại chuyên khoa.';
 const slot=list(v5.slots).find(s=>s.id===state.slotId&&s.service_id===service.id);
 if(!slot || new Date(slot.starts_at).getTime()<=Date.now())
  return 'Vui lòng chọn giờ khám còn hiệu lực do hệ thống trả về.';
 return '';
}
export function v5MethodChoices(state,context){
 const v5=context.v5||{}, enabled=canBookAppointment(state,v5);
 const isA=state.mode==='appointment',isQ=!isA;
 return '<section class="mq-book-section"><h2>Hình thức đăng ký</h2><div class="mq-book-choice-grid">'+
 '<button type="button" class="mq-v5-choice '+(isQ?'is-on':'')+'" data-booking-mode="ticket" aria-pressed="'+isQ+'"><strong>Lấy số khám trong ngày</strong><span>Cấp số từ hệ thống hàng chờ; không cam kết giờ khám</span></button>'+
 '<button type="button" class="mq-v5-choice '+(isA?'is-on':'')+'" data-booking-mode="appointment" aria-pressed="'+isA+'" '+(!enabled?'disabled':'')+'><strong>Đặt lịch theo giờ</strong><span>'+(enabled?'Chọn hồ sơ đã xác minh, dịch vụ và suất hẹn thật':'Chưa có hồ sơ đã xác minh hoặc lịch khám được công bố')+'</span></button>'+
 '</div>'+(!v5.ready?'<p class="mq-book-inline-note">Đặt lịch theo giờ hiện chưa khả dụng trên hệ thống này. Chức năng lấy số vẫn hoạt động độc lập.</p>':'')+
 ((v5.ready&&!list(v5.profiles).some(p=>hasScope(p,'queue.book')))?(
  '<div class="mq-v5-enrol"><strong>Chưa có hồ sơ được xác minh</strong><p>Có thể gửi yêu cầu tạo hồ sơ cho chính bạn, nhưng bệnh viện phải xác minh trước khi mở quyền đặt lịch. Họ tên tự khai không chứng minh danh tính.</p>'+
  '<button type="button" class="btn btn-outline" data-booking-profile-request>Gửi yêu cầu xác minh hồ sơ</button>'+
  (list(v5.pending).length?'<small>Đang có '+list(v5.pending).length+' yêu cầu chờ bệnh viện xác minh.</small>':'')+
  '</div>'):'')+
 '</section>';
}
export function v5AppointmentFields(state,context){
 const v5=context.v5||{};
 const selected=list(v5.services).find(s=>s.id===state.serviceId);
 const records=list(v5.profiles).filter(p=>hasScope(p,'queue.book'));
 const services=list(v5.services).filter(s=>s.department_code===state.department);
 const slots=list(v5.slots).filter(s=>s.service_id===state.serviceId);
 const option=(id,title,chosen)=>'<option value="'+esc(id)+'" '+(id===chosen?'selected':'')+'>'+esc(title)+'</option>';
 return '<section class="mq-book-section mq-v5-section"><h2>Chọn hồ sơ, dịch vụ và giờ khám</h2>'+
 '<p class="mq-book-help">Các lựa chọn dưới đây được cung cấp bởi Supabase; giờ khám không được giữ chỗ cho đến khi backend xác nhận thành công.</p>'+
 '<label class="mq-v5-field"><strong>Hồ sơ khám đã được xác minh</strong><select data-booking-v5-patient><option value="">Chọn người khám</option>'+
 records.map(p=>option(p.patient_record_id,p.label+' · '+(p.relationship==='self'?'Bản thân':'Đại diện đã xác minh'),state.patientRecordId)).join('')+
 '</select></label>'+
 '<label class="mq-v5-field"><strong>Dịch vụ khám</strong><select data-booking-v5-service><option value="">Chọn dịch vụ</option>'+
 services.map(s=>option(s.id,s.title+' · '+s.facility_code,state.serviceId)).join('')+'</select></label>'+
 '<label class="mq-v5-field"><strong>Bác sĩ và suất hẹn còn trống</strong><select data-booking-v5-slot '+(!state.serviceId?'disabled':'')+'><option value="">'+(v5.slotsLoading?'Đang lấy lịch…':slots.length?'Chọn giờ khám':'Chưa có giờ trống được xác nhận')+'</option>'+
 slots.map(s=>option(s.id,localVisitTime(s.starts_at)+' · '+s.clinician_name,state.slotId)).join('')+'</select></label>'+
 (selected?'<div class="mq-book-inline-note">Thời lượng dịch vụ: '+esc(selected.duration_minutes)+' phút theo danh mục bệnh viện. Giá, BHYT và thanh toán chưa được xác thực qua MediQueue.</div>':'')+
 '<p class="mq-book-help">Hệ thống có thể từ chối nếu suất hẹn đã được người khác đặt hoặc lịch trực thay đổi.</p></section>';
}
export function v5Review(state,context){
 const v5=context.v5||{},patient=list(v5.profiles).find(p=>p.patient_record_id===state.patientRecordId),
 service=list(v5.services).find(s=>s.id===state.serviceId),
 slot=list(v5.slots).find(s=>s.id===state.slotId);
 return '<section class="mq-book-section"><h2>Kiểm tra yêu cầu lịch hẹn</h2>'+
 '<dl class="mq-book-review">'+
 [['Hồ sơ được xác minh',patient?.label||'—'],['Chuyên khoa',service?.department_title||'—'],
 ['Dịch vụ',service?.title||'—'],['Cơ sở',service?.facility_code||'—'],
 ['Bác sĩ',slot?.clinician_name||'—'],['Ngày và giờ',localVisitTime(slot?.starts_at)]]
 .map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>'+
 '<label class="mq-book-agree"><input type="checkbox" id="bookingAccept" '+(state.accepted?'checked':'')+'><span>Tôi xác nhận hồ sơ được phép đặt lịch và hiểu suất hẹn chỉ được giữ sau khi backend trả về <strong>CONFIRMED</strong>. Việc đặt lịch chưa phải check-in hoặc thanh toán.</span></label>'+
 '<form id="bookingForm"><button class="btn btn-primary btn-wide mq-book-submit" type="submit" '+(!state.accepted||context.submitting?'disabled':'')+'>'+(context.submitting?'Đang xác nhận…':'Xác nhận đặt lịch theo giờ')+'</button></form>'+
 '<div class="mq-book-warning">Trường hợp cần cấp cứu phải được nhân viên y tế đánh giá trực tiếp, không chờ lịch hẹn.</div></section>';
}
export function v5AppointmentCards(v5={}){
 if(!v5.ready)return '';
 const data=list(v5.appointments);
 return '<section class="mq-v5-list"><h2>Lịch hẹn đã xác nhận</h2><p class="mq-book-help">Lịch hẹn độc lập với phiếu lấy số trong ngày. Chưa có check-in QR cho lịch hẹn V5.</p>'+
 (data.length?data.map(a=>'<article class="mq-v5-appointment"><div><b>'+esc(a.service_title)+'</b><span>'+esc(a.department_title)+' · '+esc(a.facility_code)+'</span><strong>'+esc(localVisitTime(a.starts_at))+'</strong><small>Bác sĩ: '+esc(a.clinician_name)+' · '+esc(a.status)+'</small></div>'+
 (a.status==='CONFIRMED'?'<button type="button" class="btn btn-ghost btn-sm" data-v5-cancel="'+esc(a.id)+'">Hủy lịch</button>':'')+'</article>').join(''):'<p class="mq-book-inline-note">Chưa có lịch hẹn theo giờ được xác nhận.</p>')+
 '</section>';
}
