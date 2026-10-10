const {chromium}=require('playwright');
const {pathToFileURL}=require('url'),path=require('path'),assert=require('assert');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await require('./test-auth.cjs').prepare(p);
 await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
 await p.locator('[data-add="sample-0"]').tap();assert.equal(await p.locator('#mobileCart').textContent(),'当前订单 · 1 件¥15.00查看 / 结账 ↑');
 assert.equal(await p.locator('#checkout').isVisible(),false);await p.locator('#mobileCart').tap();assert.equal(await p.locator('#checkout').isVisible(),true);
 assert.equal(await p.locator('.sidebar').evaluate(e=>e.inert),true);
 await p.locator('[data-qty="sample-0"][data-delta="1"]').tap();await p.locator('#discount').fill('5');await p.locator('#discount').dispatchEvent('change');
 await p.screenshot({path:path.join(__dirname,'preview-phone-checkout.png')});
 await p.locator('#checkout').tap();await p.getByRole('button',{name:'已到账，完成收款'}).tap();assert.equal(await p.evaluate(()=>state.orders[0].total),2500);
 assert.equal(await p.locator('#dialog').isVisible(),false);assert.equal(await p.locator('.sidebar').evaluate(e=>e.inert),false);assert.equal(await p.locator('#checkout').isVisible(),false);
 await p.locator('#mobileCart').tap();await p.keyboard.press('Escape');assert.equal(await p.locator('#checkout').isVisible(),false);
 await p.locator('#mobileCart').tap();await p.setViewportSize({width:1024,height:768});assert.equal(await p.locator('.sidebar').evaluate(e=>e.inert),false);assert.equal(await p.locator('#checkout').isVisible(),true);
 for(const width of [320,390,600,650,768,820,1024,1280]){
  await p.setViewportSize({width,height:900});await p.evaluate(()=>{mobileCartOpen=false;render();});
  for(const section of ['pos','products','movements','receipts','reports','settings']){
   await p.evaluate(()=>setNavigation(true));await p.locator(`[data-page="${section}"]`).click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${section} ${width}`);
  }
 }
 await p.setViewportSize({width:768,height:1024});await p.evaluate(()=>setNavigation(true));await p.locator('[data-page="pos"]').click();await p.screenshot({path:path.join(__dirname,'preview-tablet-portrait.png'),fullPage:true});
 await p.setViewportSize({width:1024,height:768});await p.screenshot({path:path.join(__dirname,'preview-tablet-landscape.png'),fullPage:true});
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(__dirname,'preview-phone-pos.png'),fullPage:true});if(!await p.locator('#newProduct').count()){await p.evaluate(()=>setNavigation(true));await p.locator('[data-page="products"]').click();}await p.locator('#newProduct').tap();await p.screenshot({path:path.join(__dirname,'preview-phone-product.png')});
 assert.deepEqual(errors,[]);console.log('PASS: touch checkout drawer, quantity and discount, sale, receipt, empty order, Escape, rotation, accessibility, six pages at eight phone/tablet widths.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
