/* MediQueue patient booking journey.
 * Render only features supported by the current RPC: same-day department queue.
 * No simulated doctors, fees, patient-proxy permissions, or unavailable timeslots.
 */
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const BOOKING_STEPS=['Người khám','Chuyên khoa','Hình thức tiếp nhận','Xác nhận'];
export const createBookingState=(profile={})=>({
 step:0,
 patientName:profile.display_name&&profile.display_name!=='Người dùng'?String(profile.display_name):'',
 department:'',
 accepted:false
});
export function departmentAvailable(code,departments=[],rooms=[],live=[]){
 const exists=departments.some(d=>d.code===code);
 const available=rooms.some(r=>r.department_code===code&&r.is_available);
 const paused=live.some(l=>l.department_code===code&&l.is_paused);
 return exists&&available&&!paused;
}
export function validateBookingStep(state,context){
 if(state.step===0){
  const name=String(state.patientName||'').trim();
  return name.length>=2&&name.length<=60?'':'Vui lòng nhập họ tên người khám (2–60 ký tự).';
 }
 if(state.step>=1&&(!state.department||!departmentAvailable(state.department,context.departments,context.rooms,context.live)))
  return 'Vui lòng chọn chuyên khoa đang tiếp nhận. Một số khoa hoặc phòng có thể đã tạm dừng.';
 if(state.step===3&&!state.accepted)return 'Bạn cần xác nhận đã hiểu đây là phiếu lấy số trong ngày, không phải lịch hẹn theo giờ.';
 return '';
}
function stepper(state){
 return '<ol class="mq-book-steps">'+BOOKING_STEPS.map((name,i)=>
  '<li class="'+(i===state.step?'is-current':i<state.step?'is-done':'')+'" aria-current="'+(i===state.step?'step':'false')+'"><span>'+(i<state.step?'✓':i+1)+'</span><b>'+escape(name)+'</b></li>'
 ).join('')+'</ol>';
}
function serviceChoices(){
 return '<section class="mq-book-section"><h2>Hình thức đăng ký</h2><div class="mq-book-choice-grid">'+
  '<div class="mq-book-choice is-on"><span class="mq-book-radio">✓</span><div><strong>Lấy số khám trong ngày</strong><p>Hệ thống cấp số thứ tự tại chuyên khoa đang tiếp nhận. Giờ khám phụ thuộc hàng chờ.</p><small>Đang hỗ trợ</small></div></div>'+
  '<div class="mq-book-choice is-off"><span class="mq-book-radio">◷</span><div><strong>Đặt lịch hẹn theo giờ</strong><p>Cần lịch trực bác sĩ, suất hẹn và cơ chế giữ chỗ từ bệnh viện.</p><small>Chưa mở đăng ký trực tuyến</small></div></div>'+
 '</div></section>';
}
function patientStep(state,profile){
 return '<section class="mq-book-section"><h2>Ai là người đến khám?</h2><p class="mq-book-help">MediQueue hiện phát hành phiếu cho chính tài khoản đã xác thực.</p>'+
  '<div class="mq-book-choice-grid"><div class="mq-book-choice is-on"><span class="mq-book-radio">✓</span><div><strong>Bản thân tôi</strong><p>Sử dụng tài khoản bệnh nhân đang đăng nhập.</p></div></div>'+
  '<div class="mq-book-choice is-off"><span class="mq-book-radio">⊘</span><div><strong>Người thân / người được đại diện</strong><p>Yêu cầu xác minh quan hệ đại diện hợp pháp trước khi liên kết hồ sơ.</p><small>Chưa hỗ trợ đăng ký hộ</small></div></div></div>'+
  '<label class="mq-book-field" for="bookingPatientName"><strong>Họ và tên trên phiếu khám <em>*</em></strong><input id="bookingPatientName" name="patientName" autocomplete="name" maxlength="60" minlength="2" required value="'+escape(state.patientName)+'" placeholder="Nhập họ và tên đầy đủ"><small>Họ tên này được gửi tới chức năng cấp phiếu của bệnh viện. Không nhập thông tin người khác.</small></label>'+
  '<div class="mq-book-inline-note">Thông tin ngày sinh, giới tính, số điện thoại và hồ sơ bảo hiểm chưa được lưu bằng biểu mẫu này. Bệnh viện cần bổ sung hồ sơ bệnh nhân đã xác minh trước khi thu thập thêm.</div></section>';
}
function specialtyStep(state,context){
 const {departments=[],rooms=[],live=[]}=context;
 return '<section class="mq-book-section"><h2>Chọn chuyên khoa khám</h2><p class="mq-book-help">Danh sách dưới đây lấy từ các khoa/phòng do hệ thống MediQueue đang cấu hình, không phải danh mục chuyên khoa giả định.</p>'+
 (departments.length?'<div class="mq-book-departments">'+departments.map(d=>{
  const available=departmentAvailable(d.code,departments,rooms,live);
  const roomsCount=rooms.filter(r=>r.department_code===d.code&&r.is_available).length;
  const stat=live.find(v=>v.department_code===d.code);
  const selected=state.department===d.code;
  return '<button type="button" class="mq-book-department '+(selected?'is-picked':'')+'" data-booking-department="'+escape(d.code)+'" aria-pressed="'+String(selected)+'" '+(available?'':'disabled')+'><span class="mq-book-dept-symbol">✚</span><span class="mq-book-dept-copy"><strong>'+escape(d.title)+'</strong><small>'+roomsCount+' phòng hoạt động · '+(stat?.waiting_count??'—')+' phiếu đang chờ</small></span><span class="mq-book-dept-state">'+(available?selected?'Đã chọn':'Chọn khoa':'Tạm ngừng')+'</span></button>';
 }).join('')+'</div>':'<div class="mq-book-warning">Chưa có chuyên khoa khả dụng. Vui lòng liên hệ cơ sở khám hoặc làm mới dữ liệu.</div>')+
 '<div class="mq-book-inline-note">Chưa thể chọn đích danh bác sĩ khi hệ thống chưa có danh sách bác sĩ, lịch trực và suất hẹn được xác nhận.</div></section>';
}
function todayStep(state,context){
 const d=context.departments.find(x=>x.code===state.department);
 const row=context.live.find(x=>x.department_code===state.department);
 return serviceChoices()+'<section class="mq-book-section"><h2>Ngày và cách tiếp nhận</h2>'+
 '<div class="mq-book-date"><span class="mq-book-dept-symbol">◷</span><div><strong>Hôm nay · '+escape(context.dateLabel)+'</strong><p>Phiếu khám theo lượt. Chưa có giờ hẹn cố định hoặc cam kết thời điểm được khám.</p><small>Đúng với chức năng cấp số hiện tại</small></div></div>'+
 '<div class="mq-book-facts"><div><span>Chuyên khoa</span><strong>'+escape(d?.title||'—')+'</strong></div><div><span>Số đang chờ</span><strong>'+escape(row?.waiting_count??'Chưa có dữ liệu')+'</strong></div></div>'+
 '<div class="mq-book-inline-note">Bảo hiểm y tế, khám dịch vụ, chi phí và ưu tiên tiếp nhận được nhân viên kiểm tra tại quầy. MediQueue không xác nhận quyền lợi bảo hiểm hoặc thanh toán ở bước này.</div>'+
 '</section>';
}
function reviewStep(state,context){
 const d=context.departments.find(x=>x.code===state.department);
 return '<section class="mq-book-section"><h2>Kiểm tra và xác nhận</h2><p class="mq-book-help">Chỉ tạo phiếu sau khi hệ thống trả về kết quả cấp số thành công.</p>'+
 '<dl class="mq-book-review"><div><dt>Người khám</dt><dd>'+escape(state.patientName.trim())+'</dd></div><div><dt>Chuyên khoa</dt><dd>'+escape(d?.title||'—')+'</dd></div><div><dt>Ngày</dt><dd>'+escape(context.dateLabel)+'</dd></div><div><dt>Loại đăng ký</dt><dd>Lấy số khám trong ngày</dd></div><div><dt>Địa điểm / phòng</dt><dd>Nhân viên sẽ xác nhận khi check-in</dd></div><div><dt>Giờ hẹn / Bác sĩ</dt><dd>Chưa được chỉ định</dd></div></dl>'+
 '<label class="mq-book-agree"><input type="checkbox" id="bookingAccept" '+(state.accepted?'checked':'')+'><span>Tôi xác nhận thông tin đúng và hiểu rằng đây là <strong>phiếu lấy số trong ngày</strong>, không phải lịch hẹn khám theo giờ.</span></label>'+
 '<div class="mq-book-warning">Nếu có dấu hiệu cần cấp cứu, hãy liên hệ cơ sở cấp cứu hoặc dịch vụ khẩn cấp phù hợp; không chờ phiếu đăng ký trực tuyến.</div>'+
 '<form id="bookingForm"><input type="hidden" name="patientName" value="'+escape(state.patientName.trim())+'"><input type="hidden" name="department" value="'+escape(state.department)+'"><button class="btn btn-primary btn-wide mq-book-submit" type="submit" '+(!state.accepted||context.submitting?'disabled':'')+'>'+(context.submitting?'Đang gửi yêu cầu…':'Xác nhận và nhận số thứ tự')+'</button></form></section>';
}
export function bookingView(state,context){
 const step=state.step;
 const activeName=BOOKING_STEPS[step]||'';
 const body=step===0?patientStep(state,context.profile):step===1?specialtyStep(state,context):step===2?todayStep(state,context):reviewStep(state,context);
 const canNext=step===0?String(state.patientName).trim().length>=2:step===1?departmentAvailable(state.department,context.departments,context.rooms,context.live):true;
 return '<div class="mq-book-layout"><div class="mq-book-main"><div class="mq-book-intro"><span class="mq-book-eyebrow">MEDIQUEUE · TIẾP NHẬN KHÁM BỆNH</span><h1>Đăng ký khám bệnh</h1><p>Thực hiện từng bước để nhận phiếu khám điện tử, QR check-in và theo dõi lượt khám tại cơ sở.</p></div>'+
 stepper(state)+'<div class="mq-book-panel"><div class="mq-book-kicker">BƯỚC '+(step+1)+' / '+BOOKING_STEPS.length+' · '+escape(activeName)+'</div>'+body+
 '<div class="mq-book-actions">'+(step>0?'<button type="button" class="btn btn-ghost" data-booking-back>Quay lại</button>':'<span></span>')+
 (step<3?'<button type="button" class="btn btn-primary" data-booking-next '+(canNext?'':'disabled')+'>Tiếp tục →</button>':'<button type="button" class="btn btn-ghost" data-booking-reset>Làm lại từ đầu</button>')+'</div></div></div>'+
 '<aside class="mq-book-aside"><div class="mq-book-assist"><span class="mq-book-eyebrow">QUY TRÌNH TẠI BỆNH VIỆN</span><h2>Hành trình khám của bạn</h2>'+
 [['01','Chọn khoa tiếp nhận','Chỉ các khoa có phòng hoạt động mới được chọn.'],['02','Nhận số thứ tự','Số được backend cấp; không chọn số hoặc phòng thủ công.'],['03','Nhận QR check-in','Mỗi phiếu có một QR riêng để xuất trình tại quầy.'],['04','Đến quầy xác minh','Nhân viên kiểm tra thông tin và phân phòng phù hợp.'],['05','Theo dõi tiến độ','Xem trạng thái chờ, được gọi và hoàn tất.']].map(x=>'<div class="mq-book-guide"><span>'+x[0]+'</span><div><b>'+x[1]+'</b><p>'+x[2]+'</p></div></div>').join('')+
 '<div class="mq-book-support"><strong>Các dịch vụ cần hệ thống bổ sung</strong><p>Đặt trước ngày/giờ, chọn bác sĩ, người phụ thuộc, xác minh BHYT, giá khám và thanh toán hiện chưa có backend tương ứng. Không tự tạo lịch hoặc khoản thu giả.</p></div></div></aside></div>';
}

