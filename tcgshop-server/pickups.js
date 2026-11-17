'use strict';
const crypto=require('crypto'),pickup=require('./pickup-core'),core=require('./sync-core');
const clone=v=>JSON.parse(JSON.stringify(v));
const dateKey=time=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(time)).replaceAll('-','');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function manualCode(value,rows,except=''){
 if(value===undefined)value='';if(typeof value!=='string'||value!==''&&!/^[1-9]\d{0,8}$/.test(value))fail('抽奖码请填写 1 至 999999999 的整数，或留空暂不分配');
 if(value&&rows.some(r=>r.id!==except&&pickup.raffle(r)===value))fail('抽奖码 '+value+' 已被其他预订单使用，请更换',409);return value;
}
function protect(current,next){
 if(!current)return next;
 // Ordinary sync clients (including old/offline installations) cannot roll back server-owned pickup status.
 next.ledger.pickups=clone(current.ledger.pickups||[]);
 for(const row of next.ledger.pickups)if(row.status==='pending')for(const l of row.lines)if(!next.ledger.products.some(p=>p.sku===l.sku&&!p.deleted))fail('商品仍有待领取自提单，不能删除或更改 SKU');
 for(const shop of current.ledger.shops)for(const m of shop.movements.filter(m=>m.pickupId)){
  const target=next.ledger.shops.find(b=>b.id===shop.id)?.movements.find(x=>x.id===m.id);
  const deleted=next.ledger.shops.find(b=>b.id===shop.id)?.deletedRecords?.some(r=>r.kind==='movement'&&r.id===m.id&&r.productId===m.productId&&r.delta===m.delta);
  if(!target&&!deleted||target&&core.canonical(target)!==core.canonical(m))fail('自提核销流水不能由普通同步更改');
 }
 return next;
}
function handle(store,body){
 const current=store.read();if(!current.data)fail('请先同步店铺和账号到 NAS');
 const data=clone(current.data),s=data.ledger,actor=data.accounts.users.find(u=>u.id===body.actorId&&u.enabled);
 if(!actor)fail('账号已停用或不存在，请重新同步登录',403);
 const stamp={id:actor.id,username:actor.username,name:actor.name};
 s.pickups=s.pickups||[];const now=new Date().toISOString();
 if(body.action==='clearRaffle'){
  if(actor.role!=='admin')fail('只有管理员可以清空全部抽奖码',403);
  let cleared=0;
  for(const row of s.pickups){if(pickup.raffle(row)){row.raffleCode='';row.raffleUpdatedAt=now;row.raffleUpdatedBy=stamp;cleared++;}}
  if(cleared)store.commit(core.validate(data),current);
  return {cleared};
 }
 if(body.action==='create'){
  if(!/^[a-f0-9]{32}$/.test(body.id)||!s.shops.some(b=>b.id===body.shopId)||!Array.isArray(body.lines)||!body.lines.length||body.lines.length>1000||typeof body.note!=='string'||body.note.length>200)fail('请检查自提店铺、商品和备注');
  const repeated=s.pickups.find(r=>r.id===body.id);
  if(repeated){if(repeated.actor.id!==actor.id||repeated.shopId!==body.shopId||repeated.note!==body.note||core.canonical(repeated.lines.map(({sku,qty,price})=>({sku,qty,price})))!==core.canonical(body.lines))fail('请求编号已使用，请重新创建',409);return {pickup:repeated};}
  const raffleCode=manualCode(body.raffleCode,s.pickups);
  const shop=s.shops.find(b=>b.id===body.shopId),seen=new Set();let total=0;
  const lines=body.lines.map(l=>{
   const p=s.products.find(p=>p.sku===l.sku&&!p.deleted);if(!p||seen.has(l.sku)||!Number.isSafeInteger(l.qty)||l.qty<1||l.qty>1e9||!Number.isSafeInteger(l.price)||l.price<1||l.price>1e9)fail('商品、数量或价格不正确（未定价商品需填写打包单价）');seen.add(l.sku);
   const available=shop.inventory[p.id].stock-pickup.reserved(s.pickups,shop.id,p.sku);if(l.qty>available)fail(p.name+' 在取货店铺可预定数量不足（剩余 '+Math.max(0,available)+'）',409);
   total+=l.qty*l.price;return {sku:p.sku,name:p.name,qty:l.qty,price:l.price};
  });if(!Number.isSafeInteger(total)||total>1e9)fail('打包金额超出范围');
  const row={id:body.id,token:crypto.randomBytes(16).toString('hex'),number:'ZT-'+dateKey(now)+'-'+body.id.slice(0,8).toUpperCase(),shopId:shop.id,time:now,status:'pending',actor:stamp,note:body.note,total,lines,raffleCode};
  // Keep the legacy numeric field readable by already-installed Apps. It is not a lottery code.
  const last=s.pickups.reduce((n,r)=>Math.max(n,r.raffleNumber),0);if(last>=1e9)fail('抽奖编号已达到上限');row.raffleNumber=last+1;
  s.pickups.push(row);store.commit(core.validate(data),current);return {pickup:row};
 }
 const parsed=pickup.parse(body.code);if(!parsed)fail('不是有效的自提二维码');
 const row=s.pickups.find(r=>r.id===parsed.id&&r.token===parsed.token);if(!row)fail('自提单不存在或二维码无效',404);
 if(!s.shops.some(b=>b.id===body.shopId)||row.shopId!==body.shopId)fail('此自提单属于「'+(s.shops.find(b=>b.id===row.shopId)?.name||'其他店铺')+'」，请到对应店铺核销',403);
 if(actor.role!=='admin'&&actor.shopId!==body.shopId)fail('店员只能核销或取消所属店铺的自提单',403);
 if(body.action==='lookup')return {pickup:row};
 if(body.action==='setRaffle'){
  if(row.status==='cancelled')fail('预订单已取消，不能再修改抽奖码',409);
  const value=manualCode(body.raffleCode,s.pickups,row.id);if(pickup.raffle(row)===value)return {pickup:row,repeated:true};
  row.raffleCode=value;row.raffleUpdatedAt=now;row.raffleUpdatedBy=stamp;store.commit(core.validate(data),current);return {pickup:row};
 }
 if(!['redeem','cancel'].includes(body.action))fail('不支持的自提操作');
 if(row.status!=='pending'){
  if(body.action==='redeem'&&row.status==='redeemed'||body.action==='cancel'&&row.status==='cancelled')return {pickup:row,repeated:true};
  fail(row.status==='redeemed'?'自提单已核销':'自提单已取消',409);
 }
 if(body.action==='redeem'){
  const shop=s.shops.find(b=>b.id===row.shopId);row.orderId='ZT-'+dateKey(now)+'-'+row.id.slice(0,8).toUpperCase();
  // Commit inventory, immutable stock movements and redemption status in one ledger replacement.
  for(const [i,l] of row.lines.entries()){
   const p=s.products.find(p=>p.sku===l.sku&&!p.deleted);if(!p)fail('商品已不存在，请联系管理员');const item=shop.inventory[p.id];
   if(item.stock<l.qty)fail(p.name+' 当前库存不足，不能核销',409);
   item.stock-=l.qty;shop.movements.push({id:'pickup-'+row.id+'-'+i,pickupId:row.id,productId:p.id,sku:p.sku,code:p.code,name:p.name,delta:-l.qty,after:item.stock,type:'自提核销',note:row.orderId,actor:stamp,time:now});
  }
  const lines=row.lines.map(l=>{const p=s.products.find(p=>p.sku===l.sku);return {...l,productId:p.id,code:p.code,cost:shop.inventory[p.id].cost};});
  row.orderId='ZT-'+dateKey(now)+'-'+row.id.slice(0,8).toUpperCase();
  shop.orders.push({id:row.orderId,pickupId:row.id,time:now,actor:stamp,lines,total:row.total,discount:0,cost:lines.reduce((n,l)=>n+l.cost*l.qty,0),payment:'已收款',cashReceived:row.total,change:0,refunded:false,refunds:[]});
 }
 row.status=body.action==='redeem'?'redeemed':'cancelled';row.completedAt=now;row.completedBy=stamp;
 store.commit(core.validate(data),current);return {pickup:row};
}
module.exports={handle,protect};
