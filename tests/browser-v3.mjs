// Browser UI integration against deterministic mock Auth/PostgREST only.
// This is NOT authenticated live-Supabase E2E evidence.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('.'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain';res.setHeader('Content-Type',type);res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(4173,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const results=[],failures=[];
const now=Date.now(),uid='11111111-1111-4111-8111-111111111111';
const departments=[{code:'GENERAL',title:'Khám tổng quát',prefix:'T'},{code:'INTERNAL',title:'Nội tổng hợp',prefix:'N'}];
const rooms=[{id:'GENERAL_101',title:'Phòng 101',department_code:'GENERAL',is_available:true},{id:'GENERAL_104',title:'Phòng 104',department_code:'GENERAL',is_available:true}];
const ticket={id:71,date_key:new Date().toISOString().slice(0,10),department_code:'GENERAL',room_id:'GENERAL_101',queue_number:71,patient_name:'UI TEST · Bệnh nhân giả',patient_id:uid,status:'WAITING',checked_in_at:new Date().toISOString(),created_at:new Date().toISOString(),qr_nonce:'22222222-2222-4222-8222-222222222222'};
function fixture(job){const role=job==='patient'?'patient':job==='admin'?'admin':'staff';return {profile:{id:uid,role,department_code:role==='staff'?'GENERAL':null,display_name:'UI TEST · '+job},access:{user_id:uid,role,is_hospital_admin:job==='admin',state:job==='unassigned'?'awaiting_provisioning':role,assignments:role==='staff'&&job!=='unassigned'?[{id:'fixture-grant',job_title:job,department_code:'GENERAL',room_id:job==='doctor'?'GENERAL_101':null,valid_from:new Date(now-3600000).toISOString(),valid_to:new Date(now+3600000).toISOString()}]:[]}};}
async function mock(context,job){const f=fixture(job);await context.route('https://*.supabase.co/**',async route=>{const u=new URL(route.request().url()),p=u.pathname;let status=200,data=[];
 if(p.endsWith('/mq_profiles'))data=[f.profile];
 else if(p.endsWith('/mq_my_access'))data=f.access;
 else if(p.endsWith('/mq_hospital_overview'))data={departments,rooms,live:[{department_code:'GENERAL',waiting_count:1}],roomLive:[],assignments_count:0,audit_count:0};
 else if(p.endsWith('/mq_departments'))data=departments;
 else if(p.endsWith('/mq_rooms'))data=rooms;
 else if(p.endsWith('/mq_department_live'))data=[{department_code:'GENERAL',waiting_count:1,is_paused:false}];
 else if(p.endsWith('/mq_room_live'))data=[];
 else if(p.endsWith('/mq_tickets'))data=['patient','reception','doctor','nurse','department_lead'].includes(job)?[ticket]:[];
 else if(p.endsWith('/mq_my_wait_info'))data=[{queue_position:1,estimate_minutes:12}];
 else if(p.endsWith('/token')){const body=route.request().postDataJSON();if(body.password==='valid-fixture-password')data={access_token:'mock-only-access',refresh_token:'mock-only-refresh',expires_in:3600,user:{id:uid,email:'qa@example.invalid'}};else{status=400;data={message:'Invalid login credentials'};}}
 else if(p.endsWith('/signup'))data={user:{id:uid}};
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });return f;}
const jobs=['patient','reception','doctor','nurse','laboratory','imaging','pharmacy','cashier','department_lead','admin','unassigned'];
try{
 for(const job of jobs)for(const width of [1440,1280,1024,768,390,360]){
  const context=await browser.newContext({viewport:{width,height:960}});await mock(context,job);
  await context.addInitScript(({uid})=>sessionStorage.setItem('mq_web_session_v2',JSON.stringify({access_token:'mock-only-access',refresh_token:'mock-only-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:uid,email:'qa@example.invalid'}})),{uid});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   const file=job==='patient'?'index.html':job==='admin'?'admin.html':'staff.html';
   await page.goto('http://127.0.0.1:4173/'+file);await page.getByRole('button',{name:'Thu gọn / mở rộng thanh bên',exact:true}).waitFor();
   await page.waitForFunction(()=>!document.body.textContent.includes('Đăng nhập bệnh nhân')&&!document.body.textContent.includes('Đăng nhập nội bộ'));
   const nav=page.locator('.mq-nav');
   if(job==='patient'){assert.equal(await nav.getByRole('button',{name:'Điều phối phòng khám',exact:true}).count(),0);assert.equal(await nav.getByRole('button',{name:'Tài khoản & phân quyền',exact:true}).count(),0);}
   if(job==='doctor'){assert.equal(await nav.getByRole('button',{name:'Tiếp đón bệnh nhân',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Xác nhận check-in',exact:true}).count(),0);}
   if(job==='reception')assert.equal(await page.getByRole('button',{name:'Gọi lượt tiếp theo',exact:true}).count(),0);
   if(job==='admin')assert.equal(await page.getByText(ticket.patient_name,{exact:true}).count(),0);
   assert.equal(await page.locator('[data-role],#roleList').count(),0,'no arbitrary role switch');
   const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(dims.scroll<=dims.width+2,JSON.stringify(dims));
   if(width<=900){const open=page.getByRole('button',{name:'Mở menu',exact:true});await open.click();assert.equal(await open.getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await open.getAttribute('aria-expanded'),'false');}
   else {const toggle=page.getByRole('button',{name:'Thu gọn / mở rộng thanh bên',exact:true});await toggle.click();assert.ok(await page.locator('body').evaluate(b=>b.classList.contains('mq-sidebar-collapsed')));await toggle.click();}
   assert.deepEqual(errors,[]);
   if(['patient','doctor','admin'].includes(job)&&[1440,390].includes(width)){
    if(width===390)await page.getByRole('button',{name:'Mở menu',exact:true}).click();
    await page.screenshot({path:path.join(out,`${job}-${width}-MOCK.png`),fullPage:true});
   }
   results.push({job,width,status:'PASS',evidence:'mock API / browser UI'});
  }catch(e){failures.push({job,width,error:e.message});await page.screenshot({path:path.join(out,`FAIL-${job}-${width}.png`),fullPage:true});}
  await context.close();
 }
 // Login error, loading state and successful role routing via mock Auth.
 const c=await browser.newContext({viewport:{width:1280,height:900}});await mock(c,'patient');const p=await c.newPage();await p.goto('http://127.0.0.1:4173/index.html');
 await p.getByRole('textbox',{name:'Email',exact:true}).fill('qa@example.invalid');await p.locator('input[name=password]').fill('invalid-fixture-password');await p.locator('#authForm button[type=submit]').click();await p.getByRole('alert').filter({hasText:'Email hoặc mật khẩu không đúng'}).waitFor();
 await p.getByRole('textbox',{name:'Email',exact:true}).fill('qa@example.invalid');await p.locator('input[name=password]').fill('valid-fixture-password');await p.locator('#authForm button[type=submit]').click();await p.getByRole('heading',{name:'Chào mừng trở lại 👋'}).waitFor();
 results.push({scenario:'Login error + successful mock login',status:'PASS'});await c.close();
}finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify({kind:'MOCK browser integration, NOT live Auth E2E',results,failures},null,2));await browser.close();server.close();}
assert.deepEqual(failures,[]);console.log(`V3 browser UI PASS: ${results.length} scenarios. Mock API only; live E2E remains separate.`);
