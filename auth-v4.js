// V4 authentication gateway. The hospital workspace is imported only after
// Supabase has verified the session AND its server-issued portal access.
import {hasCloudConfig,getSession,signIn,signUp,signOut,loadCloudData,
        consumeAuthRedirect,requestPasswordReset,updateOwnPassword} from './supabase-client.js';

const path=window.location.pathname;
const portal=/\/admin\.html$/i.test(path)?'admin':/\/staff\.html$/i.test(path)?'staff':'patient';
const root=document.getElementById('app');
let mode='login',flipped=false,busy=false,error='',info='',email='',fullName='';
let recoveryRedirect=false,launched=false;
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={patient:'Bệnh nhân',staff:'Nhân viên',admin:'Quản trị'};
const links={patient:'./index.html',staff:'./staff.html',admin:'./admin.html'};
function input(name,label,type='text',auto='',placeholder=''){
 const isPass=type==='password';
 return '<label class="mqn-field"><span>'+label+'</span><div class="mqn-input"><input name="'+name+'" type="'+type+'" autocomplete="'+auto+'" placeholder="'+placeholder+'" '+(isPass?'minlength="8" maxlength="128" ':'')+'required />'+(isPass?'<button type="button" data-show-password aria-label="Hiện mật khẩu">Hiện</button>':'')+'</div></label>';
}
function messages(){return (error?'<p class="mqn-error" role="alert">'+escapeHTML(error)+'</p>':'')+(info?'<p class="mqn-info" role="status">'+escapeHTML(info)+'</p>':'');}
function front(){
 const desc=portal==='patient'?'Đăng nhập để đăng ký khám và theo dõi lượt khám.':portal==='staff'?'Sử dụng tài khoản do bệnh viện cấp để truy cập công việc được phân công.':'Quản trị toàn viện yêu cầu tài khoản được cấp quyền và xác thực tăng cường.';
 return '<section class="mqn-face front" id="mqn-face-front"><div class="mqn-main"><div class="mqn-icon">✚</div><h2>Chào mừng trở lại</h2><p class="mqn-description">'+desc+'</p><form id="mqn-login-form">'+input('email','Địa chỉ email','email','email','name@example.com')+input('password','Mật khẩu','password','current-password','Nhập mật khẩu')+(portal==='patient'?'<div class="mqn-tools"><button class="mqn-link" type="button" data-view="recover">Quên mật khẩu?</button></div>':'')+messages()+'<button class="mqn-submit" type="submit" '+(busy?'disabled':'')+'>'+(busy?'Đang xác minh…':'Đăng nhập')+'</button></form><p class="mqn-note">'+(portal==='patient'?'Bạn có thể tạo tài khoản bệnh nhân.':'Nhân viên và quản trị viên chỉ sử dụng tài khoản đã được bệnh viện cấp.')+'</p></div><div class="mqn-footer">'+(portal==='patient'?'<p>Chưa có tài khoản?<br><strong>Đăng ký bệnh nhân</strong></p><button type="button" class="mqn-switch" data-flip="signup" aria-label="Chuyển sang đăng ký">⇄</button>':'<p><strong>Truy cập được kiểm soát</strong><br>Quyền được máy chủ xác minh.</p>')+'</div></section>';
}
function back(){
 return '<section class="mqn-face back" id="mqn-face-back"><div class="mqn-main"><div class="mqn-icon">♡</div><h2>Đăng ký bệnh nhân</h2><p class="mqn-description">Tạo tài khoản để đăng ký khám và quản lý phiếu cá nhân.</p><form id="mqn-signup-form">'+input('fullName','Họ và tên','text','name','Họ và tên')+input('email','Địa chỉ email','email','email','name@example.com')+input('password','Tạo mật khẩu','password','new-password','Tối thiểu 8 ký tự')+messages()+'<button class="mqn-submit" type="submit" '+(busy?'disabled':'')+'>'+(busy?'Đang xử lý…':'Tạo tài khoản')+'</button></form><p class="mqn-note">Vui lòng xác minh email theo hướng dẫn được gửi đến hộp thư của bạn.</p></div><div class="mqn-footer"><p>Đã có tài khoản?<br><strong>Quay lại đăng nhập</strong></p><button type="button" class="mqn-switch" data-flip="login" aria-label="Quay lại đăng nhập">⇄</button></div></section>';
}
function phasePanel(){
 const recovery=mode==='recover',change=mode==='change-password';
 const title=change?'Đặt mật khẩu mới':recovery?'Khôi phục mật khẩu':'Kiểm tra hộp thư';
 const body=change?'Nhập mật khẩu mới cho tài khoản đã xác minh bằng liên kết email.':recovery?'Nhập email để nhận liên kết khôi phục mật khẩu.':info;
 const form=change?'<form id="mqn-change-form">'+input('password','Mật khẩu mới','password','new-password','Tối thiểu 8 ký tự')+input('confirm','Nhập lại mật khẩu','password','new-password','Nhập lại mật khẩu')+'<button class="mqn-submit" type="submit" '+(busy?'disabled':'')+'>Cập nhật mật khẩu</button></form>':recovery?'<form id="mqn-recover-form">'+input('email','Email tài khoản','email','email','name@example.com')+'<button class="mqn-submit" type="submit" '+(busy?'disabled':'')+'>Gửi hướng dẫn</button></form>':'';
 return '<section class="mqn-panel"><div class="mqn-icon">✉</div><h2>'+title+'</h2><p class="mqn-description">'+escapeHTML(body)+'</p>'+messages()+form+'<button type="button" class="mqn-link mqn-return" data-view="login">Quay lại đăng nhập</button></section>';
}
function render(){
 document.body.className='mqn-page';document.title='MediQueue | Đăng nhập';
 root.innerHTML='<main class="mqn-layout"><div class="mqn-orb first" aria-hidden="true"></div><div class="mqn-orb second" aria-hidden="true"></div><section class="mqn-intro"><a class="mqn-brand" href="./index.html"><span class="mqn-symbol">✚</span><span><b>MediQueue</b><small>SMART HOSPITAL EXPERIENCE</small></span></a><div class="mqn-eyebrow"><span class="mqn-dot"></span>NỀN TẢNG ĐIỀU PHỐI KHÁM BỆNH</div><h1>Chạm nhẹ.<br>Đăng nhập dễ dàng.<br><em>Chăm sóc tốt hơn.</em></h1><p>Không gian khám bệnh và quản lý công việc rõ ràng, dễ sử dụng. Quyền truy cập được xác minh trước khi mở thông tin bệnh viện.</p><div class="mqn-benefits"><span>✓ Xác minh danh tính</span><span>⌁ Theo khoa/phòng</span><span>◷ Thao tác thuận tiện</span></div><div class="mqn-intro-foot">MEDIQUEUE · CHĂM SÓC VÀ ĐIỀU PHỐI</div></section><section class="mqn-auth"><div class="mqn-topline"><span>CỔNG TRUY CẬP MEDIQUEUE</span><span class="mqn-security">BẢO MẬT TÀI KHOẢN</span></div><nav class="mqn-roles" aria-label="Chọn cổng truy cập">'+Object.entries(names).map(([key,label])=>'<a class="mqn-role" href="'+links[key]+'" '+(portal===key?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>'+(mode==='login'?'<div class="mqn-stage"><div id="mqn-card" class="mqn-card '+(flipped?'flipped':'')+'">'+front()+back()+'</div></div>':phasePanel())+'<p class="mqn-smallprint">Mỗi tài khoản chỉ được sử dụng các chức năng đã được cấp quyền.</p></section></main>';
 const faces=[root.querySelector('#mqn-face-front'),root.querySelector('#mqn-face-back')];
 if(faces[0]){faces[0].inert=flipped;faces[0].setAttribute('aria-hidden',String(flipped));}
 if(faces[1]){faces[1].inert=!flipped;faces[1].setAttribute('aria-hidden',String(!flipped));}
}
function alertFailure(ex){error=ex?.message||'Yêu cầu không thể hoàn tất. Vui lòng thử lại.';info='';render();}
function canEnter(data){
 if(!data?.access||!data?.profile)return false;
 if(portal==='patient')return data.profile.role==='patient'&&data.access.role==='patient';
 if(portal==='staff')return data.profile.role==='staff'&&data.access.role==='staff';
 return data.profile.role==='admin'&&data.access.is_hospital_admin===true;
}
async function workspace(){
 const data=await loadCloudData(); // includes server-side mq_my_access() evaluation
 if(!canEnter(data))throw new Error('Tài khoản không có quyền sử dụng cổng này. Hãy chọn cổng phù hợp.');
 if(launched)return;
 launched=true;
 // Load old workspace CSS only after entering, to avoid shared CSS overriding V4 login.
 for(const href of ['auth-v3.css','styles.css','dashboard.css','premium-sidebar.css','integration.css']){
  const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
 }
 document.body.className='workspace';
 root.innerHTML='';
 await import('./app.js');
}
async function verifiedWorkspace(){
 try{await workspace();}
 catch(e){await signOut();launched=false;alertFailure(e);}
}
root.addEventListener('click',e=>{
 const switcher=e.target.closest('[data-flip]');
 if(switcher && portal==='patient' && !busy){
  flipped=switcher.dataset.flip==='signup';error='';info='';
  const card=root.querySelector('#mqn-card');card?.classList.toggle('flipped',flipped);
  for(const [sel,inactive] of [['#mqn-face-front',flipped],['#mqn-face-back',!flipped]]){
   const el=root.querySelector(sel);if(el){el.inert=inactive;el.setAttribute('aria-hidden',String(inactive));}
  }
  return;
 }
 const view=e.target.closest('[data-view]');
 if(view && !busy){
  mode=view.dataset.view;error='';info='';flipped=false;
  if(mode==='login'&&recoveryRedirect){signOut();recoveryRedirect=false;}
  render();return;
 }
 const pw=e.target.closest('[data-show-password]');
 if(pw){const input=pw.parentElement.querySelector('input');if(input){input.type=input.type==='password'?'text':'password';pw.textContent=input.type==='password'?'Hiện':'Ẩn';pw.setAttribute('aria-label',input.type==='password'?'Hiện mật khẩu':'Ẩn mật khẩu');}}
});
root.addEventListener('submit',async event=>{
 const f=event.target;if(!['mqn-login-form','mqn-signup-form','mqn-recover-form','mqn-change-form'].includes(f.id))return;
 event.preventDefault();if(busy)return;busy=true;error='';info='';
 const values=new FormData(f),username=String(values.get('email')||'').trim(),password=String(values.get('password')||''),name=String(values.get('fullName')||'').trim();
 const action=f.id;render();
 try{
  if(action==='mqn-login-form'){
   if(!username||password.length<8)throw new Error('Vui lòng nhập email và mật khẩu hợp lệ.');
   await signIn(username,password);
   await workspace();return;
  }
  if(action==='mqn-signup-form'){
   if(portal!=='patient')throw new Error('Chỉ bệnh nhân được tự đăng ký.');
   if(name.length<2||password.length<8)throw new Error('Kiểm tra họ tên và mật khẩu (tối thiểu 8 ký tự).');
   await signUp(username,password,name);
   // A public signup must never authorize staff/admin from user-supplied metadata.
   if(getSession()){await signOut();}
   mode='notice';info='Nếu địa chỉ email hợp lệ, bạn sẽ nhận được hướng dẫn xác minh tài khoản.';
  }else if(action==='mqn-recover-form'){
   if(portal!=='patient')throw new Error('Vui lòng liên hệ bộ phận quản trị để khôi phục tài khoản nội bộ.');
   await requestPasswordReset(username);
   mode='notice';info='Nếu tài khoản tồn tại, hướng dẫn khôi phục sẽ được gửi đến email.';
  }else{
   if(!recoveryRedirect||!getSession())throw new Error('Liên kết khôi phục không hợp lệ hoặc đã hết hạn.');
   if(password.length<8||password!==String(values.get('confirm')||''))throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự và trùng khớp.');
   await updateOwnPassword(password);await signOut();
   recoveryRedirect=false;mode='notice';info='Mật khẩu đã được cập nhật. Hãy đăng nhập lại.';
  }
 }catch(e){
  if(action==='mqn-login-form' && getSession())await signOut();
  error=e?.message||'Không thể hoàn tất yêu cầu.';
 }finally{busy=false;if(!launched)render();}
});
async function start(){
 if(!hasCloudConfig()){error='Cổng xác thực chưa được cấu hình. Vui lòng liên hệ quản trị hệ thống.';render();return;}
 // Supabase Auth implicit callbacks are verified against /auth/v1/user before being saved.
 recoveryRedirect=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
 try{await consumeAuthRedirect();}catch(e){error=e.message;}
 if(recoveryRedirect){
   mode=getSession()?'change-password':'login';
   if(!getSession())error=error||'Liên kết khôi phục không hợp lệ hoặc đã hết hạn.';
   render();return;
 }
 if(getSession()){await verifiedWorkspace();if(launched)return;}
 render();
}
await start();
