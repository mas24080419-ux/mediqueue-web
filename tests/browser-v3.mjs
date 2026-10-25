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
async function assertCardFooterLayout(page,active){
 const coords=await page.evaluate((side)=>{
   const face=document.querySelector('#mqn-face-'+side),foot=face?.querySelector('.mqn-footer');
   const card=document.querySelector('#mqn-card'),note=document.querySelector('.mqn-smallprint'),stage=document.querySelector('.mqn-stage');
   if(!face||!foot||!card||!note||!stage)return null;
   const f=foot.getBoundingClientRect(),panel=face.getBoundingClientRect(),hint=note.getBoundingClientRect(),area=stage.getBoundingClientRect();
   return {footerBottom:f.bottom,faceBottom:panel.bottom,footerTop:f.top,faceTop:panel.top,hintTop:hint.top,stageBottom:area.bottom,footHeight:f.height,cardHeight:card.offsetHeight,faceHeight:face.offsetHeight,position:getComputedStyle(face).position};
 },active);
 assert.ok(coords,'auth card layout missing');
 assert.equal(coords.position,'relative','the active face must determine natural card height');
 assert.ok(coords.footerBottom<=coords.faceBottom-8,'footer spills outside auth card: '+JSON.stringify(coords));
 assert.ok(coords.hintTop>=coords.stageBottom+8,'caption collides with card: '+JSON.stringify(coords));
 assert.ok(coords.footHeight>=50,'footer lacks required vertical spacing: '+JSON.stringify(coords));
}
const jobs=['patient','reception','doctor','nurse','laboratory','imaging','pharmacy','cashier','department_lead','admin','unassigned'];
try{
 for(const job of jobs)for(const width of [1440,1280,1024,768,390,360]){
  const context=await browser.newContext({viewport:{width,height:960}});await mock(context,job);
  await context.addInitScript(({uid})=>sessionStorage.setItem('mq_web_session_v2',JSON.stringify({access_token:'mock-only-access',refresh_token:'mock-only-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:uid,email:'qa@example.invalid'}})),{uid});
  const page=await context.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   const file=job==='patient'?'index.html':job==='admin'?'admin.html':'staff.html';
   await page.goto('http://127.0.0.1:4173/'+file);await page.locator('.mq-side-inner').waitFor({state:'attached'});
   await page.waitForFunction(()=>!document.body.textContent.includes('Đăng nhập bệnh nhân')&&!document.body.textContent.includes('Đăng nhập nội bộ'));
   const nav=page.locator('.mq-nav');
   if(job==='patient'){assert.equal(await nav.getByRole('button',{name:'Điều phối phòng khám',exact:true}).count(),0);assert.equal(await nav.getByRole('button',{name:'Tài khoản & phân quyền',exact:true}).count(),0);}
   if(job==='doctor'){assert.equal(await nav.getByRole('button',{name:'Tiếp đón bệnh nhân',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Xác nhận check-in',exact:true}).count(),0);}
   if(job==='reception')assert.equal(await page.getByRole('button',{name:'Gọi lượt tiếp theo',exact:true}).count(),0);
   if(job==='admin')assert.equal(await page.getByText(ticket.patient_name,{exact:true}).count(),0);
   assert.equal(await page.locator('[data-role],#roleList').count(),0,'no arbitrary role switch');
   // Premium design is scoped to desktop: rounded inset card, active accent and profile avatar.
   // Mobile preserves existing fixed drawer behavior and auth-scoped navigation.
   if(width>900){
     const visual=await page.evaluate(()=>{
       const side=document.querySelector('.work-side'),active=document.querySelector('.mq-nav .mq-item[aria-current="page"]'),avatar=document.querySelector('.mq-avatar');
       const sideRect=side.getBoundingClientRect(),styles=getComputedStyle(side);
       return {position:styles.position,borderRadius:parseFloat(styles.borderTopLeftRadius),shadow:styles.boxShadow,marginLeft:parseFloat(styles.marginLeft),left:sideRect.left,right:sideRect.right,viewport:innerWidth,activeBackground:active?getComputedStyle(active).backgroundImage:'',avatarRadius:getComputedStyle(avatar).borderRadius};
     });
     assert.equal(visual.position,'sticky','premium sidebar must remain sticky on desktop');
     assert.ok(visual.borderRadius>=20,'desktop card corners missing: '+JSON.stringify(visual));
     assert.ok(visual.marginLeft>=8,'desktop floating inset missing: '+JSON.stringify(visual));
     assert.notEqual(visual.shadow,'none','desktop card must have subtle elevation');
     assert.ok(visual.left>=0&&visual.right<=visual.viewport+2,'desktop sidebar overflow: '+JSON.stringify(visual));
     if(job==='unassigned')assert.equal(await page.locator('.mq-nav [data-page="reception"],.mq-nav [data-page="staff"]').count(),0,'unassigned staff must not have clinical navigation');
     else assert.match(visual.activeBackground,/linear-gradient/,'active menu highlight is missing');
     assert.equal(visual.avatarRadius,'50%','desktop profile avatar must be circular');
   }else{
     const visual=await page.locator('.work-side').evaluate(el=>({position:getComputedStyle(el).position,borderRadius:getComputedStyle(el).borderTopLeftRadius}));
     assert.equal(visual.position,'fixed','mobile drawer should stay fixed');
   }

   assert.ok(!(await page.locator('body').innerText()).toLowerCase().includes('demo'),'no mock-mode label on authenticated workspace');
   const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(dims.scroll<=dims.width+2,JSON.stringify(dims));
   if(width<=900){const open=page.getByRole('button',{name:'Mở menu',exact:true});await open.click();assert.equal(await open.getAttribute('aria-expanded'),'true');await page.waitForFunction(()=>document.querySelector('#mq-drawer').getBoundingClientRect().x>=-1);await page.keyboard.press('Escape');assert.equal(await open.getAttribute('aria-expanded'),'false');}
   else {const toggle=page.getByRole('button',{name:'Thu gọn / mở rộng thanh bên',exact:true});await toggle.click();assert.ok(await page.locator('body').evaluate(b=>b.classList.contains('mq-sidebar-collapsed')));const collapsed=await page.locator('.work-side').evaluate(el=>({right:el.getBoundingClientRect().right,left:el.getBoundingClientRect().left,w:el.getBoundingClientRect().width,viewport:innerWidth}));assert.ok(collapsed.w>=54&&collapsed.w<=82&&collapsed.left>=0&&collapsed.right<=collapsed.viewport+1,'collapsed sidebar overflow: '+JSON.stringify(collapsed));await toggle.click();}
   assert.deepEqual(errors,[]);
   if(['patient','doctor','admin'].includes(job)&&[1440,390].includes(width)){
    if(width===390){await page.getByRole('button',{name:'Mở menu',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#mq-drawer').getBoundingClientRect().x>=-1);}
    await page.screenshot({path:path.join(out,`${job}-${width}-MOCK.png`),fullPage:true,animations:'disabled'});
   }
   results.push({job,width,status:'PASS',evidence:'mock API / browser UI'});console.log('PASS UI',job,width);
  }catch(e){failures.push({job,width,error:e.message});await page.screenshot({path:path.join(out,`FAIL-${job}-${width}.png`),fullPage:true});console.error('FAIL UI',job,width,e.message);throw e;}
  await context.close();
 }
 // Changing context uses only assignments returned by the server, not the legacy profile department.
 const multi=await browser.newContext({viewport:{width:1280,height:900}});const mf=await mock(multi,'doctor');
 mf.access.assignments.push({...mf.access.assignments[0],id:'second-grant',job_title:'reception',department_code:'INTERNAL',room_id:null});
 await multi.addInitScript(({uid})=>sessionStorage.setItem('mq_web_session_v2',JSON.stringify({access_token:'mock-only-access',refresh_token:'mock-only-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:uid,email:'qa@example.invalid'}})),{uid});
 const mp=await multi.newPage();mp.setDefaultTimeout(5000);await mp.goto('http://127.0.0.1:4173/staff.html');await mp.locator('#assignmentPicker').selectOption('second-grant');
 await mp.getByRole('button',{name:'Nghiệp vụ khoa/phòng',exact:true}).click();await mp.getByRole('button',{name:'Tiếp đón bệnh nhân',exact:true}).click();
 assert.equal(await mp.locator('#staffDept option').count(),1);assert.equal(await mp.locator('#staffDept').inputValue(),'INTERNAL');
 results.push({scenario:'Server-issued multi-assignment context',status:'PASS'});await multi.close();
 // V4 signed-out gateway: secure, responsive and no self-registration for internal accounts.
 for(const width of [1440,390])for(const guestPortal of ['index.html','staff.html','admin.html']){
  const guestContext=await browser.newContext({viewport:{width,height:900}});
  await mock(guestContext,'patient');
  const guest=await guestContext.newPage();const guestErrors=[];guest.on('pageerror',e=>guestErrors.push(e.message));
  await guest.goto('http://127.0.0.1:4173/'+guestPortal);
  await guest.locator('#mqn-login-form').waitFor();
  await assertCardFooterLayout(guest,'front');
  assert.ok(await guest.locator('.mqn-roles [aria-current="page"]').count()===1);
  assert.equal(await guest.locator('.mq-side-inner').count(),0,'no privileged workspace before authentication');
  assert.equal(await guest.locator('#mqn-register-form').count(),0,'no alternative legacy form');
  assert.ok(!(await guest.locator('body').innerText()).toLowerCase().includes('demo'),'no trial labels visible');
  const size=await guest.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert.ok(size.scroll<=size.width+2,'guest horizontal overflow '+JSON.stringify(size));
  if(guestPortal==='index.html'){
    assert.equal(await guest.locator('.mqn-auth-tabs [role="tab"]').count(),2,'login/signup tabs must be visible');
    await guest.getByRole('tab',{name:'Đăng ký'}).click();
    assert.ok(await guest.locator('#mqn-card').evaluate(n=>n.classList.contains('flipped')));
    assert.equal(await guest.locator('#mqn-face-back').getAttribute('aria-hidden'),'false');
    assert.equal(await guest.getByRole('tab',{name:'Đăng ký'}).getAttribute('aria-selected'),'true');
    await guest.waitForTimeout(700);
    await assertCardFooterLayout(guest,'back');
    await guest.getByRole('tab',{name:'Đăng nhập'}).click();
    await guest.waitForTimeout(700);
    await assertCardFooterLayout(guest,'front');
    assert.equal(await guest.getByRole('tab',{name:'Đăng nhập'}).getAttribute('aria-selected'),'true');
  }else{
    assert.equal(await guest.locator('.mqn-auth-tabs').count(),0,'internal portals must not expose signup tabs');
    assert.equal(await guest.getByRole('button',{name:'Chuyển sang đăng ký'}).count(),0,'internal account creation forbidden');
  }
  assert.deepEqual(guestErrors,[]);
  await guest.screenshot({path:path.join(out,'v4-guest-'+guestPortal+'-'+width+'.png'),fullPage:true,animations:'disabled'});
  results.push({scenario:'V4 signed-out '+guestPortal,width,status:'PASS'});
  await guestContext.close();
 }
 // A valid patient password cannot authorize the staff or hospital administrator portal.
 for(const restricted of ['staff.html','admin.html']){
   const ctx=await browser.newContext({viewport:{width:1280,height:900}});
   await mock(ctx,'patient');const pg=await ctx.newPage();await pg.goto('http://127.0.0.1:4173/'+restricted);
   await pg.locator('#mqn-face-front input[name=email]').fill('qa@example.invalid');
   await pg.locator('#mqn-face-front input[name=password]').fill('valid-fixture-password');
   await pg.locator('#mqn-login-form button[type=submit]').click();
   await pg.locator('.mqn-error').filter({hasText:'không có quyền'}).waitFor();
   assert.equal(await pg.locator('.mq-side-inner').count(),0);
   results.push({scenario:'Patient cannot enter '+restricted,status:'PASS'});
   await ctx.close();
 }
 // Every booked ticket exposes an actual locally generated QR. Can enlarge and download.
 for(const width of [1280,390]){
  const ctx=await browser.newContext({viewport:{width,height:920},acceptDownloads:true});
  await mock(ctx,'patient');
  await ctx.addInitScript(({uid})=>sessionStorage.setItem('mq_web_session_v2',JSON.stringify({access_token:'mock-only-access',refresh_token:'mock-only-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:uid,email:'qa@example.invalid'}})),{uid});
  const page=await ctx.newPage();page.setDefaultTimeout(6000);await page.goto('http://127.0.0.1:4173/index.html');
  await page.locator('.preview-card[data-page="track"]').click();
  const ticketCard=page.locator('.ticket-card').first();
  await ticketCard.locator('.mq-qr-thumbnail svg').waitFor();
  assert.equal(await ticketCard.locator('.mq-qr-thumbnail svg').count(),1);
  assert.ok((await ticketCard.locator('.mq-qr-thumbnail svg').evaluate(el=>el.getBoundingClientRect().width))>=150,'QR too small for phone camera scanning');
  assert.ok(!(await ticketCard.innerText()).includes(ticket.patient_name),'QR UI must not expose other patients');
  await ticketCard.getByRole('button',{name:'Xem QR'}).click();
  await page.locator('.mq-qr-modal-image svg').waitFor();
  assert.ok((await page.locator('.mq-qr-modal-image svg').evaluate(el=>el.getBoundingClientRect().width))>=245,'enlarged QR too small for practical scanning');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Tải QR về máy (PNG)'}).click()]);
  assert.match(download.suggestedFilename(),/^MediQueue-.*-QR\.png$/);
  await download.saveAs(path.join(out,'ticket-qr-'+width+'-DOWNLOAD.png'));
  assert.ok(!(await page.locator('body').innerText()).toLowerCase().includes('demo'));
  results.push({scenario:'Patient per-ticket QR visible, enlarged and downloaded',width,status:'PASS'});
  await page.screenshot({path:path.join(out,'ticket-qr-'+width+'-MOCK.png'),fullPage:true,animations:'disabled'});
  await ctx.close();
 }
 // Reception scanning keeps manual entry available when camera/BarcodeDetector is unsupported.
 {
  const ctx=await browser.newContext({viewport:{width:1280,height:920}});
  await mock(ctx,'reception');
  await ctx.addInitScript(({uid})=>sessionStorage.setItem('mq_web_session_v2',JSON.stringify({access_token:'mock-only-access',refresh_token:'mock-only-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:uid,email:'qa@example.invalid'}})),{uid});
  const p=await ctx.newPage();await p.goto('http://127.0.0.1:4173/staff.html');
  await p.locator('.mq-side-inner').waitFor();
  await p.getByRole('button',{name:'Nghiệp vụ khoa/phòng',exact:true}).click();
  await p.getByRole('button',{name:'Tiếp đón bệnh nhân',exact:true}).click();
  const checkin=p.locator('[data-action="checkin-form"]').first();
  assert.equal(await checkin.count(),1,'reception check-in action must exist');
  await checkin.click();
  assert.equal(await p.locator('#checkinForm input[name=nonce]').count(),1);
  assert.equal(await p.locator('[data-action="scan-ticket-camera"]').count(),1);
  assert.equal(await p.locator('#qr-scan-video').count(),1);
  results.push({scenario:'Reception camera scanner and manual QR fallback',status:'PASS'});
  await ctx.close();
 }

 // QR camera link must open a first-party page without disclosing patient data.
 for(const good of [true,false]){
   const ctx=await browser.newContext({viewport:{width:390,height:844}});
   const pg=await ctx.newPage();
   await pg.goto('http://127.0.0.1:4173/scan.html#code='+(good?ticket.qr_nonce:'invalid'));
   await pg.locator(good?'#scan-status.ok':'#scan-status.bad').waitFor();
   if(good){
     const href=await pg.locator('#scan-staff').getAttribute('href');
     assert.ok(href.endsWith('staff.html#checkin='+ticket.qr_nonce),'scan landing must hand off only validated UUID');
     assert.equal(await pg.locator('#scan-copy').isVisible(),true);
     assert.equal(await pg.getByText(ticket.patient_name,{exact:true}).count(),0,'QR page must never expose patient name');
     assert.match(await pg.locator('#scan-status').innerText(),/Chưa xác minh trạng thái/);
   }else{
     assert.equal(await pg.locator('#scan-copy').isVisible(),false,'invalid QR must not allow copying');
   }
   results.push({scenario:good?'First-party QR landing opens':'QR landing rejects invalid token',status:'PASS'});
   await ctx.close();
 }

 // Scanned phone QR can prefill an authorized receptionist form, without auto-checking in.
 for(const [job,allowed] of [['reception',true],['doctor',false]]){
   const ctx=await browser.newContext({viewport:{width:1280,height:900}});
   await mock(ctx,job);
   await ctx.addInitScript(({uid})=>sessionStorage.setItem('mq_web_session_v2',JSON.stringify({
     access_token:'mock-only-access',refresh_token:'mock-only-refresh',
     expires_at:Math.floor(Date.now()/1000)+3600,user:{id:uid,email:'qa@example.invalid'}
   })),{uid});
   let checkins=0;
   ctx.on('request',req=>{if(req.url().includes('/rpc/mq_checkin_qr'))checkins++;});
   const pg=await ctx.newPage();
   await pg.goto('http://127.0.0.1:4173/staff.html#checkin='+ticket.qr_nonce);
   await pg.locator('.mq-side-inner').waitFor();
   if(allowed){
     await pg.locator('#checkinForm input[name=nonce]').waitFor();
     assert.equal(await pg.locator('#checkinForm input[name=nonce]').inputValue(),ticket.qr_nonce);
   }else{
     await pg.waitForTimeout(250);
     assert.equal(await pg.locator('#checkinForm').count(),0,'doctor must not enter reception without assigned permission');
   }
   assert.equal(checkins,0,'just scanning must never automatically check a patient in');
   results.push({scenario:allowed?'Reception prefilled from QR link':'No unauthorized deep-link checkin',status:'PASS'});
   await ctx.close();
 }
 // Login error, loading state and successful role routing via mock Auth.
 const c=await browser.newContext({viewport:{width:1280,height:900}});await mock(c,'patient');const p=await c.newPage();await p.goto('http://127.0.0.1:4173/index.html');
 await p.locator('#mqn-face-front input[name=email]').fill('qa@example.invalid');await p.locator('#mqn-face-front input[name=password]').fill('invalid-fixture-password');await p.locator('#mqn-login-form button[type=submit]').click();await p.locator('#mqn-face-front .mqn-error').filter({hasText:'Invalid login credentials'}).waitFor();await assertCardFooterLayout(p,'front');
 await p.locator('#mqn-face-front input[name=email]').fill('qa@example.invalid');await p.locator('#mqn-face-front input[name=password]').fill('valid-fixture-password');await p.locator('#mqn-login-form button[type=submit]').click();await p.getByRole('heading',{name:'Xin chào! Hôm nay bạn muốn khám khoa nào?'}).waitFor();
 results.push({scenario:'Login error + successful mock login',status:'PASS'});await c.close();
}finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify({kind:'MOCK browser integration, NOT live Auth E2E',results,failures},null,2));await browser.close();server.close();}
assert.deepEqual(failures,[]);console.log(`V3 browser UI PASS: ${results.length} scenarios. Mock API only; live E2E remains separate.`);
