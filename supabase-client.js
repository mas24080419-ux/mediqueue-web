// Minimal dependency-free Supabase Auth / PostgREST bridge for static GitHub Pages.
// Only authenticated REST calls with a user JWT. No service-role key, no elevated admin API.
let config = null;
try {
  const c = await import('./config.js');
  if (c.SUPABASE_URL?.startsWith('https://') && /sb_publishable_|^eyJ/.test(c.SUPABASE_PUBLISHABLE_KEY || '')) {
    config = { url: c.SUPABASE_URL.replace(/\/$/, ''), key: c.SUPABASE_PUBLISHABLE_KEY };
  }
} catch { /* config is optional for GitHub Pages demo */ }

export const hasCloudConfig = () => !!config;
const SS_KEY = 'mq_web_session_v2';
let session = null;
try { session = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch { session = null; }
function save(s) { session = s ? {...s, expires_at:s.expires_at || Math.floor(Date.now()/1000) + Number(s.expires_in || 3600)} : null; if(session) sessionStorage.setItem(SS_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SS_KEY); }
export const getSession = () => session;
function headers(accessToken, more={}) { return { apikey:config.key, ...(accessToken?{Authorization:`Bearer ${accessToken}`}:{ }), 'Content-Type':'application/json', ...more }; }
async function request(url, options={}) {
  const response = await fetch(url, options);
  const body = await response.text();
  let json = null; try { json=body ? JSON.parse(body) : null; } catch { json=body; }
  if (!response.ok) throw new Error(json?.msg || json?.message || json?.error_description || json?.error || `HTTP ${response.status}`);
  return json;
}
function checked() { if(!config) throw new Error('Chưa có cấu hình Supabase cho website.'); }
export async function signIn(email,password) {
  checked(); const result = await request(`${config.url}/auth/v1/token?grant_type=password`, {method:'POST',headers:headers(),body:JSON.stringify({email,password})});
  if(!result?.access_token || !result?.refresh_token || !result?.user?.id) throw new Error('Phiên xác thực không hợp lệ.'); save(result); return getSession();
}
export async function signUp(email,password) {
  checked(); return request(`${config.url}/auth/v1/signup`, {method:'POST',headers:headers(),body:JSON.stringify({email,password})});
}
export async function signOut() {
  if (session?.access_token) {try { await request(`${config.url}/auth/v1/logout`,{method:'POST',headers:headers(session.access_token)}); } catch { /* clear local even if network fails */ } }
  save(null);
}
async function getToken() {
  checked(); if(!session?.access_token) throw new Error('Vui lòng đăng nhập.');
  if (!session.refresh_token) throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
  if (!session.expires_at || Date.now()/1000 > session.expires_at-75) {
    try { const s=await request(`${config.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:headers(),body:JSON.stringify({refresh_token:session.refresh_token})});
      if(!s?.access_token || !s?.refresh_token) throw new Error('Không thể làm mới phiên.'); save(s);
    } catch(err) { save(null); throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); }
  }
  return session.access_token;
}
export async function select(table,query='') {
  const token=await getToken();
  return request(`${config.url}/rest/v1/${table}${query?`?${query}`:''}`,{headers:headers(token)});
}
export async function rpc(method,args) {
  const token=await getToken();
  return request(`${config.url}/rest/v1/rpc/${method}`,{method:'POST',headers:headers(token),body:JSON.stringify(args)});
}
export async function loadCloudData() {
  const s=getSession(); if(!s?.user?.id) throw new Error('Chưa có tài khoản.');
  const profiles=await select('mq_profiles',`select=id,display_name,role,department_code&id=eq.${encodeURIComponent(s.user.id)}`);
  const profile=profiles[0];if(!profile) throw new Error('Không tìm thấy hồ sơ và vai trò người dùng.');
  const isStaff=profile.role==='staff'||profile.role==='admin';
  const d=profile.department_code;
  const [departments,rooms,live,roomLive,tickets]=await Promise.all([
    select('mq_departments','select=*'),select('mq_rooms','select=*'),select('mq_department_live','select=*'),
    select('mq_room_live','select=*'),
    select('mq_tickets',`select=*&${isStaff?(d?`department_code=eq.${encodeURIComponent(d)}`:'id=gt.0'):`patient_id=eq.${encodeURIComponent(s.user.id)}`}&order=created_at.desc&limit=120`)
  ]);
  return {profile,departments,rooms,live,roomLive,tickets};
}
