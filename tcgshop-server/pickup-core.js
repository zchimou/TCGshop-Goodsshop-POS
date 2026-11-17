/* Pickup references are SKU snapshots, never mutable product barcodes. */
(function(root){
 'use strict';
 const prefix='TCGP1:',code=/^TCGP1:([a-f0-9]{32}):([a-f0-9]{32})$/;
 function parse(value){const m=code.exec(String(value).trim());return m?{id:m[1],token:m[2]}:null;}
 function qr(row){return prefix+row.id+':'+row.token;}
 // Old App versions require raffleNumber; new screens use the explicitly assigned code.
 function raffle(row){return row.raffleCode===undefined?String(row.raffleNumber??''):row.raffleCode;}
 // Backfill legacy orders in a deterministic order; existing numbers never change.
 function numberOrders(rows){
  if(!Array.isArray(rows))return rows;
  let last=rows.reduce((n,r)=>Number.isSafeInteger(r?.raffleNumber)?Math.max(n,r.raffleNumber):n,0);
  const missing=rows.filter(r=>r&&r.raffleNumber===undefined).sort((a,b)=>(Date.parse(a.time)-Date.parse(b.time))||String(a.id).localeCompare(String(b.id)));
  for(const r of missing){if(last>=1e9)throw Error('抽奖编号已达到上限');r.raffleNumber=++last;}return rows;
 }
 function reserved(rows,shopId,sku){return (rows||[]).filter(r=>r.status==='pending'&&r.shopId===shopId).reduce((n,r)=>n+r.lines.filter(l=>l.sku===sku).reduce((v,l)=>v+l.qty,0),0);}
 function validate(rows,products,shops){
  const bad=()=>{throw Error('自提单数据不正确')},int=(n,min=0)=>Number.isSafeInteger(n)&&n>=min&&n<=1e9,text=(s,max)=>typeof s==='string'&&s.trim()&&s.length<=max,date=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
  if(!Array.isArray(rows)||rows.length>100000)bad();const ids=new Set(),numbers=new Set(),codes=new Set(),skus=new Set(products.map(p=>p.sku)),shopIds=new Set(shops.map(s=>s.id));
  for(const r of rows){
   if(!int(r?.raffleNumber,1)||numbers.has(r.raffleNumber))bad();numbers.add(r.raffleNumber);
   if(r.raffleCode!==undefined&&(typeof r.raffleCode!=='string'||r.raffleCode!==''&&!/^[1-9]\d{0,8}$/.test(r.raffleCode)))bad();const assigned=raffle(r);if(assigned){if(codes.has(assigned))bad();codes.add(assigned);}
   if(!r||!/^([a-f0-9]{32})$/.test(r.id)||ids.has(r.id)||!/[a-f0-9]{32}/.test(r.token)||r.token.length!==32||!shopIds.has(r.shopId)||!text(r.number,100)||!date(r.time)||!['pending','redeemed','cancelled'].includes(r.status)||typeof r.note!=='string'||r.note.length>200||!int(r.total)||!Array.isArray(r.lines)||!r.lines.length||r.lines.length>1000)bad();ids.add(r.id);
   const lines=new Set();let total=0;for(const l of r.lines){if(!l||!skus.has(l.sku)||lines.has(l.sku)||!text(l.name,200)||!int(l.qty,1)||!int(l.price))bad();lines.add(l.sku);total+=l.qty*l.price;}if(!int(total)||total!==r.total)bad();
   for(const a of [r.actor,...(r.status==='pending'?[]:[r.completedBy])])if(!a||!text(a.id,100)||!text(a.name,60)||!text(a.username,32))bad();
   if(r.status!=='pending'&&!date(r.completedAt))bad();
  }return rows;
 }
 const api={prefix,parse,qr,raffle,reserved,numberOrders,validate};if(typeof module==='object'&&module.exports)module.exports=api;else root.POSPickupCore=api;
})(typeof window==='object'?window:globalThis);
