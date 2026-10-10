const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'generic-notes-'));
 process.env.LEDGER_FILE=path.join(dir,'ledger.json');process.env.SYNC_TOKEN='test-only';
 const server=require('./server/server');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>changeSelectedDate('2026-10-10'));
  await page.locator('#redToggleBtn').click();await page.locator('#colorToggleBtn').click();
  await page.evaluate(()=>changeSelectedDate('2026-10-11'));
  assert.equal(await page.locator('#redToggleBtn').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#colorToggleBtn').getAttribute('aria-pressed'),'false');
  await page.locator('#redToggleBtn').click();await page.locator('#redToggleBtn').click();
  await page.evaluate(()=>changeSelectedDate('2026-10-10'));
  assert.equal(await page.locator('#redToggleBtn').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#colorToggleBtn').getAttribute('aria-pressed'),'true');
  await page.locator('#amount').fill('100');await page.getByText('保存这笔销售',{exact:true}).click();
  await page.locator('#expenseAmount').fill('10');await page.locator('#expenseNote').fill('原奖品备注');await page.locator('.expense-form button').click();
  await page.locator('#incomeAmount').fill('20');await page.locator('#saveIncome').click();
  const totalsBefore=await page.evaluate(()=>totals('2026-10-10'));
  const ids=await page.evaluate(()=>[...data.sales,...data.expenses].map(v=>v.id));
  for(const [i,id] of ids.entries()){
   await page.locator(`[data-record-note="${id}"]`).click();
   await page.locator('#recordNoteInput').fill(`备注${i} · <img src=x onerror=alert(1)>`);
   await page.locator('#saveRecordNote').click();
  }
  assert.deepEqual(await page.evaluate(()=>totals('2026-10-10')),totalsBefore);
  assert.equal(await page.locator('#records img').count(),0);
  assert.equal(await page.locator('#records [data-record-note]').count(),3);
  await page.locator('#dayHistory').click();assert((await page.locator('#dialogBody').textContent()).includes('原奖品备注'));assert.equal(await page.locator('#dialogBody .record').count(),3);await page.locator('#dialog .close').click();
  // Cancel does not save; clearing an expense note preserves its category.
  await page.locator(`[data-record-note="${ids[0]}"]`).click();await page.locator('#recordNoteInput').fill('取消的内容');await page.locator('#cancelRecordNote').click();
  assert(!(await page.locator('#records').textContent()).includes('取消的内容'));
  const expenseId=await page.evaluate(()=>data.expenses.find(v=>v.type!=='income').id);
  await page.locator(`[data-record-note="${expenseId}"]`).click();await page.locator('#recordNoteInput').fill('');await page.locator('#saveRecordNote').click();
  assert.equal(await page.evaluate(id=>data.expenses.find(v=>v.id===id).n,expenseId),'奖品支出');
  for(const width of [320,390,760,1100]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.evaluate(async url=>{$('serverUrl').value=url;$('syncToken').value='test-only';await sync('auto');},'http://127.0.0.1:'+server.address().port);
  assert((await page.locator('#autoSyncStatus').textContent()).startsWith('同步成功'));
  const saved=JSON.parse(fs.readFileSync(process.env.LEDGER_FILE,'utf8'));
  assert.equal(saved.redDateMarks['2026-10-10'],true);assert.equal(saved.redDateMarks['2026-10-11'],false);
  assert.equal(saved.sales[0].n,'备注0 · <img src=x onerror=alert(1)>');
  const merged=await page.evaluate(()=>{const base={sales:[],expenses:[],history:[],redDateMarks:{}};return mergeLedger(base,{...base,redDateMarks:{'2026-10-10':true}},{...base,redDateMarks:{'2026-10-11':true}}).redDateMarks;});
  assert.deepEqual(merged,{'2026-10-10':true,'2026-10-11':true});
  await page.reload();await page.evaluate(()=>changeSelectedDate('2026-10-10'));
  assert.equal(await page.locator('#redToggleBtn').getAttribute('aria-pressed'),'true');
  assert((await page.locator('#records').textContent()).includes('备注0'));
  assert.deepEqual(errors,[]);
  console.log('PASS: independent daily switches, all record notes, cancel/clear/history, totals unchanged, escaping, responsive layout, local persistence and NAS protocol round-trip');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
