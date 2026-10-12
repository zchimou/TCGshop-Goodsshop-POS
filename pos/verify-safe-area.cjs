const {chromium}=require('playwright');
const assert=require('assert'),fs=require('fs'),path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await require('./test-auth.cjs').prepare(p,{frame:true});
 await p.addInitScript(()=>{window.NativePOS={saveBackup(){}}});
 await p.route('https://safe-area.test/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<html><head><meta charset="UTF-8"></head><body style="margin:0;background:white"><div style="position:absolute;top:0;left:0;width:100%;height:30px;font:14px sans-serif">07:02　通知栏　　　　　　　　　100%</div><iframe id="app" style="position:absolute;border:0" src="/app/index.html"></iframe><div style="position:absolute;bottom:8px;left:40%;width:20%;height:5px;border-radius:10px;background:#777"></div></body></html>'});return;}
  const file=path.join(__dirname,url.pathname.replace('/app/',''));if(!file.startsWith(__dirname+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return;}
  await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'text/html'});
 });
 for(const s of [{w:390,h:844,t:36,b:24,l:0,r:0},{w:320,h:568,t:32,b:48,l:0,r:0},{w:1024,h:768,t:32,b:28,l:0,r:0},{w:844,h:390,t:24,b:24,l:44,r:0}]){
  await p.setViewportSize({width:s.w,height:s.h});await p.goto('https://safe-area.test/');await p.locator('#app').evaluate((el,s)=>Object.assign(el.style,{left:s.l+'px',top:s.t+'px',width:(s.w-s.l-s.r)+'px',height:(s.h-s.t-s.b)+'px'}),s);
  const app=p.frameLocator('#app');await app.locator('#scanSearch').waitFor();const bounds=await p.locator('#app').boundingBox();const title=await app.locator('#pageTitle').boundingBox();assert(title.y>=bounds.y&&title.y+title.height<=bounds.y+bounds.height);assert(await app.locator('body').evaluate(el=>getComputedStyle(el).paddingTop==='0px'));
  const toggle=app.locator('#menuToggle');if(await toggle.isVisible()){await toggle.click();const nav=await app.locator('#navigationPanel').boundingBox();assert(nav.y>=bounds.y&&nav.y+nav.height<=bounds.y+bounds.height+1);await app.locator('#closeNavigation').click();}
  else {await app.locator('#mobileCart').click();const pay=await app.locator('#checkout').boundingBox();assert(pay.y>=bounds.y&&pay.y+pay.height<=bounds.y+bounds.height);await app.locator('#closeCart').click();const bottomNav=await app.locator('.sidebar').boundingBox();assert(bottomNav.y+bottomNav.height<=bounds.y+bounds.height+1);}
  await app.locator('[data-add]').first().click();if(!await app.locator('#checkout').isVisible())await app.locator('#mobileCart').click();await app.locator('#checkout').click();const dialog=await app.locator('#dialog').boundingBox();assert(dialog.y>=bounds.y&&dialog.y+dialog.height<=bounds.y+bounds.height+1);await app.locator('#closeDialog').click();
  if(s.w===390){await app.locator('#discount').focus();await p.locator('#app').evaluate(el=>el.style.height='464px');await app.locator('#discount').fill('0');assert(await app.locator('#discount').evaluate(el=>document.activeElement===el),'keyboard resize must keep input focus');const resized=await p.locator('#app').boundingBox(),pay=await app.locator('#checkout').boundingBox();assert(pay.y+pay.height<=resized.y+resized.height+1);await p.locator('#app').evaluate(el=>el.style.height='784px');await app.locator('#closeCart').click();await p.screenshot({path:path.join(__dirname,'preview-safe-area-phone.png')});}
 }
 assert.deepEqual(errors,[]);await b.close();console.log('PASS: simulated native safe rectangles, phone/tablet/landscape cutout, header, menu, bottom navigation, fixed cart and checkout dialog remain within the usable viewport.');
})().catch(e=>{console.error(e);process.exit(1)});
