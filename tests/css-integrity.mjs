// Guard against reintroducing unused prototype CSS or broken stylesheet paths.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const pages=['index.html','staff.html','admin.html'];
const expected=['patient-landing.css','styles.css','dashboard.css','premium-sidebar.css','integration.css'];
for(const page of pages){
  const html=readFileSync(page,'utf8');
  const paths=[...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(paths,expected, page+' CSS imports differ or are duplicated');
  for(const href of paths)assert.ok(existsSync(href),page+' missing stylesheet: '+href);
  assert.ok(!html.includes('auth-v3.css'),page+' still references archived CSS');
}
assert.ok(!existsSync('auth-v3.css'),'obsolete auth-v3.css should be removed');
const css=readFileSync('patient-landing.css','utf8');
for(const s of ['.preview-label','.preview-title','.preview-grid','.preview-card','.preview-banner','.preview-card-meta']){
  assert.ok(css.includes(s+'{'), 'patient landing selector missing: '+s);
}
const workflow=readFileSync('.github/workflows/pages.yml','utf8');
assert.ok(workflow.includes('patient-landing.css'),'GitHub Pages did not include new stylesheet');
assert.ok(!workflow.includes('auth-v3.css'),'GitHub Pages still bundles unused stylesheet');
console.log('PASS: stylesheet references, active patient selectors, and deployment manifest');
