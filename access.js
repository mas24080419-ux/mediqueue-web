// Presentation policy only. PostgreSQL independently authorizes every read/write.
export const titles={reception:'Tiếp đón',doctor:'Bác sĩ khám',nurse:'Điều dưỡng',laboratory:'Xét nghiệm',imaging:'Chẩn đoán hình ảnh',pharmacy:'Khoa Dược',cashier:'Thu ngân / BHYT',department_lead:'Trưởng khoa'};
const tasks={reception:['read','checkin','transfer','RESTORE'],doctor:['read','call','START','FINISH','SKIP','recall'],nurse:['read'],department_lead:['read','checkin','transfer','call','START','FINISH','SKIP','RESTORE','PRIORITY','recall','pause','audit']};
export function activeAssignments(access,at=Date.now()) {return (access?.assignments||[]).filter(a=>Date.parse(a.valid_from)<=at&&at<Date.parse(a.valid_to));}
export function permitted(access,task,department,room,assignmentId) {
 return activeAssignments(access).some(a=>(!assignmentId||a.id===assignmentId)&&a.department_code===department&&(!a.room_id||a.room_id===room)&&(tasks[a.job_title]||[]).includes(task));
}
export function menuFor(access,portal,assignmentId) {
 const common=[['guide','Hướng dẫn','help'],['account','Thông tin tài khoản','users']];
 if(!access)return [['account','Đăng nhập','key'],['guide','Hướng dẫn','help']];
 if(portal==='patient')return access.role==='patient'?[['home','Tổng quan','grid'],['book','Đăng ký khám','calendar'],['track','Phiếu khám của tôi','clipboard'],...common]:[['account','Cổng không phù hợp','key']];
 if(portal==='admin')return access.is_hospital_admin?[['admin-home','Tổng quan bệnh viện','grid'],['departments','Khoa & phòng khám','floor'],['access','Tài khoản & phân quyền','key'],['admin-security','Kiểm tra an toàn','shield'],['audit','Nhật ký & giám sát','file'],...common]:[['account','Chờ cấp quyền / MFA','key'],['guide','Hướng dẫn','help']];
 const a=activeAssignments(access).find(x=>x.id===assignmentId)||activeAssignments(access)[0];
 if(access.role!=='staff'||!a)return [['account','Chờ cấp phân công','key'],['guide','Hướng dẫn','help']];
 const result=[['work-home','Tổng quan khoa','grid'],['tasks','Lượt khám / công việc','clipboard']];
 if(['reception','department_lead'].includes(a.job_title))result.push(['reception','Tiếp đón bệnh nhân','users']);
 if(['doctor','department_lead'].includes(a.job_title))result.push(['staff','Điều phối phòng khám','stethoscope']);
 result.push(['board','Bảng gọi số TV','monitor']);
 if(a.job_title==='department_lead')result.push(['analytics','Báo cáo hoạt động','chart']);
 return [...result,...common];
}
export function routeAllowed(route,access,portal,assignmentId){return menuFor(access,portal,assignmentId).some(x=>x[0]===route);}