/**
 * A truthful outpatient visit timeline built only from server-authorized ticket
 * fields already returned by MediQueue-Dev. No appointment, medical record,
 * physician or insurer status is inferred.
 */
export function ticketJourney(ticket={}){
 const status=String(ticket.status||'');
 const phases=[
  ['Đã cấp số',Boolean(ticket.id||ticket.created_at)],
  ['Check-in tại quầy',Boolean(ticket.checked_in_at)],
  ['Được phân phòng',Boolean(ticket.room_id)],
  ['Đã gọi vào phòng',Boolean(ticket.called_at||['CALLED','SERVING','COMPLETED'].includes(status))],
  ['Đang / đã khám',Boolean(ticket.started_at||['SERVING','COMPLETED'].includes(status))],
  ['Hoàn tất lượt',Boolean(ticket.completed_at||status==='COMPLETED')]
 ];
 const ended=status==='SKIPPED';
 const current=ended?-1:phases.findIndex(([,done])=>!done);
 let guidance='Theo dõi trạng thái phiếu và làm theo hướng dẫn của nhân viên tại cơ sở khám.';
 if(ended)guidance='Phiếu không còn trong hàng chờ. Liên hệ quầy tiếp đón để xác nhận nguyên nhân; hệ thống không tự phân biệt hủy phiếu và bỏ lượt.';
 else if(status==='COMPLETED')guidance='Lượt khám đã hoàn tất. Các chỉ định xét nghiệm, thanh toán hoặc lĩnh thuốc (nếu có) cần được xác nhận riêng tại bệnh viện.';
 else if(status==='SERVING')guidance='Lượt khám đang được phục vụ. Vui lòng làm theo hướng dẫn của nhân viên y tế.';
 else if(status==='CALLED')guidance='Số của bạn đã được gọi. Đến phòng được chỉ định hoặc liên hệ nhân viên nếu cần hỗ trợ.';
 else if(!ticket.checked_in_at)guidance='Hãy xuất trình mã QR và giấy tờ phù hợp để nhân viên kiểm tra tại quầy. Có QR không có nghĩa là đã check-in.';
 else if(!ticket.room_id)guidance='Bạn đã check-in. Nhân viên sẽ xác nhận phòng phù hợp trước khi gọi lượt.';
 else guidance='Bạn đã check-in và có phòng được phân công. Theo dõi bảng gọi số; thời gian và thứ tự có thể thay đổi.';
 return '<section class="mq-visit-journey" aria-label="Tiến trình phiếu khám">'+
  '<div class="mq-visit-heading"><strong>Tiến trình phiếu khám</strong><span>Đối chiếu dữ liệu đang có</span></div>'+
  '<ol class="mq-visit-phases">'+phases.map(([name,done],i)=>{
   const cls=done?'is-done':i===current?'is-current':'is-upcoming';
   const caption=done?'Đã ghi nhận':i===current?'Đang chờ xác nhận':'Chưa ghi nhận';
   return '<li class="mq-visit-phase '+cls+'"'+(i===current?' aria-current="step"':'')+'><span class="mq-visit-phase-index" aria-hidden="true">'+(done?'✓':i+1)+'</span><div><b>'+name+'</b><small>'+caption+'</small></div></li>';
  }).join('')+'</ol>'+
  '<p class="mq-visit-guidance"'+(ended?' role="status"':'')+'>'+guidance+'</p></section>';
}
