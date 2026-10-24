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
let sessionVersion = 0;
let refreshInFlight = null;
try { session = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch { session = null; }
function save(s) { sessionVersion++; session = s ? {...s, expires_at:s.expires_at || Math.floor(Date.now()/1000) + Number(s.expires_in || 3600)} : null; if(session) sessionStorage.setItem(SS_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SS_KEY); }
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
  checked();
  // GitHub Pages URL; Supabase Auth must also allowlist this exact URL.
  const redirect = typeof window !== 'undefined' && window.location?.origin && window.location?.pathname
    ? window.location.origin + window.location.pathname : undefined;
  const endpoint = `${config.url}/auth/v1/signup${redirect ? '?redirect_to=' + encodeURIComponent(redirect) : ''}`;
  const result = await request(endpoint, {method:'POST',headers:headers(),body:JSON.stringify({email,password})});
  if(result?.access_token && result?.refresh_token && result?.user?.id) save(result);
  else if(result?.session?.access_token && result.session?.user?.id) save(result.session);
  return result;
}
/** Handle GoTrue email-confirmation implicit redirects; never persist tokens from
 * the URL until the backend verifies the access token, and clear URL fragments.
 * Password and confirmation tokens are never logged. */
export async function consumeAuthRedirect() {
  if(!config || typeof window === 'undefined' || !window.location) return false;
  const hash=window.location.hash || '';
  if(!hash || (!hash.includes('access_token=') && !hash.includes('error=')))return false;
  const params=new URLSearchParams(hash.startsWith('#')?hash.substring(1):hash);
  const access=params.get('access_token'),refresh=params.get('refresh_token');
  try {
    if(params.get('error')) throw new Error(params.get('error_description') || 'Xác minh email không thành công.');
    if(!access || !refresh)throw new Error('Liên kết xác minh không hợp lệ.');
    const verified=await request(`${config.url}/auth/v1/user`,{headers:headers(access)});
    if(!verified?.id) throw new Error('Không thể xác thực phiên từ email.');
    save({access_token:access,refresh_token:refresh,token_type:'bearer',expires_in:Number(params.get('expires_in') || 3600),user:verified});
    return true;
  } finally {
    if(typeof window.history?.replaceState==='function') {
      window.history.replaceState(null,'',window.location.pathname + window.location.search);
    }
  }
}
export async function signOut() {
  const token=session?.access_token;
  // Invalidate locally before waiting for the network; an old refresh must never restore it.
  save(null);
  if(token) { try { await request(`${config.url}/auth/v1/logout`,{method:'POST',headers:headers(token)}); } catch { /* local session is already cleared */ } }
}
async function getToken() {
  checked(); if(!session?.access_token) throw new Error('Vui lòng đăng nhập.');
  if (!session.refresh_token) throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
  if (!session.expires_at || Date.now()/1000 > session.expires_at-75) {
    const version=sessionVersion;
    if(!refreshInFlight || refreshInFlight.version!==version) {
      const refreshToken=session.refresh_token;
      const task={version};
      task.promise=(async()=>{
        try {
          const s=await request(`${config.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:headers(),body:JSON.stringify({refresh_token:refreshToken})});
          if(sessionVersion!==version) throw new Error('Phiên đăng nhập đã thay đổi.');
          if(!s?.access_token || !s?.refresh_token || !s?.user?.id) throw new Error('Không thể làm mới phiên.');
          save(s);
          return s.access_token;
        } catch(err) {
          if(sessionVersion===version) save(null);
          throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        } finally { if(refreshInFlight===task) refreshInFlight=null; }
      })();
      refreshInFlight=task;
    }
    return refreshInFlight.promise;
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
 const profile=profiles[0];if(!profile)throw new Error('Không tìm thấy hồ sơ người dùng.');
 const access=await rpc('mq_my_access',{});
 if(access?.user_id!==s.user.id || access?.role!==profile.role)throw new Error('Không thể xác minh quyền.');
 if(access.is_hospital_admin){const overview=await rpc('mq_hospital_overview',{});return {profile,access,...overview,tickets:[],overview};}
 const patient=profile.role==='patient';
 const active=(access.assignments||[]).filter(a=>Date.parse(a.valid_from)<=Date.now()&&Date.now()<Date.parse(a.valid_to));
 const codes=[...new Set(active.map(a=>a.department_code))];
 if(!patient&&!codes.length)return {profile,access,departments:[],rooms:[],live:[],roomLive:[],tickets:[]};
 const scope=patient?'':`&department_code=in.(${codes.map(encodeURIComponent).join(',')})`;
 const [departments,rooms,live,roomLive,tickets]=await Promise.all([
  select('mq_departments','select=*'+(patient?'':`&code=in.(${codes.map(encodeURIComponent).join(',')})`)),
  select('mq_rooms','select=*'+scope),select('mq_department_live','select=*'+scope),select('mq_room_live','select=*'+scope),
  select('mq_tickets',`select=*&${patient?`patient_id=eq.${encodeURIComponent(s.user.id)}`:`department_code=in.(${codes.map(encodeURIComponent).join(',')})`}&order=created_at.desc&limit=120`)
 ]);
 return {profile,access,departments,rooms,live,roomLive,tickets};
}
