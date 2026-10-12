const assert=require('assert'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
  const p=await browser.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await require('./test-auth.cjs').prepare(p);
  await p.goto(process.env.POS_PREVIEW_URL||pathToFileURL(path.join(__dirname,'index.html')).href);
  assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--green').trim()),'#5261a6');
  await p.locator('[data-add="sample-0"]').click();
  const cart=await p.evaluate(()=>JSON.stringify(state.cart));
  await p.locator('#accountQuick').click();await p.getByRole('button',{name:'切换店铺',exact:true}).click();
  assert.equal(await p.evaluate(()=>JSON.stringify(state.cart)),cart,'Selecting current shop must preserve cart');
  await p.evaluate(()=>{
   transact(s=>{s.shops.push({id:'release-branch',name:'分店',demo:false,inventory:Object.fromEntries(s.products.map(p=>[p.id,{stock:0,cost:p.catalogCost}])),orders:[],expenses:[],movements:[]})});
   window.syncRescheduled=0;const original=POSSync.onLogin;POSSync.onLogin=()=>{syncRescheduled++;original()};
   POSShops.ensure();
  });
  await p.locator('#accountQuick').click();await p.locator('#activeShop').selectOption('release-branch');await p.getByRole('button',{name:'切换店铺',exact:true}).click();
  assert.equal(await p.evaluate(()=>syncRescheduled),1,'Switching shops must reschedule pending auto-sync');
  assert.equal(await p.evaluate(()=>state.cart.length),0);
  await p.locator('#accountQuick').click();await p.locator('#activeShop').selectOption('shop-main');await p.getByRole('button',{name:'切换店铺',exact:true}).click();
  await p.evaluate(()=>{addToCart('sample-0',1);addToCart('sample-1',2)});
  for(const [width,height] of [[320,568],[390,844],[768,1024],[1024,768],[844,390],[1440,900]]){
   await p.setViewportSize({width,height});
   for(const name of ['pos','products','movements','receipts','reports','settings']){
    await p.evaluate(name=>{setNavigation(false);page=name;mobileCartOpen=false;render()},name);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} horizontal overflow at ${width}`);
    if(name==='pos'){
     const search=await p.locator('#search').boundingBox(),scan=await p.locator('#scanSearch').boundingBox();
     assert(Math.abs(search.y-scan.y)<3,`Search controls must share a row at ${width}`);
     assert.equal((await p.locator('#scanSearch').innerText()).trim(),'▥ 扫码');
    }
    if(name==='pos'&&width>640){
     const box=await p.locator('#currentCart').boundingBox(),pay=await p.locator('#checkout').boundingBox();
     assert(box.y+box.height<=height+1,`Cart outside viewport ${width}x${height}`);
     assert(pay.y+pay.height<=height,`Checkout outside viewport ${width}x${height}`);
    }
   }
   await p.evaluate(()=>{page='pos';render()});
   if(width===390||width===1024||width===1440)await p.screenshot({path:path.join(__dirname,`release-${width}.png`),fullPage:true});
   if(width<=640){await p.locator('#mobileCart').click();await p.locator('#checkout').click();assert(await p.getByRole('button',{name:'已到账，完成收款'}).isVisible());await p.locator('#closeDialog').click();await p.locator('#closeCart').click();}
  }
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>{page='products';render()});await p.locator('#newProduct').click();
  await p.screenshot({path:path.join(__dirname,'release-product.png'),fullPage:true});await p.locator('#closeDialog').click();
  await p.evaluate(()=>{page='settings';render()});await p.screenshot({path:path.join(__dirname,'release-settings.png'),fullPage:true});
  await p.locator('#logoutAccount').evaluate(e=>{e.closest('details').open=true});await p.locator('#logoutAccount').click();await p.screenshot({path:path.join(__dirname,'release-login.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: same-store cart preserved, auto-sync rescheduled on switch, six viewports and all pages, accessible checkout and dialogs, release theme loaded.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
