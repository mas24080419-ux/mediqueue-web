// Native UI access is decided by server roles, not URL or a client role chooser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync('auth-v4.js','utf8');
assert.match(s,/data\.profile\.role==='staff'&&data\.access\.role==='staff'/);
assert.match(s,/data\.profile\.role==='admin'&&data\.access\.is_hospital_admin===true/);
assert.match(s,/await signOut\(\);launched=false/);
assert.match(s,/if\(portal!=='patient'\)throw/);
assert.doesNotMatch(s,/role:\s*['"]admin['"]/,'no client-side privilege assertion');
console.log('PASS: staff/admin portals require server-owned roles and hospital-admin grant.');