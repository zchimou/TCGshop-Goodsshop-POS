const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{
 const root=path.resolve(__dirname,'../tcgshop-android/out/v2.0.3/assets');
 assert(fs.existsSync(path.join(root,'index.html')),'Build the 2.0.3 package first');
 const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const p=await b.newPage({viewport:{width:390,height:780}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.NativePOS={saveBackup:(name,json)=>window.backup={name,json}}});
  await p.route('https://appassets.androidplatform.net/**',async r=>{
   const url=new URL(r.request().url()),f=path.resolve(root,url.pathname.replace(/^\/assets\//,''));
   if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return r.fulfill({status:404,body:''});
   await r.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.css')?'text/css':f.endsWith('.js')?'application/javascript':'text/html'});
  });
  await p.goto('https://appassets.androidplatform.net/assets/index.html');
  assert(await p.evaluate(()=>isSecureContext&&!!crypto.subtle));
  assert(await p.locator('#authForm').isVisible());
  await p.locator('#authUsername').fill('package-owner');
  await p.locator('#authName').fill('安装包测试管理员');
  await p.locator('#authPassword').fill('Package-test-2026');
  await p.locator('#authConfirm').fill('Package-test-2026');
  await p.locator('#authSubmit').click();
  await p.locator('#scanSearch').waitFor();
  assert(await p.locator('body').evaluate(e=>e.classList.contains('native-app')));
  await p.locator('[data-add="sample-0"]').click();
  await p.locator('#mobileCart').click();
  await p.locator('#checkout').click();
  await p.getByRole('button',{name:'已到账，完成收款'}).click();
  assert.equal(await p.evaluate(()=>state.orders[0].actor.username),'package-owner');
  await p.reload();
  await p.locator('#scanSearch').waitFor();
  await p.evaluate(()=>{page='settings';render();document.querySelectorAll('.settings-fold').forEach(d=>d.open=true)});
  assert((await p.locator('#main').textContent()).includes('v2.0.3 正式版'));
  await p.locator('#exportBackup').click();
  const backup=await p.evaluate(()=>window.backup);
  assert(backup.name.endsWith('.json'));
  assert.equal(JSON.parse(backup.json).orders[0].total,1500);
  assert(!backup.json.includes('Package-test-2026'));
  await p.locator('#logoutAccount').click();
  await p.reload();
  assert(await p.locator('#authForm').isVisible());
  assert.equal(await p.locator('#authConfirm').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: 2.0.3 packaged HTTPS assets, secure WebCrypto, native page mode, self-chosen admin, attributed checkout, remembered login, native backup bridge and explicit logout.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
