// QR codes are generated locally. Payload is ONLY the server-issued UUID nonce.
// The code grants no access to records; only authorized hospital RPC may check it in.
import qrcode from './vendor/qrcode.js';

export const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function qrToken(nonce){
 const value=String(nonce??'').trim();
 return UUID_PATTERN.test(value)?value.toLowerCase():null;
}
/** QR payload is a first-party HTTPS deep link, with its nonce in the URL fragment.
 * The fragment is never sent with an HTTP request; do not include PHI in QR data.
 * Relative module URL keeps GitHub Pages project subpaths working. */
export function ticketQrLink(nonce,base=new URL('scan.html',import.meta.url)){
 const value=qrToken(nonce);
 if(!value)return null;
 const u=new URL(base);
 if(!['https:','http:','file:'].includes(u.protocol))return null;
 u.search='';u.hash='code='+encodeURIComponent(value);
 return u.href;
}
/** Accept old plain UUIDs and only first-party scan.html links from newer QR codes. */
export function parseTicketQrPayload(payload,base=new URL('scan.html',import.meta.url)){
 const literal=qrToken(payload);
 if(literal)return literal;
 try{
  const expected=new URL(base),given=new URL(String(payload??'').trim());
  if(given.origin!==expected.origin||given.pathname!==expected.pathname||given.search)return null;
  const params=new URLSearchParams(given.hash.slice(1));
  if(params.size!==1||!params.has('code'))return null;
  return qrToken(params.get('code'));
 }catch{return null;}
}
export function makeTicketQr(nonce,base){
 const value=ticketQrLink(nonce,base);
 if(!value)return null;
 const qr=qrcode(0,'M');
 qr.addData(value,'Byte');
 qr.make();
 return qr;
}
export function ticketQrSvg(nonce,cellSize=5){
 const qr=makeTicketQr(nonce);
 if(!qr)return '';
 // QR modules include the standards-defined quiet zone in createSvgTag.
 return qr.createSvgTag({cellSize,margin:cellSize*4,scalable:true});
}
export function ticketQrPng(nonce,scale=10){
 const qr=makeTicketQr(nonce);
 if(!qr)throw new Error('Mã QR của phiếu không hợp lệ.');
 if(typeof document==='undefined')throw new Error('Cần trình duyệt để tải mã QR.');
 const margin=4,count=qr.getModuleCount(),canvas=document.createElement('canvas');
 canvas.width=(count+margin*2)*scale;canvas.height=canvas.width;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw new Error('Trình duyệt không hỗ trợ tạo hình QR.');
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#172e38';
 for(let row=0;row<count;row++)for(let col=0;col<count;col++)
  if(qr.isDark(row,col))ctx.fillRect((col+margin)*scale,(row+margin)*scale,scale,scale);
 return canvas.toDataURL('image/png');
}
