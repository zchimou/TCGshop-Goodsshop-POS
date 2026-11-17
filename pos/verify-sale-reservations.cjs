const assert=require('assert/strict'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await require('./test-auth.cjs').prepare(p);await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  await p.evaluate(()=>{POSSync.pause();transact(s=>{
   const item=s.products.find(p=>p.id==='sample-0'),actor=POSAuth.actor(),time=new Date().toISOString();item.stock=10;s.cart=[];s.discount=0;
   const row={id:'a'.repeat(32),token:'b'.repeat(32),number:'TEST-RESERVED',shopId:s.activeShopId,time,status:'pending',actor,note:'库存预警测试',total:item.price*6,lines:[{sku:item.sku,name:item.name,qty:6,price:item.price}],raffleNumber:1,raffleCode:''};
   s.shops.push({id:'warning-other-shop',name:'其他店铺',demo:false,inventory:Object.fromEntries(s.products.map(p=>[p.id,{stock:20,cost:p.cost}])),orders:[],expenses:[],movements:[],stocktakes:[]});
   s.pickups=[row,{...row,id:'c'.repeat(32),token:'d'.repeat(32),shopId:'warning-other-shop',raffleNumber:2},{...row,id:'e'.repeat(32),token:'f'.repeat(32),status:'cancelled',completedAt:time,completedBy:actor,raffleNumber:3},{...row,id:'1'.repeat(32),token:'2'.repeat(32),status:'redeemed',completedAt:time,completedBy:actor,raffleNumber:4}];
  });page='pos';render();});
  for(let i=0;i<4;i++)await p.locator('[data-add="sample-0"]').click();
  assert.equal(await p.locator('#currentCart [data-stock-warning]').count(),0);await p.locator('#checkout').click();await p.getByRole('heading',{name:'确认收款',exact:true}).waitFor();await p.locator('#dialog [data-cancel]').click();
  await p.locator('[data-add="sample-0"]').click();assert((await p.locator('#toast').textContent()).includes('库存预警'));
  assert.deepEqual(await p.evaluate(()=>cartStockWarnings().map(w=>[w.stock,w.reserved,w.available,w.qty])),[[10,6,4,5]]);
  for(const width of [320,390,850,1100]){await p.setViewportSize({width,height:900});await p.evaluate(()=>toggleCart(true));assert(await p.locator('#currentCart [data-stock-warning]').isVisible());assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'cart width '+width);}
  assert(await p.locator('#mobileCart').evaluate(el=>el.classList.contains('has-stock-warning')));
  await p.locator('#checkout').click();await p.getByRole('heading',{name:'库存预警，请再次确认'}).waitFor();assert.deepEqual(await p.locator('#dialog .stock-warning-values b').allTextContents(),['10','6','4','5']);
  await p.setViewportSize({width:390,height:844});assert(await p.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await p.screenshot({path:path.join(__dirname,'../tcgshop-server/out/sale-reservation-warning-phone.png'),animations:'disabled'});await p.locator('#dialog [data-cancel]').click();
  assert.equal(await p.evaluate(()=>state.orders.length),0);assert.equal(await p.evaluate(()=>product('sample-0').stock),10);
  await p.locator('[data-qty="sample-0"][data-delta="-1"]').click();assert.equal(await p.locator('#currentCart [data-stock-warning]').count(),0);assert(!await p.locator('#mobileCart').evaluate(el=>el.classList.contains('has-stock-warning')));
  await p.evaluate(()=>scanForSale('SV-001'));assert((await p.locator('#toast').textContent()).includes('库存预警'));
  await p.locator('#checkout').click();await p.getByRole('button',{name:'已了解，继续收款',exact:true}).click();await p.getByRole('heading',{name:'确认收款',exact:true}).waitFor();assert.equal(await p.evaluate(()=>state.orders.length),0);
  // A changed reservation must invalidate the acknowledgement before payment is recorded.
  await p.evaluate(()=>transact(s=>{s.pickups[0].lines[0].qty=7;s.pickups[0].total=s.pickups[0].lines[0].price*7;}));
  await p.getByRole('button',{name:'已到账，完成收款',exact:true}).click();await p.getByRole('heading',{name:'库存预警，请再次确认'}).waitFor();assert.deepEqual(await p.locator('#dialog .stock-warning-values b').allTextContents(),['10','7','3','5']);assert.equal(await p.evaluate(()=>state.orders.length),0);
  await p.getByRole('button',{name:'已了解，继续收款',exact:true}).click();await p.getByRole('button',{name:'已到账，完成收款',exact:true}).click();assert.equal(await p.evaluate(()=>state.orders.length),1);assert.equal(await p.evaluate(()=>product('sample-0').stock),5);assert.equal(await p.evaluate(()=>POSPickup.hold(product('sample-0').sku)),7);
  await p.evaluate(()=>{transact(s=>{s.pickups[0].status='cancelled';s.pickups[0].completedAt=new Date().toISOString();s.pickups[0].completedBy=POSAuth.actor();s.products.find(p=>p.id==='sample-0').stock=0;});scanForSale('SV-001');toggleCart(true);});
  await p.locator('#checkout').click();assert((await p.locator('#dialog').textContent()).includes('负库存'));await p.getByRole('button',{name:'已了解，继续收款',exact:true}).click();await p.getByRole('button',{name:'已到账，完成收款',exact:true}).click();assert.equal(await p.evaluate(()=>product('sample-0').stock),-1);assert.equal(await p.evaluate(()=>state.orders.length),2);
  assert.deepEqual(errors,[]);console.log('PASS: stock 10/reserved 6/sale 4 boundary, sale 5 persistent warning, other-store/cancelled/redeemed exclusion, phone and tablet layouts, safe cancellation, quantity reduction, scanner warning, explicit override, re-confirmation after reservation change, and negative-stock sales.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
