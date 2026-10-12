/* Version-checked sync: concurrent edits are merged by immutable record id. */
window.POSSync=(()=>{
 const cfgKey='TCGshop-POS-nas-config-v1',idKey='TCGshop-POS-store-id',accountKey='TCGshop-POS-accounts-v1',basePrefix='TCGshop-POS-nas-base:',recoveryKey='TCGshop-POS-nas-recovery';
 localStorage.removeItem('TCGshop-POS-device-v1');
 let busy=false,paused=false,generation=0,timer,retry,poll,status='未设置同步',conflict=null,configEpoch=0,healthCache=null,lastCheckAt=0,liveRunning=false,liveTimer,liveTag='',liveEpoch=0;const nativePending=new Map();
 function config(){try{return JSON.parse(localStorage.getItem(cfgKey)||'{}')}catch{return {}}}
 function normalizeUrl(raw){const u=new URL(raw.trim());if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('请填写完整的 NAS 服务地址');if(u.protocol==='http:'&&!/^(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/.test(u.hostname))throw Error('HTTP 仅用于内网 IP；外网请使用 HTTPS');return u.href.replace(/\/+$/,'');}
 function setStatus(text){status=text;if(text.startsWith('同步成功'))lastCheckAt=Date.now();document.querySelectorAll('#nasStatus,#nasIndicator').forEach(el=>el.textContent=text);const button=$('nasResolve');if(button)button.hidden=!conflict;}
 function prefs(values){const url=normalizeUrl(values.url),token=values.token.trim();if(token.length<16||token.length>512||/[\r\n]/.test(token))throw Error('同步密钥需为 16–512 个字符，与 NAS 配置一致');return {url,token,edit:!!values.edit,open:true};}
 function saveConfig(values){const next=prefs(values);localStorage.setItem(cfgKey,JSON.stringify(next));configEpoch++;healthCache=null;clearTimeout(timer);clearTimeout(retry);conflict=null;setStatus('设置已保存，请测试连接或立即同步');return next;}
 function baseKey(c){return basePrefix+c.url;}
 function baseline(c){const raw=localStorage.getItem(baseKey(c));if(!raw)return null;try{const b=JSON.parse(raw);if(typeof b.hash!=='string'||typeof b.etag!=='string'||typeof b.storeId!=='string')throw Error();return b;}catch{throw Error('同步基准损坏，请备份后重新建立同步关系');}}
 async function fingerprint(payload){const bytes=new TextEncoder().encode(POSSyncCore.canonical({ledger:payload.ledger,accounts:payload.accounts}));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
 function snapshot(){if(readOnly)throw Error('本机账本异常，请先恢复有效备份');if(localStorage.getItem(KEY)!==ledgerRaw)throw Error('账本已由其他窗口更新，请刷新后同步');const accounts=POSAuth.snapshot();if(!accounts)throw Error('请先设置管理员或连接已有 NAS 店铺');let storeId=localStorage.getItem(idKey);if(!storeId){storeId=crypto.randomUUID();localStorage.setItem(idKey,storeId);}return POSSyncCore.validate({schema:POSSyncCore.schema,storeId,ledger:POSSyncCore.project(state),accounts});}
 function request(c,path,method='GET',etag='',payload){
  const gzip=method==='PUT'&&healthCache?.url===c.url&&healthCache?.token===c.token&&healthCache?.features?.gzipRequests===true;
  if(window.NativePOS?.nasRequest){return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timeout=setTimeout(()=>{nativePending.delete(id);reject(Error('连接超时，数据保留在本机'));},25000);nativePending.set(id,{resolve,reject,timeout});try{const args=[id,c.url,path,method,c.token,etag,payload===undefined?'':JSON.stringify(payload)];if(typeof NativePOS.nasRequestV3==='function')NativePOS.nasRequestV3(...args,gzip);else NativePOS.nasRequest(...args);}catch(e){clearTimeout(timeout);nativePending.delete(id);reject(e);}});}
  return (async()=>{const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),20000);try{
   const headers={Authorization:'Bearer '+c.token,...(method==='PUT'?{'Content-Type':'application/json','If-Match':etag}:etag?{'If-None-Match':etag}:{})};let body=payload===undefined?undefined:JSON.stringify(payload);
   if(gzip&&body?.length>1024&&typeof CompressionStream==='function'){const packed=await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();if(packed.byteLength<new TextEncoder().encode(body).length){body=packed;headers['Content-Encoding']='gzip';}}
   const r=await fetch(c.url+path,{method,cache:'no-store',redirect:'error',signal:ctrl.signal,headers,...(body===undefined?{}:{body})});if(r.status===304)return response({status:304,etag:r.headers.get('ETag'),body:null});const size=Number(r.headers.get('Content-Length'));if(size>POSSyncCore.limit)throw Error('NAS 数据超过 20MB');const text=await r.text();if(new TextEncoder().encode(text).length>POSSyncCore.limit)throw Error('NAS 数据超过 20MB');return response({status:r.status,etag:r.headers.get('ETag'),body:JSON.parse(text)});
  }finally{clearTimeout(timeout);}})();
 }
 function response(r){if(r.error)throw Error(r.error);if(r.status!==304&&(r.status<200||r.status>=300)){const e=Error(r.status===401?'同步密钥不正确':r.status===412?'NAS 版本已变化，请重试':r.body?.error||'NAS 服务响应 '+r.status);e.status=r.status;throw e;}return r;}
 function receiveNative(id,r){const pending=nativePending.get(id);if(!pending)return;clearTimeout(pending.timeout);nativePending.delete(id);try{pending.resolve(response(r));}catch(e){pending.reject(e);}}
 async function capabilities(c){if(!healthCache||healthCache.url!==c.url||healthCache.token!==c.token||Date.now()-healthCache.at>60000){const h=await request(c,'/api/health');if(h.body?.service!=='tcgshop-pos-sync'||h.body.syncVersion!==2||h.body.schema!==POSSyncCore.schema)throw Error('同步服务版本不匹配，请更新 NAS 的 POS 同步服务');healthCache={url:c.url,token:c.token,at:Date.now(),features:h.body.features||{}};}return healthCache.features;}
 function modern(){return healthCache?.features.deltaSync===1&&healthCache?.features.imageStore===1&&window.POSDelta&&window.POSAssets&&(!window.NativePOS?.nasRequest||typeof NativePOS.nasRequestV4==='function');}
 async function remote(c,etag=''){try{
  await capabilities(c);
  const conditional=etag&&healthCache.features.conditionalGet&&(!window.NativePOS?.nasRequest||typeof NativePOS.nasRequestV3==='function')?etag:'';
  const r=await request(c,'/api/shop','GET',conditional);if(!r.etag)throw Error('服务缺少 ETag，请检查反向代理配置');if(r.status===304){if(!conditional||r.etag!==conditional)throw Error('服务返回了不匹配的同步版本');return r;}if(r.body!==null)POSSyncCore.validate(r.body);return r;
 }catch(e){healthCache=null;throw e;}}
 function recoveryStore(mode,value){return new Promise((resolve,reject)=>{
  const open=indexedDB.open('TCGshop-POS-recovery',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('snapshots');
  open.onerror=()=>reject(open.error);
  open.onblocked=()=>reject(Error('快照数据库被其他窗口占用，请关闭其他窗口后重试'));
  open.onsuccess=()=>{const db=open.result;let tx;try{tx=db.transaction('snapshots',mode);const store=tx.objectStore('snapshots'),req=mode==='readwrite'?store.put(value,'latest'):store.get('latest');tx.oncomplete=()=>{db.close();resolve(req.result);};tx.onabort=()=>{db.close();reject(tx.error||Error('快照保存已取消'));};tx.onerror=()=>{};}catch(e){db.close();reject(e);}};
 });}
 async function recovery(){POSAuth.requireAdmin();const saved=await recoveryStore('readonly');return saved||localStorage.getItem(recoveryKey);}
 async function protect(local,remotePayload){
  const raw=JSON.stringify({schema:'tcgshop-pos-sync-recovery-v1',time:new Date().toISOString(),local,remote:remotePayload||null});
  // Old releases stored a full snapshot in localStorage. Remove that duplicate
  // before opening the IndexedDB transaction so an already-full WebView quota
  // cannot prevent the new snapshot from being written.
  localStorage.removeItem(recoveryKey);
  try{await recoveryStore('readwrite',raw);}catch(e){throw Error('无法保存同步前快照，已停止同步；请检查设备剩余空间后重试');}
 }
 function setBase(c,payload,etag,hash){localStorage.setItem(baseKey(c),JSON.stringify({hash,etag,storeId:payload.storeId}));localStorage.setItem(idKey,payload.storeId);}
 async function saveBase(c,payload,etag,hash){setBase(c,payload,etag,hash);await POSAssets.baseline(c.url,{etag,payload});}
 function mergeRows(remoteRows,localRows){const out=new Map((remoteRows||[]).map(row=>[row.id,clone(row)]));let added=0;for(const row of localRows||[]){if(!out.has(row.id)){out.set(row.id,clone(row));added++;}}return {rows:[...out.values()],added};}
 function mergePayload(local,remote,base){
  const merged=clone(remote);
  const same=(a,b)=>POSSyncCore.canonical(a)===POSSyncCore.canonical(b);
  // Only replay a local field when NAS has not changed it since our shared
  // baseline. Immutable business records still merge by id below.
  function fields(target,source,before,keys){if(!before)return;for(const key of keys)if(same(target[key],before[key])&&!same(source[key],before[key])){if(source[key]===undefined)delete target[key];else target[key]=clone(source[key]);}}
  if(base){
   for(const p of merged.ledger.products){const lp=local.ledger.products.find(x=>x.id===p.id),bp=base.ledger.products.find(x=>x.id===p.id);if(lp)fields(p,lp,bp,['name','code','sku','category','price','catalogCost','costRate','min','deleted','cover','symbol','tint','art']);}
   for(const u of merged.accounts.users){const lu=local.accounts.users.find(x=>x.id===u.id),bu=base.accounts.users.find(x=>x.id===u.id);if(!lu||!bu)continue;fields(u,lu,bu,['username','name','role','enabled','shopId']);const credentials=v=>({salt:v.salt,hash:v.hash,iterations:v.iterations});if(same(credentials(u),credentials(bu))&&!same(credentials(lu),credentials(bu)))Object.assign(u,credentials(lu));}
   for(const b of merged.ledger.shops){const lb=local.ledger.shops.find(x=>x.id===b.id),bb=base.ledger.shops.find(x=>x.id===b.id);if(lb){fields(b,lb,bb,['name','demo']);if(bb)for(const p of merged.ledger.products)if(b.inventory[p.id]&&lb.inventory[p.id])fields(b.inventory[p.id],lb.inventory[p.id],bb.inventory[p.id],['cost']);}}
   for(const key of ['categories','costRates']){const before=new Set(base.ledger[key]),localValues=new Set(local.ledger[key]),remoteValues=new Set(merged.ledger[key]);merged.ledger[key]=[...new Set([...remoteValues].filter(v=>!before.has(v)||localValues.has(v)).concat([...localValues].filter(v=>!before.has(v))))];}
   merged.ledger.store=merged.ledger.shops[0].name;merged.ledger.demo=merged.ledger.shops[0].demo;
   for(const p of merged.ledger.products)p.cost=p.catalogCost;
  }
  // Catalog records are keyed by id; overlapping field edits favor NAS.
  // An offline product is copied into the shared catalog and every shop.
  for(const p of local.ledger.products)if(!merged.ledger.products.some(x=>x.id===p.id))merged.ledger.products.push(clone(p));
  merged.ledger.nextSku=Math.max(local.ledger.nextSku,remote.ledger.nextSku);
  // A newly created shop must survive a merge as well; its own inventory and
  // business records are already self-consistent in the local snapshot.
  for(const ls of local.ledger.shops)if(!merged.ledger.shops.some(x=>x.id===ls.id))merged.ledger.shops.push(clone(ls));
  const users=mergeRows(merged.accounts.users,local.accounts.users);merged.accounts.users=users.rows;
  let orders=0,refunds=0,movements=0,stocktakes=0,expenses=0;
  for(const rs of merged.ledger.shops){const ls=local.ledger.shops.find(x=>x.id===rs.id);
   for(const p of merged.ledger.products)if(!rs.inventory[p.id])rs.inventory[p.id]=clone(ls?.inventory?.[p.id]||{stock:0,cost:Number(p.catalogCost??p.cost??0)});
   if(!ls)continue;
   rs.deletedRecords=[...new Map([...(rs.deletedRecords||[]),...(ls.deletedRecords||[])].map(r=>[r.kind+':'+r.id,r])).values()];
   const deletedOrders=new Set(rs.deletedRecords.filter(r=>r.kind==='order').map(r=>r.id)),deletedMovements=new Set(rs.deletedRecords.filter(r=>r.kind==='movement').map(r=>r.id));
   const om=mergeRows(rs.orders,ls.orders);rs.orders=om.rows;orders+=om.added;for(const lo of ls.orders){const ro=rs.orders.find(x=>x.id===lo.id);if(ro&&ro.refunds){const rm=mergeRows(ro.refunds,lo.refunds);ro.refunds=rm.rows;refunds+=rm.added;ro.refunded=ro.lines.every((line,i)=>ro.refunds.reduce((n,r)=>n+r.lines.filter(x=>x.lineIndex===i).reduce((q,x)=>q+x.qty,0),0)===line.qty);}}
   const mm=mergeRows(rs.movements,ls.movements);rs.movements=mm.rows;movements+=mm.added;const tm=mergeRows(rs.stocktakes,ls.stocktakes);rs.stocktakes=tm.rows;stocktakes+=tm.added;const em=mergeRows(rs.expenses,ls.expenses);rs.expenses=em.rows;expenses+=em.added;
   const remoteShop=remote.ledger.shops.find(x=>x.id===rs.id),remoteMovementIds=new Set((remoteShop?.movements||[]).map(x=>x.id));
   // For an existing shop, the remote inventory is the merge base and each
   // local-only movement contributes its delta once. A newly local-only shop
   // already carries its complete inventory snapshot, so do not apply those
   // movements a second time.
   // A receipt or movement may be deleted before ever reaching NAS. Its
   // physical stock effect survives deletion and must still be applied once.
   const remoteDeletedIds=new Set((remoteShop?.deletedRecords||[]).filter(r=>r.kind==='movement').map(r=>r.id)),baseMovementIds=new Set((base?.ledger.shops.find(b=>b.id===rs.id)?.movements||[]).map(m=>m.id));
   if(remoteShop){const pending=ls.movements.filter(m=>!deletedMovements.has(m.id)&&!remoteMovementIds.has(m.id)&&remoteShop.inventory[m.productId]);pending.push(...(ls.deletedRecords||[]).filter(r=>r.kind==='movement'&&r.productId!==undefined&&!remoteMovementIds.has(r.id)&&!remoteDeletedIds.has(r.id)&&!baseMovementIds.has(r.id)&&remoteShop.inventory[r.productId]));pending.sort((a,b)=>(Date.parse(a.time)||0)-(Date.parse(b.time)||0));const recosted=new Set();for(const m of pending){const item=rs.inventory[m.productId];if(m.unitCost!==undefined&&m.delta>0){if(!recosted.has(m.productId)){item.cost=remoteShop.inventory[m.productId].cost;recosted.add(m.productId);}const held=Math.max(0,item.stock);item.cost=Math.round((held*item.cost+m.delta*m.unitCost)/(held+m.delta));}item.stock+=m.delta;}}
   rs.orders=rs.orders.filter(o=>!deletedOrders.has(o.id));rs.movements=rs.movements.filter(m=>!deletedMovements.has(m.id));
   for(const order of rs.orders)if(order.refunded&&order.refunds.length)order.refundTime=order.refunds.reduce((latest,r)=>Date.parse(r.time)>Date.parse(latest)?r.time:latest,order.refunds[0].time);
  }
  POSSyncCore.validate(merged);return {payload:merged,added:orders+refunds+movements+stocktakes+expenses,orders,refunds,movements,stocktakes,expenses};
 }

 function apply(c,payload,etag,hash){
  POSSyncCore.validate(payload);POSAuth.validateSnapshot(payload.accounts);const incoming=clone(payload.ledger);const wanted=POSAuth.user()?.role==='staff'?(payload.accounts.users.find(u=>u.id===POSAuth.user().id)?.shopId||'shop-main'):state.activeShopId;POSSyncCore.activate(incoming,incoming.shops.some(b=>b.id===wanted)?wanted:incoming.shops[0].id);const next=validate(incoming);next.cart=(next.activeShopId===state.activeShopId?state.cart:[]).filter(l=>next.products.some(p=>p.id===l.productId&&!p.deleted)).map(l=>({...l}));const subtotal=next.cart.reduce((n,l)=>n+cartUnitPrice(l,next.products.find(p=>p.id===l.productId))*l.qty,0);next.discount=next.activeShopId===state.activeShopId?Math.min(state.discount,subtotal):0;next.payment=state.payment;validate(next);
  const entries=[[KEY,POSAssets.serialize(next)],[accountKey,JSON.stringify(payload.accounts)],[baseKey(c),JSON.stringify({hash,etag,storeId:payload.storeId})],[idKey,payload.storeId]],previous=entries.map(([k])=>[k,localStorage.getItem(k)]);
  try{for(const [k,v] of entries)localStorage.setItem(k,v);}catch(e){for(const [k,v] of previous){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch{}}throw Error('本机保存失败，NAS 数据未覆盖当前账本');}
  ledgerRaw=entries[0][1];state=next;readOnly=false;generation++;conflict=null;POSAuth.reloadSnapshot();if(POSAuth.user())render();
 }
 function editing(){const focus=document.activeElement;return !!document.querySelector('dialog[open]')||!!(focus&&(focus.matches('input,textarea,select')||focus.isContentEditable));}
 function changed(){generation++;conflict=null;if(config().edit&&POSAuth.user()){setStatus('已保存本机，等待同步');clearTimeout(timer);timer=setTimeout(()=>run('auto'),1000);}}
 function schedule(ms=30000){clearTimeout(retry);if(config().url&&POSAuth.user())retry=setTimeout(()=>run('auto'),ms);}
 function cancel(){clearTimeout(timer);clearTimeout(retry);clearTimeout(poll);generation++;}
 async function runModern(c,mode,stable,epoch){
  const localPlain=snapshot(),local=await POSAssets.prepare(localPlain),localHash=await fingerprint(local),base=baseline(c),cached=await POSAssets.baseline(c.url),shared=cached&&base&&cached.etag===base.etag&&cached.payload?.storeId===local.storeId&&await fingerprint(cached.payload)===base.hash?cached:null,prior=shared?{etag:shared.etag,payload:shared.payload.ledger.products.some(p=>p.cover?.startsWith('data:'))?await POSAssets.prepare(shared.payload):shared.payload}:null,baseHash=prior?await fingerprint(prior.payload):base?.hash;
  const r=await request(c,'/api/changes','GET',prior?prior.etag:'');if(!r.etag)throw Error('服务缺少 ETag，请检查反向代理配置');
  let incoming;if(r.status===304){if(!prior||r.etag!==prior.etag)throw Error('同步版本不匹配');incoming=prior.payload;}
  else if(r.body?.mode==='full')incoming=r.body.payload;
  else if(r.body?.mode==='delta'&&prior&&r.body.from===prior.etag)incoming=POSDelta.apply(prior.payload,r.body.patch);
  else throw Error('NAS 增量数据不正确，请重新同步');
  if(incoming!==null)POSSyncCore.validate(incoming);const remoteHash=incoming?await fingerprint(incoming):null;
  const hydrate=p=>POSAssets.hydrate(p,async id=>(await request(c,'/api/images/'+id)).body.data);
  const check=()=>{if(!stable())throw Error('本机操作发生变化，已保留并等待下次同步');};check();
  function compactLocal(){if(!readOnly&&localStorage.getItem(KEY)===ledgerRaw){const saved=POSAssets.serialize(state);if(saved!==ledgerRaw){localStorage.setItem(KEY,saved);ledgerRaw=saved;}}}
  async function savedBase(payload,etag,hash){await saveBase(c,payload,etag,hash);compactLocal();liveTag=etag;liveEpoch=configEpoch;}
  const needsImages=state.products.some(p=>p.cover?.startsWith('asset:'));
  if(r.status===304&&baseHash===localHash&&!needsImages){if(shared.payload!==prior.payload)await savedBase(prior.payload,r.etag,baseHash);else compactLocal();liveTag=r.etag;liveEpoch=configEpoch;setStatus('同步成功 · '+new Date().toLocaleTimeString());return;}
  if(incoming&&localHash===remoteHash){if(needsImages){const plain=await hydrate(incoming);check();apply(c,plain,r.etag,remoteHash);}await savedBase(incoming,r.etag,remoteHash);setStatus('同步成功 · '+new Date().toLocaleTimeString());return;}
  let direction,merged;if(incoming===null){if(base&&mode==='auto')throw Error('NAS 店铺数据为空，已停止自动上传，请检查 NAS 挂载目录');if(!base)direction='push';}
  else if(base&&base.storeId===incoming.storeId&&local.storeId===base.storeId){
   if(localHash===baseHash)direction='pull';else if(remoteHash===baseHash&&r.etag===base.etag)direction='push';
   // Upgrade an existing inline-image baseline without treating it as a second device's edit.
   else if(!prior){if(await fingerprint(localPlain)===base.hash)direction='pull';else if(r.etag===base.etag&&await fingerprint(await hydrate(incoming))===base.hash)direction='push';}
   if(!direction)merged=mergePayload(local,incoming,prior?.payload);
  }
  if(!direction&&!merged){check();conflict={c,local:localPlain,remote:await hydrate(incoming),etag:r.etag,remoteHash};setStatus(incoming?'NAS 已有其他店铺：请由管理员确认首次连接':'NAS 店铺数据为空：请检查目录或由管理员确认重建');if(mode!=='auto'&&POSAuth.isAdmin())resolveDialog();return;}
  const target=merged?.payload||(direction==='pull'?incoming:local),targetHash=await fingerprint(target),plain=await hydrate(target),remotePlain=await hydrate(incoming);check();await protect(localPlain,remotePlain);check();
  let etag=r.etag;if(direction!=='pull'){
   await POSAssets.upload(target,incoming,(id,data)=>request(c,'/api/images/'+id,'PUT','',{data}));check();
   const body=incoming?{mode:'delta',patch:POSDelta.diff(incoming,target)}:{mode:'full',payload:target};
   const saved=await request(c,'/api/changes','PUT',r.etag,body);if(!saved.etag)throw Error('上传已完成但缺少版本标识，请重试同步');etag=saved.etag;if(epoch!==configEpoch)throw Error('同步地址已变化，请重新同步');
  }
  if(direction==='pull'||merged){check();apply(c,plain,etag,targetHash);}await savedBase(target,etag,targetHash);
  setStatus('同步成功'+(merged?' · 自动合并 '+merged.added+' 条记录':'')+' · '+new Date().toLocaleTimeString());
 }
 function liveAllowed(){const c=config();return !paused&&document.visibilityState==='visible'&&navigator.onLine!==false&&POSAuth.user()&&c.url&&modern()&&healthCache?.features.liveNotifications===1&&!conflict;}
 async function listen(){clearTimeout(liveTimer);if(liveRunning||!liveAllowed())return;liveRunning=true;const c=config(),epoch=configEpoch,principal=POSAuth.user().id;let delay=250;
  try{const tag=liveEpoch===epoch?liveTag:(baseline(c)?.etag||''),r=await request(c,'/api/events','GET',tag);if(epoch!==configEpoch||POSAuth.user()?.id!==principal||!liveAllowed())return;if(!r.etag)throw Error('实时连接缺少版本标识');liveTag=r.etag;liveEpoch=epoch;if(r.status!==304){if(!busy)await run('auto');else schedule(1200);} }
  catch{delay=5000+Math.floor(Math.random()*5000);}
  finally{liveRunning=false;if(liveAllowed())liveTimer=setTimeout(listen,delay);}
 }
 async function run(mode='manual'){
  if(!POSAssets.isReady()){schedule(1000);return;}
  if(busy||(mode==='auto'&&(paused||document.visibilityState==='hidden')))return;if(!POSAuth.user()){setStatus('请先登录后同步');return;}const c=config();if(!c.url||!c.token){setStatus('未设置同步');return;}if(editing()){setStatus('等待结束当前操作后同步');schedule(5000);return;}busy=true;const start=generation,epoch=configEpoch,principal=POSAuth.user().id,rawLedger=localStorage.getItem(KEY),rawAccounts=localStorage.getItem(accountKey),rawConfig=localStorage.getItem(cfgKey);const stable=()=>!editing()&&start===generation&&epoch===configEpoch&&POSAuth.user()?.id===principal&&localStorage.getItem(KEY)===rawLedger&&localStorage.getItem(accountKey)===rawAccounts&&localStorage.getItem(cfgKey)===rawConfig;conflict=null;setStatus('正在同步 NAS…');
  try{await capabilities(c);if(modern()){await runModern(c,mode,stable,epoch);return;}const local=snapshot(),localHash=await fingerprint(local),base=baseline(c),r=await remote(c,base&&base.storeId===local.storeId&&base.hash===localHash?base.etag:'');if(!stable())throw Error('本机操作发生变化，已保留并等待下次同步');
   if(r.status===304){const saved=await POSAssets.baseline(c.url);if(!saved||saved.etag!==r.etag)await saveBase(c,local,r.etag,localHash);setStatus('同步成功 · '+new Date().toLocaleTimeString());return;}
   const remoteHash=r.body?await fingerprint(r.body):null,cached=await POSAssets.baseline(c.url),shared=cached&&base&&cached.etag===base.etag&&cached.payload?.storeId===local.storeId&&await fingerprint(cached.payload)===base.hash?cached.payload:undefined;if(!stable())throw Error('本机操作发生变化，已保留并等待下次同步');
   if(r.body&&localHash===remoteHash){await saveBase(c,r.body,r.etag,remoteHash);setStatus('同步成功 · '+new Date().toLocaleTimeString());return;}
   let direction;if(r.body===null){if(base&&mode==='auto')throw Error('NAS 店铺数据为空，已停止自动上传，请检查 NAS 挂载目录');if(!base)direction='push';}
   else if(base&&base.storeId===r.body.storeId&&local.storeId===base.storeId){if(localHash===base.hash)direction='pull';else if(remoteHash===base.hash&&r.etag===base.etag)direction='push';}
   if(!direction&&r.body&&base&&base.storeId===r.body.storeId&&local.storeId===base.storeId){await protect(local,r.body);if(!stable())throw Error('本机操作发生变化，已保留并等待下次同步');const merged=mergePayload(local,r.body,shared),mergedHash=await fingerprint(merged.payload),saved=await request(c,'/api/shop','PUT',r.etag,merged.payload);if(!saved.etag)throw Error('合并上传已完成但缺少版本标识，请重试同步');await POSAssets.cacheLedger(merged.payload.ledger);if(!stable())throw Error('本机操作发生变化，已保留并等待下次同步');apply(c,merged.payload,saved.etag,mergedHash);await saveBase(c,merged.payload,saved.etag,mergedHash);setStatus('同步成功 · 自动合并 '+merged.added+' 条销售、退款或流水 · '+new Date().toLocaleTimeString());return;}
   if(!direction){conflict={c,local,remote:r.body,etag:r.etag,remoteHash};setStatus(!r.body?'NAS 店铺数据为空：请检查目录或由管理员确认重建':'NAS 已有其他店铺：请由管理员确认首次连接');if(mode!=='auto'&&POSAuth.isAdmin())resolveDialog();return;}
   await protect(local,r.body);if(!stable())throw Error('本机操作发生变化，已保留并等待下次同步');
   if(direction==='pull'){await POSAssets.cacheLedger(r.body.ledger);if(!stable())throw Error('等待结束当前操作后同步');apply(c,r.body,r.etag,remoteHash);await saveBase(c,r.body,r.etag,remoteHash);}
   else{const saved=await request(c,'/api/shop','PUT',r.etag,local);if(!saved.etag)throw Error('上传已完成但缺少版本标识，请重试同步');if(epoch!==configEpoch)throw Error('同步地址已变化，请重新同步');await saveBase(c,local,saved.etag,localHash);}
   setStatus('同步成功 · '+new Date().toLocaleTimeString());
  }catch(e){setStatus((e.name==='AbortError'?'连接超时':e instanceof TypeError?'网络无法连接 NAS，请检查地址、网络及服务是否启动':e.message)+'（本机数据已保留）');schedule(e.status===412?1500:30000);}
  finally{busy=false;listen();if(start!==generation&&config().edit&&!conflict){clearTimeout(timer);timer=setTimeout(()=>run('auto'),1200);}}
 }
 function resolveDialog(){POSAuth.requireAdmin();if(!conflict){toast('请先立即同步以检查当前版本');return;}const choice=conflict;modal('处理 NAS 同步差异',
  '<p>自动同步已暂停，通常是首次连接到其他店铺或 NAS 数据为空。请核对两份数据并先导出差异备份，再选择要保留的数据。</p><p class="hint">'+esc(choice.local.ledger.store)+' 本机：'+choice.local.ledger.shops.reduce((n,b)=>n+b.orders.length,0)+' 笔销售 · NAS：'+(choice.remote?.ledger.shops.reduce((n,b)=>n+b.orders.length,0)||0)+' 笔销售。已建立的同一店铺会按记录编号自动合并销售、退款和库存流水，当前待结账订单仍只保存在本机。</p><div class="form-actions"><button id="nasExportRecovery">导出两份差异备份</button></div><form>'+selectField('保留的数据','nasDirection',choice.sameStore?['以 NAS 为准']:choice.remote?['以 NAS 为准','以本机为准']:['以本机为准'])+field('输入所选文字确认','nasConfirm','','text','required')+'<p id="nasResolveError" class="auth-error" role="alert"></p>'+actions('确认并同步')+'</form>');
  $('nasExportRecovery').onclick=()=>{POSAuth.requireAdmin();download(JSON.stringify({schema:'tcgshop-pos-sync-recovery-v1',time:new Date().toISOString(),local:choice.local,remote:choice.remote},null,2),'TCGshop-POS-sync-differences-'+day()+'.json');};
  const form=$('dialogBody').querySelector('form');form.querySelector('[data-cancel]')?.addEventListener('click',()=>$('dialog').close());form.onsubmit=async e=>{e.preventDefault();if(busy)return;const error=$('nasResolveError'),button=form.querySelector('[type=submit]'),direction=$('nasDirection').value;busy=true;button.disabled=true;try{POSAuth.requireAdmin();if($('nasConfirm').value!==direction)throw Error('请输入所选文字');if(config().url!==choice.c.url||config().token!==choice.c.token)throw Error('同步设置已变化，请重新检查');const fresh=await remote(choice.c);if(fresh.etag!==choice.etag)throw Error('NAS 又发生变化，请关闭窗口并重新同步');const local=snapshot(),hash=await fingerprint(local);if(hash!==await fingerprint(choice.local))throw Error('本机数据发生变化，请重新同步');POSAuth.requireAdmin();await protect(local,fresh.body);POSAuth.requireAdmin();if(await fingerprint(snapshot())!==hash)throw Error('本机数据发生变化，请重新同步');
    if(direction==='以 NAS 为准'){if(!fresh.body)throw Error('NAS 尚无店铺');await POSAssets.cacheLedger(fresh.body.ledger);if(await fingerprint(snapshot())!==hash)throw Error('本机数据发生变化，请重新同步');apply(choice.c,fresh.body,fresh.etag,await fingerprint(fresh.body));await saveBase(choice.c,fresh.body,fresh.etag,await fingerprint(fresh.body));}
    else{if(choice.sameStore)throw Error('禁止用冲突的本机数据覆盖 NAS');const saved=await request(choice.c,'/api/shop','PUT',fresh.etag,local);if(!saved.etag)throw Error('服务缺少版本标识');await saveBase(choice.c,local,saved.etag,hash);conflict=null;}
    $('dialog').close();setStatus('同步完成 · '+direction);render();
   }catch(err){if(error.isConnected)error.textContent=err.message;setStatus('同步未完成：'+err.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}};
 }
 function panel(){if(!POSAuth.isAdmin())return '<div class="panel"><h3>NAS 同步</h3><p id="nasStatus" class="hint" role="status">'+esc(status)+'</p><p class="hint">同步设置由管理员操作；同一店铺的销售、退款和库存流水会按记录编号自动合并，断网时数据保留本机。</p></div>';const c=config();return '<div class="panel nas-panel"><h3>NAS 存储与同步</h3><p class="hint">填写管理员提供的 POS 同步地址与密钥。</p>'+field('NAS 服务地址','nasUrl',c.url||'','url','placeholder="http://NAS内网IP:5689" autocomplete="off"')+field('同步密钥','nasToken',c.token||'','password','autocomplete="off" maxlength="512"')+'<div class="nas-options"><label><input type="checkbox" id="nasAutoEdit" '+(c.edit?'checked':'')+'> 保存后自动同步</label><span class="hint">打开或返回 App、切换页面时同步；支持静默实时同步；断线后自动补同步，旧 NAS 使用定时检查。</span></div><div class="account-actions"><button id="nasSave">保存设置</button><button id="nasTest">测试连接</button><button id="nasNow" class="primary">立即同步</button><button id="nasResolve" '+(conflict?'':'hidden')+'>处理同步差异</button><button id="nasRecovery">导出同步前快照</button></div><p id="nasStatus" class="hint" role="status">'+esc(status)+'</p><p class="hint">同一店铺同时修改时会自动合并销售、退款、盘库和库存流水；相同编号的记录以 NAS 版本为准，当前订单仍只保存在本机。</p></div>';}
 function wirePanel(){if(!POSAuth.isAdmin())return;const read=()=>({url:$('nasUrl').value,token:$('nasToken').value,edit:$('nasAutoEdit').checked,open:true});$('nasSave').onclick=()=>guarded(()=>{POSAuth.requireAdmin();saveConfig(read());onLogin();render();});$('nasNow').onclick=()=>guarded(()=>{POSAuth.requireAdmin();if(busy)return;saveConfig(read());run('manual');});$('nasTest').onclick=async()=>{try{POSAuth.requireAdmin();if(busy)return;const c=saveConfig(read());busy=true;setStatus('正在测试…');await remote(c);setStatus('连接成功 · POS 同步服务可用');}catch(e){setStatus('连接失败：'+e.message);}finally{busy=false;}};$('nasResolve').onclick=()=>guarded(resolveDialog);$('nasRecovery').onclick=async()=>{try{const raw=await recovery();POSAuth.requireAdmin();if(!raw)throw Error('尚无同步前快照');download(raw,'TCGshop-POS-before-nas-'+day()+'.json');}catch(e){toast(e.message);}};}
 function gateControls(setup){return '<div class="login-nas"><button type="button" id="nasLoginSync">'+(setup?'从 NAS 连接已有店铺':'从 NAS 更新账号和店铺')+'</button><p class="hint">'+(setup?'已有 NAS 店铺时请先连接，再使用已有账号登录。':'换设备或账号密码已在其他设备更新时，可从 NAS 同步。')+'</p></div>';}
 function wireGate(){if($('nasLoginSync'))$('nasLoginSync').onclick=()=>connectDialog();}
 function connectDialog(){const c=config();modal('连接 NAS 店铺','<p class="hint">填写 POS 同步服务地址和密钥，从 NAS 载入店铺和已有账号后再登录。载入前保留本机快照。</p><form>'+field('NAS 服务地址','nasConnectUrl',c.url||'','url','required autocomplete="off"')+field('同步密钥','nasConnectToken','','password','required autocomplete="off"')+'<p id="nasConnectError" class="auth-error" role="alert"></p>'+actions('连接并预览')+'</form>');const form=$('dialogBody').querySelector('form');form.querySelector('[data-cancel]').onclick=()=>$('dialog').close();form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const error=$('nasConnectError'),button=form.querySelector('[type=submit]');button.disabled=true;try{const nextConfig=prefs({url:$('nasConnectUrl').value,token:$('nasConnectToken').value,edit:true,open:true}),r=await remote(nextConfig);if(!r.body)throw Error('NAS 尚无店铺，请先在主设备创建管理员并上传');const payload=r.body,hash=await fingerprint(payload);modal('载入 NAS 店铺','<p>店铺：'+esc(payload.ledger.store)+'</p><p>'+payload.ledger.products.length+' 件商品 · '+payload.ledger.shops.reduce((n,b)=>n+b.orders.length,0)+' 笔销售 · '+payload.accounts.users.length+' 个账号</p><p class="hint">将以 NAS 店铺替换本机店铺和账号。已有本机数据会保留一份同步前快照；正式账本请先导出备份。载入后使用 NAS 中的账号密码登录。</p><form>'+field('输入「载入NAS」确认','nasLinkConfirm','','text','required')+'<p id="nasLinkError" class="auth-error" role="alert"></p>'+actions('载入并返回登录')+'</form>');const confirm=$('dialogBody').querySelector('form');confirm.querySelector('[data-cancel]').onclick=()=>$('dialog').close();confirm.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const button=confirm.querySelector('[type=submit]');button.disabled=true;try{if($('nasLinkConfirm').value!=='载入NAS')throw Error('请输入「载入NAS」');const latest=await remote(nextConfig);if(latest.etag!==r.etag)throw Error('NAS 数据变化，请重新连接');await protect({ledger:clone(state),accounts:POSAuth.snapshot(),...(readOnly?{rawLedger:localStorage.getItem(KEY)}:{}),...(!POSAuth.snapshot()?{rawAccounts:localStorage.getItem(accountKey)}:{})},payload);await POSAssets.cacheLedger(payload.ledger);saveConfig(nextConfig);apply(nextConfig,payload,r.etag,hash);await saveBase(nextConfig,payload,r.etag,hash);$('dialog').close();POSAuth.logout();setStatus('店铺已载入，请使用已有账号登录');}catch(e){if($('nasLinkError'))$('nasLinkError').textContent=e.message;}finally{busy=false;if(button.isConnected)button.disabled=false;}};
   }catch(e){if(error.isConnected)error.textContent=e.message;}finally{busy=false;if(button.isConnected)button.disabled=false;}};
 }
 function queueCheck(){if(!config().url||!POSAuth.user()||paused)return;clearTimeout(timer);timer=setTimeout(()=>run('auto'),Math.max(500,2000-(Date.now()-lastCheckAt)));}
 function randomCheck(){clearTimeout(poll);if(paused||!POSAuth.user()||!config().url)return;poll=setTimeout(async()=>{try{if(document.visibilityState==='visible'&&!conflict)await run('auto');}finally{randomCheck();}},(typeof modern==='function'&&modern()?300000:30000)+Math.floor(Math.random()*60001));}
 function onLogin(){paused=false;queueCheck();randomCheck();listen();}
 function onPage(){queueCheck();}
 function pause(){paused=true;clearTimeout(timer);clearTimeout(retry);clearTimeout(poll);clearTimeout(liveTimer);}
 function onResume(){paused=false;onLogin();}
 function wireIndicator(){const el=$('nasIndicator');if(!el)return;el.onclick=()=>{if(busy)return;run('manual').catch(e=>{setStatus('同步未完成：'+e.message);toast(e.message);});};}
 function start(){const c=config();wireIndicator();setStatus(c.url?'等待同步':'未设置同步');window.addEventListener('online',onLogin);window.addEventListener('pospause',pause);document.addEventListener('focusout',queueCheck);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')onResume();else pause();});onLogin();}
 async function restoreLedger(ledger){const c=config(),r=await POSAssets.hydrate({ledger},async id=>{if(!c.url||!c.token)throw Error('图片缓存缺失，请连接原 NAS 恢复');return (await request(c,'/api/images/'+id)).body.data;});await POSAssets.cacheLedger(r.ledger);return r.ledger;}
 return {restoreLedger,recovery,panel,wirePanel,gateControls,wireGate,changed,onLogin,onPage,onResume,pause,cancel,start,run,receiveNative,connectDialog,status:()=>status,isBusy:()=>busy};
})();
