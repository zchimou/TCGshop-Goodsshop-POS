const assert=require('assert'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await require('./test-auth.cjs').prepare(page);await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  await page.evaluate(()=>{page='products';render()});assert(await page.locator('#stocktake').isVisible());const first=await page.evaluate(()=>activeProducts().slice().sort(productNameCompare).slice(0,2).map(p=>({id:p.id,before:p.stock,cost:p.cost})));
  await page.locator('#stocktake').click();assert.equal(await page.locator('[data-stocktake-index]').count(),8);
  await page.locator('[data-stocktake-index="0"]').fill(String(Math.max(0,first[0].before-2)));const delta0=Math.max(0,first[0].before-2)-first[0].before;await page.locator('[data-stocktake-index="1"]').fill(String(first[1].before+3));const expectedQty=delta0+3,expectedAmount=delta0*first[0].cost+3*first[1].cost;
  assert.equal(await page.locator('#stocktakeChanged').innerText(),'2');assert.equal(await page.locator('#stocktakeQtyDiff').innerText(),(expectedQty>0?'+':'')+expectedQty);const expectedAmountText=(expectedAmount>0?'+':expectedAmount<0?'−':'')+'¥'+(Math.abs(expectedAmount)/100).toFixed(2);assert.equal(await page.locator('#stocktakeAmountDiff').innerText(),expectedAmountText);
  await page.locator('.stocktake-form [type="submit"]').click();await page.waitForFunction(()=>state.stocktakes.length===1);
  const saved=await page.evaluate(ids=>({stocks:ids.map(id=>state.products.find(p=>p.id===id).stock),take:state.stocktakes[0],moves:state.movements.filter(m=>m.type==='盘库调整')}),first.map(p=>p.id));
  assert.deepEqual(saved.stocks,[first[0].before+delta0,first[1].before+3]);assert.equal(saved.take.lines.length,8);assert.equal(saved.take.qtyDiff,expectedQty);assert.equal(saved.take.amountDiff,expectedAmount);assert.equal(saved.moves.length,2);assert(saved.take.actor.name.includes('管理员'));
  assert(await page.locator('.stocktake-records').isVisible());await page.locator('[data-stocktake-record]').click();assert((await page.locator('#dialogBody').innerText()).includes('金额差异'));await page.locator('#stocktakeDone').click();
  assert(await page.evaluate(()=>{const payload={schema:POSSyncCore.schema,storeId:crypto.randomUUID(),ledger:POSSyncCore.project(state),accounts:POSAuth.snapshot()};POSSyncCore.validate(payload);return payload.ledger.shops.find(s=>s.id===state.activeShopId).stocktakes.length===1;}));
  assert(await page.evaluate(()=>{const old=JSON.parse(localStorage.getItem(KEY));delete old.stocktakes;for(const shop of old.shops)delete shop.stocktakes;const migrated=validate(old);return Array.isArray(migrated.stocktakes)&&migrated.shops.every(shop=>Array.isArray(shop.stocktakes));}));
  await page.reload();assert.equal(await page.evaluate(()=>state.stocktakes.length),1);assert.deepEqual(await page.evaluate(ids=>ids.map(id=>state.products.find(p=>p.id===id).stock),first.map(p=>p.id)),[first[0].before+delta0,first[1].before+3]);
  await page.evaluate(()=>{const a=POSAuth.snapshot();a.users[0].role='staff';a.users[0].shopId=state.activeShopId;localStorage.setItem('TCGshop-POS-accounts-v1',JSON.stringify(a));POSAuth.reloadSnapshot();page='products';render();});
  assert.equal(await page.locator('#stocktake').count(),0);await page.evaluate(()=>{page='movements';render()});assert.equal(await page.locator('.stocktake-records').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: admin-only stocktake, direct inventory replacement, signed quantity/value differences, detail table, movement records, reload and NAS validation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
