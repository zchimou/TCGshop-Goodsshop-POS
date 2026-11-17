const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1000,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await require('./test-auth.cjs').prepare(p);await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  await p.evaluate(()=>{POSSync.pause();page='products';render();});
  const ledger=await p.evaluate(()=>localStorage.getItem(KEY));
  await p.click('#pickupOrders');await p.click('#pickupRaffle');
  await p.evaluate(()=>{window.raffleOldPickups=state.pickups;state.pickups=[{shopId:state.activeShopId,status:'pending',raffleCode:'201'},{shopId:state.activeShopId,status:'redeemed',raffleCode:'202'},{shopId:state.activeShopId,status:'cancelled',raffleCode:'203'},{shopId:'other',status:'pending',raffleCode:'204'}]});
  await p.click('#raffleUseOrders');assert.equal(await p.inputValue('#raffleNumbers'),'201，202');await p.evaluate(()=>state.pickups=window.raffleOldPickups);
  await p.locator('.raffle-name').fill('补充包');await p.locator('.raffle-qty').fill('2');
  await p.click('#raffleAdd');await p.locator('.raffle-name').nth(1).fill('卡套');
  await p.fill('#raffleNumbers','1，1');await p.getByRole('button',{name:'随机抽奖',exact:true}).click();
  assert((await p.textContent('#raffleError')).includes('超过'));
  await p.fill('#raffleNumbers','1 - 5，3，8');
  for(const width of [320,390,768,1100]){
   await p.setViewportSize({width,height:850});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page width '+width);
   assert(await p.locator('#dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+2),'dialog width '+width);
  }
  await p.evaluate(()=>document.querySelector('#raffleError').textContent='');
  await p.screenshot({path:path.join(__dirname,'../tcgshop-server/out/raffle-setup.png'),animations:'disabled'});
  await p.getByRole('button',{name:'随机抽奖',exact:true}).click();
  const winners=await p.locator('.raffle-result b').allTextContents();
  assert.equal(winners.length,3);assert.equal(new Set(winners).size,3);assert(winners.every(n=>['1','2','3','4','5','8'].includes(n)));
  assert((await p.textContent('#dialogBody')).includes('6 个参与号码'));
  assert.equal(await p.locator('#dialogBody > p').first().textContent(),await p.evaluate(()=>time(JSON.parse(localStorage.getItem('TCGshop-raffle:'+state.activeShopId)).time)));
  await p.click('#raffleDone');await p.reload();await p.evaluate(()=>{POSSync.pause();page='pickups';render()});await p.click('#pickupRaffle');
  assert.deepEqual(await p.locator('.raffle-result b').allTextContents(),winners);
  assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),ledger);
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(__dirname,'../tcgshop-server/out/raffle-results-phone.png'),animations:'disabled'});
  await p.click('#raffleNew');await p.locator('.raffle-name').fill('单卡');await p.fill('#raffleNumbers','10-12');
  await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.includes('TCGshop-raffle:'))throw Error('保存失败测试');return original.call(this,k,v)}});
  await p.getByRole('button',{name:'随机抽奖',exact:true}).click();assert((await p.textContent('#raffleError')).includes('保存失败'));
  await p.reload();await p.evaluate(()=>{POSSync.pause();page='settings';render()});await p.locator('.settings-intro').click({clickCount:5});
  await p.waitForSelector('#generateTrial');await p.evaluate(()=>POSRaffle.open());assert.equal(await p.locator('#raffleForm').count(),1);
  await p.click('#closeDialog');await p.click('#exitTrial');await p.waitForFunction(()=>window.POSDemo?.active===false&&window.POSAssets?.isReady());
  await p.evaluate(()=>{POSSync.pause();POSRaffle.open()});assert.deepEqual(await p.locator('.raffle-result b').allTextContents(),winners);
  assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),ledger);
  await p.click('#raffleDone');await p.evaluate(()=>{page='pickups';render()});await p.click('#pickupClearRaffle');
  assert((await p.textContent('#dialogBody')).includes('所有店铺'));await p.locator('#clearRaffleForm [data-cancel]').click();
  assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),ledger);
  assert.deepEqual(errors,[]);console.log('PASS raffle: time-only heading, clear confirmation/cancel, unique winners, ranges/deduplication, overcapacity, persistence/reload, storage failure, formal/demo isolation, unchanged ledger and responsive layouts.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
