import {titles,activeAssignments,menuFor} from './access.js';
const icons={
    hospital:'<path d="M4 21V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v15M2 21h20M9 21v-6h6v6M9 9h6m-3-3v6"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="m9 15 2 2 4-4"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3a4 4 0 0 1 0 8"/>',
    stethoscope:'<path d="M6 3v6a5 5 0 0 0 10 0V3M4 3h4m6 0h4M11 14v2a5 5 0 0 0 10 0v-2"/><circle cx="21" cy="12" r="2"/>',
    monitor:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
    chart:'<path d="M4 20V9m6 11V4m6 16v-8m4 8v-5"/>',

    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M4 9l-2 3 2 3 3 1 2 3h6l2-3 3-1 2-3-2-3-3-1-2-3H9L7 8z"/>',
    floor:'<path d="M3 21h18M5 21V5l7-2 7 2v16M9 8h2m3 0h2M9 12h2m3 0h2M9 16h2m3 0h2"/>',
    key:'<circle cx="8" cy="15" r="5"/><path d="m12 12 9-9m-2 0h2v3m-7 1 3 3"/>',

    file:'<path d="M7 3h8l4 4v14H7zM15 3v5h4M10 13h6m-6 4h6"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m-3-9h1"/>',
    close:'<path d="M18 6 6 18M6 6l12 12"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    exit:'<path d="M10 17l5-5-5-5m5 5H3M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>',

  };
export const svg=(name)=>'<svg aria-hidden="true" viewBox="0 0 24 24">'+(icons[name]||icons.grid)+'</svg>';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let groupOpen=false;
export function sidebar({access,portal,currentRoute,profile,assignmentId,mode}){
 const a=activeAssignments(access).find(x=>x.id===assignmentId)||activeAssignments(access)[0];
 const admin=portal==='admin',patient=portal==='patient';
 const headline=admin?'Điều hành toàn viện':patient?'Cổng bệnh nhân':titles[a?.job_title]||'Không gian chuyên môn';
 const sub=mode==='demo'?'DỮ LIỆU GIẢ · DEMO':admin?'HOSPITAL SUPER ADMIN':patient?'CÁ NHÂN · MEDIQUEUE':a?.department_code||'CHƯA CÓ PHÂN CÔNG';
 const menus=menuFor(access,portal,assignmentId);
 const link=([id,title,icon])=>`<button type="button" class="mq-item ${currentRoute===id?'is-active':''}" data-page="${id}" title="${E(title)}" ${currentRoute===id?'aria-current="page"':''}>${svg(icon)}<span class="mq-nav-text">${E(title)}</span></button>`;
 const grouped=admin?['access','admin-security']:['reception','staff'];
 const child=menus.filter(x=>grouped.includes(x[0]));
 const expanded=groupOpen||child.some(x=>x[0]===currentRoute);
 const groupHtml=child.length?`<div class="mq-group"><button type="button" class="mq-group-trigger" data-sidebar="group" aria-expanded="${expanded}" aria-controls="mq-group-live">${svg(admin?'settings':'stethoscope')}<span class="mq-nav-text">${admin?'Quản trị hệ thống':'Nghiệp vụ khoa/phòng'}</span>${svg('chevron').replace('<svg','<svg class="mq-caret"')}</button><div class="mq-subnav" id="mq-group-live" ${expanded?'':'hidden'}>${child.map(link).join('')}</div></div>`:'';
 let inserted=false;const nav=menus.map(item=>{if(grouped.includes(item[0])){if(inserted)return '';inserted=true;return groupHtml;}return link(item);}).join('');
 const scope=a?`${a.department_code}${a.room_id?' · '+a.room_id:''}`:admin&&access?.is_hospital_admin?'Toàn bệnh viện':patient?'Tài khoản cá nhân':'Chờ xác minh quyền';
 const name=profile?.display_name|| (patient?'Bệnh nhân':admin?'Quản trị bệnh viện':'Nhân viên y tế');
 return `<aside class="work-side" id="mq-drawer" aria-label="Thanh điều hướng MediQueue"><div class="mq-side-inner"><div class="mq-drawer-head"><button type="button" class="mq-sidebar-toggle mq-drawer-close" data-sidebar="close" aria-label="Đóng menu">${svg('close')}</button></div><div class="mq-side-summary"><div class="mq-dept-icon">${svg(admin?'shield':patient?'users':'hospital')}</div><div class="mq-side-summary-text"><strong id="sideLabel">${E(headline)}</strong><small>${E(sub)}</small></div></div><div class="mq-side-scroll"><span class="mq-section-label">ĐIỀU HƯỚNG CHÍNH</span><nav class="mq-nav" aria-label="Menu ${portal}">${nav}</nav><div class="mq-notice">${mode==='demo'?'Đang xem dữ liệu mô phỏng. Không cấp quyền tài khoản thật.':patient?'Chỉ hiển thị chức năng bệnh nhân.':admin?'Quyền toàn viện yêu cầu cấp riêng và xác thực MFA.':'Phạm vi và ca trực được xác minh tại Supabase.'}</div></div><div class="mq-side-bottom"><button type="button" class="mq-user-button" data-sidebar="profile" aria-expanded="false" aria-controls="mq-profile-detail"><span class="mq-avatar ${admin?'admin':''}">${patient?'BN':admin?'QT':'NV'}</span><span class="mq-user-txt"><strong>${E(name)}</strong><small>${E(scope)}</small></span>${svg('settings')}</button><div class="mq-profile-menu" id="mq-profile-detail" hidden><p>${E(scope)}</p><button class="mq-item" data-page="account">${svg('users')} Tài khoản</button>${access?`<button class="mq-item" data-action="logout">${svg('exit')} Đăng xuất</button>`:''}</div></div></div><button type="button" class="mq-sidebar-toggle mq-toggle-desktop" data-sidebar="collapse" title="Thu gọn / mở rộng thanh bên" aria-label="Thu gọn / mở rộng thanh bên">${svg('panel')}</button></aside>`;
}
let installed=false,lastFocus=null;
export function installSidebar(){if(installed)return;installed=true;
 const drawer=open=>{document.body.classList.toggle('mq-drawer-open',open);document.querySelector('[data-sidebar="open"]')?.setAttribute('aria-expanded',String(open));if(open){lastFocus=document.activeElement;document.querySelector('.mq-drawer-close')?.focus();}else lastFocus?.focus?.();};
 document.addEventListener('click',e=>{const b=e.target.closest('[data-sidebar]');if(b){const type=b.dataset.sidebar;if(type==='open'||type==='close')drawer(type==='open');if(type==='collapse'){const on=document.body.classList.toggle('mq-sidebar-collapsed');b.setAttribute('aria-pressed',String(on));}if(type==='group'){document.body.classList.remove('mq-sidebar-collapsed');const box=document.getElementById(b.getAttribute('aria-controls'));box.hidden=!box.hidden;groupOpen=!box.hidden;b.setAttribute('aria-expanded',String(!box.hidden));}if(type==='profile'){const box=document.getElementById('mq-profile-detail');box.hidden=!box.hidden;b.setAttribute('aria-expanded',String(!box.hidden));}}
 if(e.target.closest('[data-page]')&&window.innerWidth<=900)drawer(false);
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')drawer(false);if(e.key==='Tab'&&document.body.classList.contains('mq-drawer-open')){const nodes=[...document.querySelectorAll('#mq-drawer button:not([disabled]),#mq-drawer a')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
}
