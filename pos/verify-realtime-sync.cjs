const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
const {createServer}=require('../tcgshop-server/server'),delta=require('./sync-delta');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-live-')),file=path.join(dir,'shop.json'),token='live-regression-only-2026',server=createServer({file,token}),requests=[];
 server.on('request',(req,res)=>{const row={path:req.url,method:req.method,bytes:0,status:0};requests.push(row);req.on('data',c=>row.bytes+=c.length);res.on('finish',()=>row.status=res.statusCode);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+token};let browser,contexts=[];
 async function sync(page){await page.waitForFunction(()=>!POSSync.isBusy());await page.evaluate(()=>POSSync.run());const text=await page.evaluate(()=>POSSync.status());assert(text.startsWith('同步成功'),text);}
 async function sale(page){const info=await page.evaluate(()=>{page='pos';render();addToCart('sample-0',1);checkout();return {cart:state.cart,readOnly,user:POSAuth.user()?.id,toast:$('toast').textContent,dialog:$('dialog').open};});assert(info.dialog,JSON.stringify(info));await page.getByRole('button',{name:'已到账，完成收款'}).click();return page.evaluate(()=>state.orders.at(-1).id);}
 try{
  // Patches are keyed by record id; appending one record never sends all previous rows.
  const many={rows:Array.from({length:5000},(_,i)=>({id:'row-'+i,value:i})),metadata:{a:1}},next=structuredClone(many);next.rows.unshift({id:'new',value:7});next.rows[300].value=22;
  const patch=delta.diff(many,next);assert.deepEqual(delta.apply(many,patch),next);assert(JSON.stringify(patch).length<1000);
  assert.throws(()=>delta.apply({},[{op:'set',path:['__proto__','polluted'],value:true}]));assert.equal({}.polluted,undefined);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const ca=await browser.newContext(),cb=await browser.newContext();contexts=[ca,cb];const a=await ca.newPage(),b=await cb.newPage(),errors=[];for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  await require('./test-auth.cjs').prepare(a);await a.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await a.evaluate(()=>POSSync.pause());
  await a.evaluate(({url,token})=>localStorage.setItem('TCGshop-POS-nas-config-v1',JSON.stringify({url,token,edit:true,open:true})),{url,token});
  await a.evaluate(()=>{const accounts=POSAuth.snapshot();accounts.users.push({...accounts.users[0],id:'audit-staff',username:'auditstaff',name:'检查店员',role:'staff'});localStorage.setItem('TCGshop-POS-accounts-v1',JSON.stringify(accounts));POSAuth.reloadSnapshot();POSSync.changed();});
  // A real JPEG from canvas represents a migrated, existing cover.
  await a.route('**/api/health',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({service:'tcgshop-pos-sync',syncVersion:2,schema:require('./sync-core').schema,features:{conditionalGet:true,gzipRequests:true}})}));
  await a.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').fillRect(0,0,64,64);transact(s=>s.products[0].cover=c.toDataURL('image/jpeg'));});await sync(a);
  // Upgrading an inline-image baseline to delta/image storage preserves the same ledger.
  await a.unroute('**/api/health');await a.evaluate(()=>{page='settings';render();document.getElementById('nasSave').closest('details').open=true});await a.locator('#nasSave').click();await a.evaluate(()=>POSSync.pause());await sync(a);
  let stored=JSON.parse(fs.readFileSync(file)),ref=stored.ledger.products[0].cover;assert(/^asset:[a-f0-9]{64}$/.test(ref));assert(fs.existsSync(path.join(dir,'images',ref.slice(6)+'.jpg')));
  assert((await a.evaluate(()=>JSON.parse(localStorage.getItem(KEY)).products[0].cover)).startsWith('asset:'));assert(!(await a.evaluate(()=>localStorage.getItem(KEY))).includes('data:image/jpeg;base64,'));
  const backup=await a.evaluate(()=>{const original=download;let saved;download=content=>{saved=JSON.parse(content);};try{exportBackup();return saved;}finally{download=original;}});assert(backup.products[0].cover.startsWith('data:image/jpeg;base64,'));
  const legacy=await (await fetch(url+'/api/shop',{headers})).json();assert(legacy.ledger.products[0].cover.startsWith('data:image/jpeg;base64,'));
  const initial=await a.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k===KEY||k.includes('nas-base:')||k.includes('nas-config')||k.includes('store-id')||k.includes('accounts-v1')).map(k=>[k,localStorage.getItem(k)])));
  await b.addInitScript(data=>{for(const [k,v]of Object.entries(data))if(!localStorage.getItem(k))localStorage.setItem(k,v)},initial);await require('./test-auth.cjs').prepare(b);await b.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await b.evaluate(()=>POSSync.pause());await sync(b);
  // Browser cache persists across restart; no unchanged image is downloaded twice.
  let mark=requests.length;await sync(b);assert.equal(requests.slice(mark).filter(r=>r.path.startsWith('/api/images/')).length,0);assert(requests.slice(mark).some(r=>r.path==='/api/changes'&&r.status===304));
  // Two offline devices independently collect payments. Both sales and inventory deltas survive.
  await sale(a);await sale(b);await sync(a);await sync(b);await sync(a);
  for(const p of [a,b])assert.equal(await p.evaluate(()=>state.orders.length),2);
  assert.equal(await a.evaluate(()=>state.products[0].stock),34);stored=JSON.parse(fs.readFileSync(file));assert.equal(stored.ledger.shops[0].orders.length,2);
  // Refunds of different receipts while offline are merged once, including stock return movements.
  const ids=await a.evaluate(()=>state.orders.map(o=>o.id));await a.evaluate(id=>recordReturn(id,[1]),ids[0]);await b.evaluate(id=>recordReturn(id,[1]),ids[1]);await sync(a);await sync(b);await sync(a);
  assert.equal(await a.evaluate(()=>state.orders.reduce((n,o)=>n+o.refunds.length,0)),2);assert.equal(await a.evaluate(()=>state.products[0].stock),36);await sync(b);assert.equal(await b.evaluate(()=>state.products[0].stock),36);
  // Replacing a cover transfers just the new image once; restarting the App keeps its cache.
  await a.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='blue';g.fillRect(0,0,64,64);transact(s=>s.products[0].cover=c.toDataURL('image/jpeg'));});await sync(a);mark=requests.length;await sync(b);assert.equal(requests.slice(mark).filter(r=>r.path.startsWith('/api/images/')&&r.method==='GET').length,1);
  mark=requests.length;await b.reload();await b.evaluate(()=>POSSync.pause());await sync(b);assert.equal(requests.slice(mark).filter(r=>r.path.startsWith('/api/images/')).length,0);
  assert((await b.evaluate(()=>state.products[0].cover)).startsWith('data:image/jpeg;base64,'));
  // Offline account/password and catalog edits survive an unrelated remote transaction.
  await a.evaluate(()=>{const accounts=POSAuth.snapshot(),staff=accounts.users.find(u=>u.id==='audit-staff');staff.enabled=false;staff.salt='3'.repeat(32);staff.hash='4'.repeat(64);localStorage.setItem('TCGshop-POS-accounts-v1',JSON.stringify(accounts));POSAuth.reloadSnapshot();POSSync.changed();transact(s=>{s.products[0].price=1450;s.products[0].name='离线修改商品';});});
  await b.evaluate(()=>transact(s=>s.expenses.push({id:uid(),time:new Date().toISOString(),amount:100,note:'另一台设备支出',actor:POSAuth.actor()})));
  await sync(b);await sync(a);await sync(b);
  for(const p of [a,b]){assert.equal(await p.evaluate(()=>state.products[0].price),1450);assert.equal(await p.evaluate(()=>POSAuth.snapshot().users.find(u=>u.id==='audit-staff').enabled),false);assert.equal(await p.evaluate(()=>POSAuth.snapshot().users.find(u=>u.id==='audit-staff').hash),'4'.repeat(64));}
  // Version signals are silent. Remote changes arrive without manually pressing sync.
  await b.evaluate(()=>POSSync.onResume());mark=requests.length;await sale(a);await sync(a);await b.waitForFunction(()=>state.orders.length===3,{},{timeout:15000});assert(requests.slice(mark).some(r=>r.path==='/api/events'&&r.status===200));
  assert.equal(requests.slice(mark).filter(r=>r.path.startsWith('/api/images/')).length,0);
  // A dialog/focused editor defers incoming application; the pending cart is preserved.
  await b.evaluate(()=>{addToCart('sample-1',1);modal('操作中','<input id="regression-input" value="暂存价格">');});await sale(a);await sync(a);await b.waitForTimeout(1800);assert.equal(await b.evaluate(()=>state.orders.length),3);assert.equal(await b.locator('#regression-input').inputValue(),'暂存价格');await b.evaluate(()=>$('dialog').close());await b.waitForFunction(()=>state.orders.length===4,{},{timeout:15000});assert.equal(await b.evaluate(()=>state.cart.length),1);
  // Long unused devices reconnect to all records, even after the server restarts/forgets its delta history.
  await b.evaluate(()=>POSSync.pause());await sale(a);await sync(a);await b.evaluate(()=>POSSync.onResume());await b.waitForFunction(()=>state.orders.length===5,{},{timeout:15000});
  const current=await fetch(url+'/api/changes',{headers}),tag=current.headers.get('etag');assert.equal((await fetch(url+'/api/changes',{method:'PUT',headers:{...headers,'Content-Type':'application/json','If-Match':'"stale"'},body:JSON.stringify({mode:'delta',patch:[]})})).status,412);
  assert.equal((await fetch(url+'/api/events')).status,401);assert.equal((await fetch(url+'/api/images/'+ref.slice(6))).status,401);
  assert.equal((await fetch(url+'/api/images/'+ref.slice(6),{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({data:'data:image/jpeg;base64,YmFk'})})).status,400);
  const waiting=fetch(url+'/api/events',{headers:{...headers,'If-None-Match':tag}});await a.evaluate(()=>POSSync.pause());await sale(a);await sync(a);assert.equal((await waiting).status,200);
  for(const p of [a,b])await p.evaluate(()=>POSSync.pause());await sync(b);
  const stockBeforeDelete=await a.evaluate(()=>state.products[0].stock),removed=await sale(a);await a.evaluate(id=>deleteReceiptRecord(id),removed);await a.getByRole('button',{name:'确认删除',exact:true}).click();
  assert.equal(await a.evaluate(()=>state.products[0].stock),stockBeforeDelete-1);
  await b.evaluate(()=>transact(s=>s.expenses.push({id:uid(),time:new Date().toISOString(),amount:200,note:'删除期间另一台设备支出',actor:POSAuth.actor()})));await sync(b);await sync(a);await sync(b);await sync(a);
  for(const p of [a,b]){assert.equal(await p.evaluate(()=>state.orders.length),6);assert.equal(await p.evaluate(()=>state.products[0].stock),stockBeforeDelete-1);}
  async function purchase(p,qty,cost){await p.evaluate(()=>stockDialog('sample-1'));await p.locator('#stockQty').fill(String(qty));await p.locator('#stockCost').fill(String(cost));await p.locator('#stockNote').fill('双设备采购成本回归');await p.getByRole('button',{name:'确认并记录'}).click();assert.equal(await p.evaluate(()=>state.movements.at(-1).unitCost),cost*100);}
  await purchase(a,2,10);await purchase(b,3,20);const purchased=await b.evaluate(()=>({stock:state.products[1].stock,cost:state.products[1].cost}));await sync(b);await sync(a);await sync(b);await sync(a);
  for(const p of [a,b]){assert.equal(await p.evaluate(()=>state.products[1].stock),29);assert.equal(await p.evaluate(()=>state.products[1].cost),Math.round((purchased.stock*purchased.cost+2000)/(purchased.stock+2)));}
  for(const c of contexts)await c.close();contexts=[];
  // A fresh server falls back to one image-free snapshot for an unknown baseline.
  const restarted=createServer({file,token});await new Promise(r=>restarted.listen(0,'127.0.0.1',r));try{const response=await fetch('http://127.0.0.1:'+restarted.address().port+'/api/changes',{headers:{...headers,'If-None-Match':'"expired"'}});const full=await response.json();assert.equal(full.mode,'full');assert.equal(full.payload.ledger.shops[0].orders.length,6);assert(full.payload.ledger.products[0].cover.startsWith('asset:'));}finally{await new Promise(r=>restarted.close(r));}
  assert.deepEqual(errors,[]);const puts=requests.filter(r=>r.path==='/api/changes'&&r.method==='PUT');console.log(JSON.stringify({smallRecordPatchBytes:JSON.stringify(patch).length,fullFixtureBytes:JSON.stringify(next).length,incrementalUploads:puts.length,imageUploads:requests.filter(r=>r.path.startsWith('/api/images/')&&r.method==='PUT'&&r.status===200).length}));
  console.log('PASS: record deltas, concurrent payments/refunds, catalog/account/credential merge, offline receipt deletion preserves stock once, silent live delivery, dialog/cart safety, reconnection, image cache/hash verification, legacy compatibility, restart fallback, authentication and CAS.');
 }finally{for(const c of contexts)await c.close();if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
