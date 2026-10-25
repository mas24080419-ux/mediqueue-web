// QR codes are generated locally. Payload is ONLY the server-issued UUID nonce.
// The code grants no access to records; only authorized hospital RPC may check it in.
import qrcode from './vendor/qrcode.mjs';

export const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function qrToken(nonce){
 const value=String(nonce??'').trim();
 return UUID_PATTERN.test(value)?value.toLowerCase():null;
}
export function makeTicketQr(nonce){
 const value=qrToken(nonce);
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
