import assert from 'node:assert/strict';
import {BOOKING_STEPS,createBookingState,departmentAvailable,validateBookingStep,bookingView} from '../booking-flow.js';
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
assert.match(scheduling,/Đặt lịch hẹn theo giờ/);assert.match(scheduling,/Chưa có hồ sơ đã xác minh hoặc lịch khám được công bố/);
assert.match(scheduling,/Hôm nay/);
assert.doesNotMatch(scheduling,/data-booking-v5-service/,'appointment form must stay hidden in ticket mode');
state.mode='appointment';
const v5Disabled=validateBookingStep(state,{...context,v5:{ready:false,profiles:[],services:[],slots:[]}});
assert.match(v5Disabled,/Lịch hẹn chưa được kết nối/);
state.mode='ticket';assert.doesNotMatch(scheduling,/slot_09:00|available_doctor_id/);
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
console.log('PASS: four-step hospital reception wizard, truthful backend scope, closed-department denial and input sanitization.');
