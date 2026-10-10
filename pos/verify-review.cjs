const assert=require('assert'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await require('./test-auth.cjs').prepare(p);
  await p.goto(process.env.POS_PREVIEW_URL||pathToFileURL(path.join(__dirname,'index.html')).href);
  // Composing Chinese must keep the actual input node until compositionend.
  for(const section of ['pos','products','receipts']){
   await p.evaluate(section=>{page=section;render()},section);
   const id=section==='receipts'?'receiptSearch':'search';
   assert(await p.evaluate(id=>{
    const input=document.getElementById(id);window.reviewInput=input;
    input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='bao';
    input.dispatchEvent(new InputEvent('input',{bubbles:true,data:'bao',isComposing:true}));
    return input===document.getElementById(id);
   },id));
   await p.evaluate(id=>{const input=document.getElementById(id);input.value='宝可梦';input.setSelectionRange(3,3);input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'宝可梦'}));},id);
   assert.equal(await p.locator('#'+id).inputValue(),'宝可梦');
   assert(await p.evaluate(id=>document.activeElement===document.getElementById(id),id));
  }
  // Case-sensitive codes have the same interpretation for camera and keyboard scans.
  await p.evaluate(()=>{query='';page='pos';transact(s=>{s.products[0].code='CASE';s.products[1].code='case';});});
  await p.locator('#search').fill(' case ');await p.locator('#search').press('Enter');
  assert.deepEqual(await p.evaluate(()=>state.cart.map(l=>l.productId)),['sample-1']);
  await p.evaluate(()=>scanForSale('CASE'));
  assert.deepEqual(await p.evaluate(()=>state.cart.map(l=>l.productId)),['sample-1','sample-0']);
  const before=await p.evaluate(()=>JSON.stringify(state.cart));
  await p.locator('#search').fill('unknown-code');await p.locator('#search').press('Enter');
  assert.equal(await p.evaluate(()=>JSON.stringify(state.cart)),before);
  assert((await p.locator('#toast').innerText()).includes('未入库商品'));
  await p.evaluate(()=>{query='';render()});await p.locator('#checkout').click();await p.getByRole('button',{name:'已到账，完成收款'}).click();
  // Build an isolated second store with a sale so preview counts both stores.
  const backup=await p.evaluate(()=>{
   transact(s=>{const b=clone(s.shops[0]);b.id='review-branch';b.name='测试分店';b.demo=false;s.shops.push(b);});
   page='settings';render();return JSON.stringify(state);
  });
  const importFile=async value=>{await p.locator('#importFile').setInputFiles({name:'review-backup.json',mimeType:'application/json',buffer:Buffer.from(value)});await p.locator('#restoreText').waitFor();};
  await importFile(backup);
  assert((await p.locator('#dialogBody').innerText()).includes('2 家店铺'));
  assert((await p.locator('#dialogBody').innerText()).includes('2 笔销售'));
  assert((await p.locator('#dialogBody').innerText()).includes('全部店铺'));
  await p.locator('#restoreText').fill('恢复备份');await p.getByRole('button',{name:'替换并恢复'}).click();
  assert.equal(await p.evaluate(()=>state.shops.length),2);
  // A changed ledger while preview is open must not be silently overwritten.
  await importFile(backup);await p.evaluate(()=>transact(s=>{s.products[0].name='预览期间更新'},false));
  await p.locator('#restoreText').fill('恢复备份');await p.getByRole('button',{name:'替换并恢复'}).click();
  assert.equal(await p.evaluate(()=>state.products[0].name),'预览期间更新');
  assert((await p.locator('#toast').innerText()).includes('账本已更新'));
  await p.locator('#closeDialog').click();
  const missing=JSON.parse(backup);missing.shops=missing.shops.filter(b=>b.id!=='shop-main');
  missing.activeShopId='review-branch';missing.store='测试分店';
  await importFile(JSON.stringify(missing));await p.locator('#restoreText').fill('恢复备份');await p.getByRole('button',{name:'替换并恢复'}).click();
  assert((await p.locator('#toast').innerText()).includes('归属店铺'));
  assert.equal(await p.evaluate(()=>state.shops.length),2);await p.locator('#closeDialog').click();
  assert((await p.locator('#main').textContent()).includes('不含登录账号与同步设置'));
  assert.equal(await p.locator('.side-bottom a').count(),0);
  await p.evaluate(()=>{page='products';query='';render()});await p.locator('#newProduct').click();
  assert((await p.locator('#pCoverStatus').innerText()).includes('随商品同步'));
  await p.locator('#closeDialog').click();
  for(const [name,width,height] of [['tablet',1024,768],['phone',390,844]]){
   await p.setViewportSize({width,height});await p.evaluate(()=>{page='pos';query='';render()});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.screenshot({path:path.join(__dirname,'preview-review-'+name+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: Chinese composition, exact barcode matching, unknown-code safety, multi-store backup totals, restore race and account-store guards, copy accuracy, mobile/tablet overflow.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
