// Public QR landing: strictly parse the first-party fragment; never fetch patient data.
// Link ownership and check-in status must be verified server-side by authorized users.
import {qrToken,parseTicketQrPayload} from './ticket-qr.js';
const params=new URLSearchParams(window.location.hash.slice(1));
const raw=params.size===1?params.get('code'):null;
const value=qrToken(raw);
const message=document.getElementById('scan-message');
const status=document.getElementById('scan-status');
const badge=document.getElementById('scan-token');
const copy=document.getElementById('scan-copy');
const staff=document.getElementById('scan-staff');
if(value && parseTicketQrPayload(window.location.href)===value){
 message.textContent='Mã check-in đã được đọc thành công. Vui lòng xuất trình tại quầy tiếp đón.';
 status.textContent='Mã đã nhận · Chưa xác minh trạng thái phiếu';
 status.classList.add('ok');
 badge.textContent='Mã kết thúc bằng ···'+value.slice(-8);
 badge.hidden=false;copy.hidden=false;staff.hidden=false;
 staff.href='./staff.html#checkin='+encodeURIComponent(value);
 copy.addEventListener('click',async()=>{
  try{
   await navigator.clipboard.writeText(value);
   copy.textContent='Đã sao chép mã';
  }catch{
   badge.textContent=value;
   badge.setAttribute('aria-label','Mã check-in');
   copy.textContent='Sao chép không khả dụng · Mã đã hiện bên trên';
  }
 });
}else{
 message.textContent='Không tìm thấy mã check-in đúng định dạng trên liên kết này.';
 status.textContent='Mã không hợp lệ hoặc thiếu mã phiếu';
 status.classList.add('bad');
}
