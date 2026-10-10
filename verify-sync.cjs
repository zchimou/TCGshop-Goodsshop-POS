const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'generic-sync-test-'));process.env.LEDGER_FILE=path.join(dir,'ledger.json');process.env.SYNC_TOKEN='test-only';
 const server=require('./server/server');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer test-only'};
 let browser;
 try{
  assert.equal((await fetch(url+'/api/backup')).status,401);
  const initial=await fetch(url+'/api/backup',{headers}),tag=initial.headers.get('etag');
  const ledger={sales:[],expenses:[],history:[]};
  const put=()=>fetch(url+'/api/backup',{method:'PUT',headers:{...headers,'Content-Type':'application/json','If-Match':tag},body:JSON.stringify(ledger)});
  assert.deepEqual((await Promise.all([put(),put()])).map(r=>r.status).sort(),[200,412]);
  assert.equal((await fetch(url+'/api/backup',{method:'PUT',headers,body:JSON.stringify(ledger)})).status,428);
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(({url})=>{$('serverUrl').value=url;$('syncToken').value='test-only';localStorage.setItem('generic-auto-sync',JSON.stringify({edit:true,open:true}));},{url});
  await page.locator('#amount').fill('100');await page.getByText('保存这笔销售',{exact:true}).click();
  await page.waitForFunction(()=>$('autoSyncStatus').textContent.startsWith('同步成功'));
  let saved=await (await fetch(url+'/api/backup',{headers})).json();assert.equal(saved.sales[0].a,100);
  // A second device adds a different record. Opening the app must retain both.
  let remote=await fetch(url+'/api/backup',{headers});saved=await remote.json();saved.sales.push({...saved.sales[0],id:'remote-sale',a:250});
  await fetch(url+'/api/backup',{method:'PUT',headers:{...headers,'If-Match':remote.headers.get('etag')},body:JSON.stringify(saved)});
  await page.reload();await page.waitForFunction(()=>data.sales.length===2&&$('autoSyncStatus').textContent.startsWith('同步成功'));
  // Explicitly check conflicting edits, deletion reconciliation and first sync.
  const checked=await page.evaluate(()=>{
   const row={id:'a',a:100},base={sales:[row],expenses:[],history:[]};
   let conflicts=0;try{mergeLedger(base,{...base,sales:[{...row,a:200}]},{...base,sales:[{...row,a:300}]})}catch{conflicts++}
   try{mergeLedger(null,{...base,sales:[],history:[{action:'delete',kind:'sales',record:row}]},base)}catch{conflicts++}
   return {conflicts,deleted:mergeLedger(base,{...base,sales:[]},base).sales.length};
  });assert.deepEqual(checked,{conflicts:2,deleted:0});
  await page.route('**/api/health',r=>r.abort());
  await page.locator('#amount').fill('50');await page.getByText('保存这笔销售',{exact:true}).click();
  await page.waitForFunction(()=>$('autoSyncStatus').textContent.includes('本机数据已保留'));
  assert.equal(await page.evaluate(()=>data.sales.length),3);
  await page.unroute('**/api/health');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>$('autoSyncStatus').textContent.startsWith('同步成功'));
  assert.equal((await (await fetch(url+'/api/backup',{headers})).json()).sales.length,3);
  await page.locator('#incomeAmount').fill('88');await page.locator('#incomeNote').fill('补贴同步');await page.locator('#saveIncome').click();
  await page.waitForFunction(()=>$('autoSyncStatus').textContent.startsWith('同步成功'));
  const income=(await (await fetch(url+'/api/backup',{headers})).json()).expenses.find(v=>v.type==='income');assert.equal(income.a,88);assert.equal(income.n,'额外收入 · 补贴同步');
  await page.reload();await page.waitForFunction(()=>$('autoSyncStatus').textContent.startsWith('同步成功'));assert.equal(await page.locator('#incomeTotal').textContent(),'¥88.00');
  assert.deepEqual(errors,[]);console.log('PASS: auth, concurrent version checks, auto-save upload, launch merge, conflicts, offline/reconnect, extra income round-trip');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
