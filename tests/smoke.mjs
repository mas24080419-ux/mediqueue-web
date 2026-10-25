// V4 replaces unauthenticated V3 public queue previews with an Auth gate.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const f of ['index.html','staff.html','admin.html']){
 const html=readFileSync(f,'utf8');
 assert.match(html,/auth-v4\.js/);
 assert.doesNotMatch(html,/<script[^>]+src="app\.js"/);
}
const auth=readFileSync('auth-v4.js','utf8');
assert.match(auth,/await workspace\(\)/);
assert.match(auth,/await import\('\.\/app\.js'\)/);
assert.match(auth,/await signIn\(username,password\)/);
console.log('PASS: unauthenticated visits are gated before workspace initialization.');