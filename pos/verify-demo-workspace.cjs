const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(6000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await require('./test-auth.cjs').prepare(p);
  await p.goto(pathToFileURL(path.resolve(__dirname,'index.html')).href);
  await p.evaluate(()=>{POSSync.pause();transact(s=>{s.store='一号店';s.products[0].name='演示来源商品';s.products[0].stock=123});page='settings';render();});
  const before=await p.evaluate(()=>localStorage.getItem(KEY));
  const card=p.locator('.settings-intro');
  await card.click({clickCount:4});assert.equal(await p.evaluate(()=>POSDemo.active),false);
  await card.click();await p.waitForSelector('#generateTrial');
  assert.deepEqual(await p.evaluate(()=>[state.store,state.products[0].name,state.products[0].stock,state.orders.length]),['一号店','演示来源商品',0,0]);
  await p.click('#generateTrial');await p.fill('#total0','6');await p.fill('#min0','2');await p.fill('#max0','2');
  assert.equal(await p.inputValue('#trialDate'),await p.evaluate(()=>day()));
  await p.locator('[data-pick="1"]').uncheck();await p.locator('[data-pick="2"]').uncheck();await p.getByRole('button',{name:'生成销售',exact:true}).click();
  await p.waitForSelector('#reportNet');assert.equal(await p.locator('#generateTrial').count(),0);
  assert.equal(await p.evaluate(()=>state.orders.length),3);
  await p.evaluate(()=>{recordReturn(state.orders[0].id,[1],'部分退');page='settings';render()});
  await p.click('#exitTrial');await p.waitForFunction(()=>window.POSDemo?.active===false && window.POSAssets?.isReady());
  assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),before);
  await p.evaluate(()=>{page='settings';render()});await card.click({clickCount:5});
  await p.waitForSelector('#trialClear');
  assert.equal(await p.evaluate(()=>state.products[0].stock),-5);
  await p.click('#trialClear');await p.getByRole('button',{name:'确认清空'}).click();
  assert.deepEqual(await p.evaluate(()=>[state.orders.length,state.products[0].stock,state.movements.length]),[0,0,0]);
  await p.click('#generateTrial');await p.locator('[data-pick="2"]').uncheck();
  await p.fill('#total0','7');await p.fill('#min0','2');await p.fill('#max0','3');await p.fill('#price0','3.50');
  await p.fill('#total1','5');await p.fill('#min1','3');await p.fill('#max1','3');await p.fill('#price1','2.00');
  await p.getByRole('button',{name:'生成销售',exact:true}).click();
  assert((await p.textContent('#toast')).includes('无法凑足'));assert.equal(await p.evaluate(()=>state.orders.length),0);
  await p.fill('#min1','4');await p.fill('#max1','2');await p.getByRole('button',{name:'生成销售',exact:true}).click();
  assert((await p.textContent('#toast')).includes('最多不能小于最少'));assert.equal(await p.evaluate(()=>state.orders.length),0);
  await p.fill('#min1','1');await p.fill('#max1','2');await p.fill('#trialStart','11:10');await p.fill('#trialEnd','12:10');await p.selectOption('#trialPayment','现金');
  await p.fill('#trialDate','2024-02-29');
  assert((await p.textContent('#trialSummary')).includes('12 件'));
  for(const width of [320,390,768,1100]){
   await p.setViewportSize({width,height:844});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'generator page '+width);
   assert(await p.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'generator dialog '+width);
  }
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(__dirname,'../tcgshop-server/out/demo-product-quantities-phone.png'),animations:'disabled'});
  await p.getByRole('button',{name:'生成销售',exact:true}).click();await p.waitForSelector('#reportNet');
  const generated=await p.evaluate(()=>({orders:state.orders,products:state.products.slice(0,2),date:reportFrom,movements:state.movements}));
  assert.equal(generated.date,'2024-02-29');assert.equal(await p.inputValue('#reportTo'),'2024-02-29');
  assert(generated.movements.every(m=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(m.time))==='2024-02-29'));
  for(const [i,total,min,max] of [[0,7,2,3],[1,5,1,2]]){
   const lines=generated.orders.flatMap(o=>o.lines).filter(l=>l.productId===generated.products[i].id);
   assert.equal(lines.reduce((n,l)=>n+l.qty,0),total);assert(lines.every(l=>l.qty>=min&&l.qty<=max));assert.equal(generated.products[i].stock,-total);
  }
  assert.equal(generated.orders.reduce((n,o)=>n+o.total,0),3450);
  for(const o of generated.orders){assert.equal(o.payment,'现金');assert.equal(o.lines.length,1);assert(Date.parse(o.time)>=Date.parse(generated.date+'T11:10:00+08:00')&&Date.parse(o.time)<=Date.parse(generated.date+'T12:10:00+08:00'));}
  await p.evaluate(()=>{page='settings';render()});await p.click('#trialClear');
  assert(await p.getByRole('button',{name:'确认清空'}).isDisabled(),'today should contain no generated orders');
  await p.fill('#clearDate','2024-02-29');await p.getByRole('button',{name:'确认清空'}).click();
  assert.deepEqual(await p.evaluate(()=>[state.orders.length,state.products[0].stock,state.products[1].stock,state.movements.length]),[0,0,0,0]);
  const pickup=await p.evaluate(async()=>{
    reportFrom=reportTo=day();
    transact(s=>{s.products[0].stock=3;});
    const r=await POSSync.pickup({action:'create',id:uid().replaceAll('-',''),shopId:state.activeShopId,note:'本地',lines:[{sku:state.products[0].sku,qty:2,price:200}],raffleCode:'21'});
    const req={action:'redeem',code:POSPickupCore.qr(r.pickup),shopId:state.activeShopId};
    await POSSync.pickup(req);await POSSync.pickup(req);
    return [state.orders.length,state.products[0].stock,reportTotals().pickupNet];
  });assert.deepEqual(pickup,[1,1,400]);
  await p.evaluate(()=>{page='pickups';render()});await p.click('#pickupClearRaffle');
  await p.getByRole('button',{name:'确认清空全部抽奖码',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#dialog').open);
  assert(await p.evaluate(()=>state.pickups.every(r=>POSPickupCore.raffle(r)==='')));
  assert.deepEqual(await p.evaluate(()=>[state.orders.length,state.products[0].stock,reportTotals().pickupNet]),[1,1,400]);
  assert.equal(await p.evaluate(()=>localStorage.getItem('TCGshop-POS-ledger-v1')),before);assert.deepEqual(errors,[]);console.log('PASS demo per-product exact totals, bounded random batches, fixed batches, invalid range/partition rejection, amounts/time/payment, four screen widths, isolation, cleanup, stock rollback and local redemption');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

