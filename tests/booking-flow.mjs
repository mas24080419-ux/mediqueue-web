import assert from 'node:assert/strict';
import {BOOKING_STEPS,createBookingState,departmentAvailable,validateBookingStep,bookingView,ticketJourney} from '../booking-flow.js';
const context={
 profile:{display_name:'Nguyễn Văn A'},
 departments:[{code:'GENERAL',title:'Khám tổng quát'},{code:'INTERNAL',title:'Nội tổng hợp'}],
 rooms:[{id:'GENERAL_101',department_code:'GENERAL',is_available:true},{id:'INTERNAL_102',department_code:'INTERNAL',is_available:false}],
 live:[{department_code:'GENERAL',waiting_count:6,is_paused:false},{department_code:'INTERNAL',waiting_count:3,is_paused:false}],
 dateLabel:'Chủ Nhật, 25 tháng 10 năm 2026',submitting:false
};
assert.equal(BOOKING_STEPS.length,4);
assert.equal(departmentAvailable('GENERAL',context.departments,context.rooms,context.live),true);
assert.equal(departmentAvailable('INTERNAL',context.departments,context.rooms,context.live),false,'closed room must block booking');
assert.equal(departmentAvailable('NONEXISTENT',context.departments,context.rooms,context.live),false);
assert.equal(departmentAvailable('GENERAL',context.departments,context.rooms,[{department_code:'GENERAL',is_paused:true}]),false);
const state=createBookingState(context.profile);
assert.equal(state.patientName,'Nguyễn Văn A');
state.patientName=' ';assert.match(validateBookingStep(state,context),/họ tên/);
state.patientName='Nguyễn Văn A';assert.equal(validateBookingStep(state,context),'');
const early=bookingView(state,context);
assert.match(early,/Người thân/);assert.match(early,/chưa được lưu/i);
assert.doesNotMatch(early,/<form id="bookingForm"/,'cannot issue ticket before review');
state.step=1;state.department='INTERNAL';
assert.match(validateBookingStep(state,context),/chuyên khoa/);
assert.match(bookingView(state,context),/disabled/);
state.department='GENERAL';assert.equal(validateBookingStep(state,context),'');
state.step=2;const scheduling=bookingView(state,context);
assert.match(scheduling,/Đặt lịch hẹn theo giờ/);assert.match(scheduling,/Chưa mở đăng ký trực tuyến/);
assert.match(scheduling,/Hôm nay/);assert.doesNotMatch(scheduling,/slot_09:00|available_doctor_id/);
state.step=3;assert.match(validateBookingStep(state,context),/xác nhận/);
assert.match(bookingView(state,context),/disabled/);
state.accepted=true;assert.equal(validateBookingStep(state,context),'');
const review=bookingView(state,context);
assert.match(review,/id="bookingForm"/);assert.match(review,/Khám tổng quát/);
assert.match(review,/lịch hẹn khám theo giờ/);
state.patientName='<img src=x onerror=alert(1)>';
const safe=bookingView(state,context);
assert.doesNotMatch(safe,/<img src=x/,'patient input must not be injected into HTML');
assert.match(safe,/&lt;img/);

// Real ticket timeline must never invent completed steps, medical services or appointments.
const pre=ticketJourney({id:41,status:'WAITING',created_at:'2026-10-25T00:00:00Z'});
assert.match(pre,/Check-in tại quầy/);
assert.match(pre,/Có QR không có nghĩa là đã check-in/);
assert.equal((pre.match(/aria-current="step"/g)||[]).length,1);
const checked=ticketJourney({id:41,status:'WAITING',checked_in_at:'2026-10-25T01:00:00Z',room_id:'GENERAL_101'});
assert.match(checked,/phòng được phân công/);
const called=ticketJourney({id:41,status:'CALLED',checked_in_at:'2026-10-25T01:00:00Z',room_id:'GENERAL_101'});
assert.match(called,/Số của bạn đã được gọi/);
const serving=ticketJourney({id:41,status:'SERVING',checked_in_at:'2026-10-25T01:00:00Z',room_id:'GENERAL_101'});
assert.match(serving,/đang được phục vụ/);
const done=ticketJourney({id:41,status:'COMPLETED',checked_in_at:'2026-10-25T01:00:00Z',room_id:'GENERAL_101'});
assert.match(done,/lượt khám đã hoàn tất/i);
assert.equal((done.match(/class="mq-visit-phase is-done"/g)||[]).length,6);
const skipped=ticketJourney({id:41,status:'SKIPPED'});
assert.doesNotMatch(skipped,/aria-current="step"/);
assert.match(skipped,/không tự phân biệt hủy phiếu và bỏ lượt/);
for(const html of [pre,checked,called,serving,done,skipped])assert.equal((html.match(/<li /g)||[]).length,6);

console.log('PASS: four-step hospital reception wizard, truthful backend scope, closed-department denial and input sanitization.');
