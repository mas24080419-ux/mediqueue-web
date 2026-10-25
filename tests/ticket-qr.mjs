import assert from 'node:assert/strict';
import {qrToken,ticketQrLink,parseTicketQrPayload,makeTicketQr,ticketQrSvg} from '../ticket-qr.js';

const tokenA='22222222-2222-4222-8222-222222222222';
const tokenB='33333333-3333-4333-8333-333333333333';
assert.equal(qrToken(' '+tokenA.toUpperCase()+' '),tokenA);
for(const invalid of ['',null,undefined,'visit/2026','some@example.com','11111111-1111-1111-1111-111111111111','1'.repeat(120)]) {
 assert.equal(qrToken(invalid),null);
 assert.equal(ticketQrSvg(invalid),'');
}
const base='https://mas24080419-ux.github.io/mediqueue-web/scan.html';
const deepLink=ticketQrLink(tokenA,base);
assert.equal(deepLink,base+'#code='+tokenA,'QR payload must open branded HTTPS page');
assert.equal(parseTicketQrPayload(deepLink,base),tokenA);
assert.equal(parseTicketQrPayload(tokenA,base),tokenA,'old UUID-only QR must remain accepted');
for(const bad of [
 'https://evil.example/scan.html#code='+tokenA,
 'https://mas24080419-ux.github.io/other-site/scan.html#code='+tokenA,
 base+'?copy=1#code='+tokenA,
 base+'#code='+tokenA+'&other=1',
 base+'#code=invalid',
 'javascript:alert(1)'
])assert.equal(parseTicketQrPayload(bad,base),null,'must reject non-first-party code: '+bad);
const a=makeTicketQr(tokenA),b=makeTicketQr(tokenB);
assert.ok(a&&b);
assert.ok(a.getModuleCount()>=21,'valid QR matrix size');
assert.notEqual(ticketQrSvg(tokenA),ticketQrSvg(tokenB),'each ticket must have a distinct QR code');
const svg=ticketQrSvg(tokenA);
assert.match(svg,/<svg\b/i);assert.match(svg,/<path\b/i);
assert.doesNotMatch(svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,''),/patient|email|phone|https?:\/\//i,'patient data or remote URL must not be included in QR markup');
assert.ok(svg.length>400);
console.log('PASS: locally encoded, distinct per-ticket SVG QR with strict UUID-only payload.');
