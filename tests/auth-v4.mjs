// Assert deployment/auth boundaries without using real credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
for(const name of ['index.html','staff.html','admin.html']){
 const h=fs.readFileSync(name,'utf8');
 assert.match(h,/src="auth-v4\.js"/);
 assert.match(h,/href="auth-v4\.css"/);
 assert.doesNotMatch(h,/src="app\.js"/,'workspace must only load after authorization');
 assert.doesNotMatch(h,/demo|mô phỏng|123456/i);
}
const auth=fs.readFileSync('auth-v4.js','utf8'),style=fs.readFileSync('auth-v4.css','utf8');
assert.match(auth,/await loadCloudData\(\)/,'backend role verification missing');
assert.match(auth,/data\.access\.is_hospital_admin===true/,'admin policy missing');
assert.match(auth,/await import\('\.\/app\.js'\)/,'verified workspace handoff missing');
assert.match(auth,/if\(portal!=='patient'\)throw/,'staff signup must be blocked');
assert.match(auth,/await signOut\(\)/,'mismatched sessions must be revoked');
assert.doesNotMatch(auth,/demo|123456/i);
assert.doesNotMatch(style,/demo|123456/i);
assert.match(style,/prefers-reduced-motion/);
const app=fs.readFileSync('app.js','utf8');
assert.match(app,/mode:'cloud'/);
assert.doesNotMatch(app,/data-action="toggle-cloud"/);
const workflow=fs.readFileSync('.github/workflows/pages.yml','utf8');
assert.match(workflow,/auth-v4\.js auth-v4\.css/,'new login assets must be deployed');
console.log('PASS: auth V4 access gate, role separation, stylesheet isolation, deployed assets.');
